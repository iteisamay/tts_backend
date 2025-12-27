import textToSpeech from "@google-cloud/text-to-speech";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import pgClient from "../db/pgClient.js";
import QRCode from "qrcode";
import sharp from "sharp";
import { chunkText } from '../utils/chunk.js';
import { randomName } from '../utils/randomName.js';
import { slugify } from '../utils/slug.js';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import example from "../utils/exampleResponse.js";
import { configDotenv } from "dotenv";
configDotenv()

const S3_BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION;
const minmum_char = 10;

const s3 = new S3Client({ region: REGION });

const gcpTTSClient = new textToSpeech.TextToSpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const createTts = async (req, res) => {
  const { title, text, tone = "default", voice = "bn-IN-Wavenet-A", language = "bn-IN", speakingRate = 1.0, pitch = 0.0 } = req.body;
  try {

    const chunks = chunkText(text);
    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      const input = { text: chunks[i] };

      const voiceParams = {
        languageCode: language,
        name: voice
      };

      const audioConfig = {
        audioEncoding: 'MP3',
        speakingRate,
        pitch
      };

      const request = {
        input,
        voice: voiceParams,
        audioConfig
      };

      const [response] = await gcpTTSClient.synthesizeSpeech(request);

      if (!response || !response.audioContent) {
        throw new Error('No audio returned from Google TTS');
      }

      let chunkBuffer;
      if (Buffer.isBuffer(response.audioContent)) {
        chunkBuffer = response.audioContent;
      } else {
        chunkBuffer = Buffer.from(response.audioContent, 'base64');
      }

      audioBuffers.push(chunkBuffer);
    }

    const finalAudio = Buffer.concat(audioBuffers);

    const audioKey = `audio/${randomName(title ? slugify(title) : "news", "mp3")}`;

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: audioKey,
      Body: finalAudio,
      ContentType: "audio/mpeg"
    }));

    const audioUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: audioKey,
    }), { expiresIn: 24 * 60 * 60 }); // 1 year

    const qrBuffer = await QRCode.toBuffer(audioUrl, { type: "png", width: 400 });

    const qrKey = `qr/${randomName("qr", "png")}`;

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: qrKey,
      Body: qrBuffer,
      ContentType: "image/png"
    }));

    const qrUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: qrKey,
    }), { expiresIn: 24 * 60 * 60 });//1 year


    return res.json({
      success: true,
      audio: { key: audioKey, url: audioUrl },
      qr: { key: qrKey, url: qrUrl },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "server error" });
  }

  // await new Promise(resolve => setTimeout(resolve, 1000));
  // return res.json(example);
};

const createSpeechOnly = async (req, res) => {
  const {
    text,
    language = "bn-IN",
    voice = "bn-IN-Wavenet-A",
    speakingRate = 1.0,
    pitch = 0.0
  } = req.body;

  try {
    const chunks = chunkText(text);
    const audioBuffers = [];

    for (const chunk of chunks) {
      const processedText = await applyCustomPronunciation(chunk);
      const ssmlPayload = `<speak>${processedText}</speak>`;
      const [response] = await gcpTTSClient.synthesizeSpeech({
        input: { ssml: ssmlPayload },
        voice: {
          languageCode: language,
          name: voice
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate,
          pitch
        }
      });
      const buffer = Buffer.isBuffer(response.audioContent)
        ? response.audioContent
        : Buffer.from(response.audioContent, "base64");

      audioBuffers.push(buffer);
    }

    const finalAudio = Buffer.concat(audioBuffers);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", finalAudio.length);
    res.setHeader("Content-Disposition", "inline; filename=tts.mp3");

    return res.send(finalAudio);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "TTS failed" });
  }
};



const finalizeTts = async (req, res) => {
  try {
    const { title, text, audioKey } = req.body;

    if (!audioKey) {
      return res.status(400).json({ msg: "Audio key missing" });
    }

    const audioUrl = `https://s3.${REGION}.amazonaws.com/${S3_BUCKET}/${audioKey}`;

    // 🔲 Generate QR
    // const qrBuffer = await QRCode.toBuffer(audioUrl, {
    //   width: 400,
    //   type: "png"
    // });
    // const qrBuffer = await generateCmykQr(audioUrl);

    // const qrKey = `qr/${randomName("qr", "png")}`;

    // await s3.send(
    //   new PutObjectCommand({
    //     Bucket: S3_BUCKET,
    //     Key: qrKey,
    //     Body: qrBuffer,
    //     ContentType: "image/png"
    //   })
    // );

    const qrBuffer = await generateCmykQr(audioUrl);

    // Explicitly use .jpg in the key name
    const qrKey = `qr/${randomName("qr", "jpg")}`;

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: qrKey,
      Body: qrBuffer,
      ContentType: "image/jpeg" // MIME type remains image/jpeg for .jpg files
    }));

    const qrUrl = `https://s3.${REGION}.amazonaws.com/${S3_BUCKET}/${qrKey}`;

    // 💾 Save DB
    await pgClient.query(
      'INSERT INTO tbl_tts_record (title, tts_text, audio_key,audio_url, qr_key,qr_url) VALUES ($1, $2, $3, $4, $5, $6)',
      [title, text, audioKey, audioUrl, qrKey, qrUrl]
    );

    res.json({
      msg: "TTS saved",
      audioKey,
      qrKey
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Finalize failed" });
  }
};


const getAudioPresignedUrl = async (req, res) => {
  try {
    const contentType = "audio/mpeg"
    const currentDateTime = Date.now();
    const audioKey = `audio/${currentDateTime}.mp3`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: audioKey,
    });
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: 60 * 5 // 5 minutes
    });

    res.json({
      uploadUrl,
      audioKey
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to create presigned URL" });
  }
};



/**
 * Saves Text-to-Speech data to the database
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
const saveTtsToDb = async (req, res) => {
  /** 
   * @type {{title: string, text: string, audioKey: string, audioUrl: string, qrKey: string, qrUrl: string}} 
   */
  const { title, text, audioKey, audioUrl, qrKey, qrUrl } = req.body;

  const query = `
    INSERT INTO tbl_tts_record (title, tts_text, audio_key, audio_url, qr_key, qr_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  try {
    await pgClient.query(query, [title, text, audioKey, audioUrl, qrKey, qrUrl]);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return res.status(200).json({ msg: "Data Saved" });
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ msg: 'Database error', error: error.message });
  }
};

/**
 * Fetch paginated TTS records with optional date filtering
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getPaginatedTtsRecords = async (req, res) => {
  try {
    let { start_date, end_date, page_length, page_number } = req.body;

    const limit = Number(page_length) || 10;
    const page = Number(page_number) || 1;
    const offset = (page - 1) * limit;

    let dataQuery = '';
    let countQuery = '';
    let params = [];

    //If date range provided
    if (start_date && end_date) {
      dataQuery = `
        SELECT *
        FROM tbl_tts_record
        WHERE DATE(tts_time) BETWEEN $1 AND $2
        ORDER BY tts_time DESC
        LIMIT $3 OFFSET $4;
      `;

      countQuery = `
        SELECT COUNT(*) AS total
        FROM tbl_tts_record
        WHERE DATE(tts_time) BETWEEN $1 AND $2;
      `;

      params = [start_date, end_date, limit, offset];
    }
    // No date filter with pagenation
    else {
      dataQuery = `
        SELECT *
        FROM tbl_tts_record
        ORDER BY tts_time DESC
        LIMIT $1 OFFSET $2;
      `;

      countQuery = `
        SELECT COUNT(*) AS total FROM tbl_tts_record;
      `;

      params = [limit, offset];
    }


    // const dataResult = await pgClient.query(dataQuery, params);
    const [dataResult, countResult] = await Promise.all([
      pgClient.query(dataQuery, params),
      pgClient.query(countQuery, start_date && end_date ? [start_date, end_date] : [])
    ]);

    const totalRecords = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      msg: 'Data fetched successfully',
      data: dataResult.rows,
      pagination: {
        current_page: page,
        page_length: limit,
        total_pages: totalPages,
        total_records: totalRecords
      },
    });

  } catch (error) {
    console.error('Error fetching paginated records:', error);
    return res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

/**
 * Updates TTS audio buffer in S3 with new content
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
const updateTtsSpeech = async (req, res) => {
  const { tts_id, text, tone = "default", voice = "bn-IN-Wavenet-A", language = "bn-IN", speakingRate = 1.0, pitch = 0.0 } = req.body;

  try {
    if (!tts_id) {
      return res.status(400).json({ error: "TTS ID is required" });
    }

    if (!text || text.length < minmum_char) {
      return res.status(400).json({ error: `Minimum ${minmum_char} characters required` });
    }




    const chunks = chunkText(text);
    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      const input = { text: chunks[i] };

      const voiceParams = {
        languageCode: language,
        name: voice
      };

      const audioConfig = {
        audioEncoding: 'MP3',
        speakingRate,
        pitch
      };

      const request = {
        input,
        voice: voiceParams,
        audioConfig
      };

      const [response] = await gcpTTSClient.synthesizeSpeech(request);


      if (!response || !response.audioContent) {
        throw new Error('No audio returned from Google TTS');
      }

      let chunkBuffer;
      if (Buffer.isBuffer(response.audioContent)) {
        chunkBuffer = response.audioContent;
      } else {
        chunkBuffer = Buffer.from(response.audioContent, 'base64');
      }

      audioBuffers.push(chunkBuffer);
    }
    const ttsRecord = await pgClient.query('SELECT audio_key FROM tbl_tts_record WHERE tts_id = $1', [tts_id]);
    const audioKey = ttsRecord.rows[0].audio_key;

    //update the tts_text in databse
    await pgClient.query('UPDATE tbl_tts_record SET tts_text = $1 WHERE tts_id = $2', [text, tts_id]);

    const finalAudio = Buffer.concat(audioBuffers);

    // Update the buffer in S3 with the same key
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: audioKey,
      Body: finalAudio,
      ContentType: "audio/mpeg"
    }));

    const audioUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: audioKey,
    }), { expiresIn: 24 * 60 * 60 }); // 1 day

    return res.json({
      success: true,
      message: "Audio buffer updated successfully",
      audio: { key: audioKey, url: audioUrl }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "server error" });
  }
};


/**
 * Proxy download endpoint to bypass CORS restrictions
 */
const downloadProxy = async (req, res) => {
  const { url, filename } = req.query;

  try {
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch resource: ${response.statusText}`);
    }

    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';

    const sanitizedFilename = filename
      ? filename.replace(/[\r\n\t]/g, '').trim()
      : 'download';

    const encodedFilename = encodeURIComponent(sanitizedFilename);

    // ✅ FORCE DOWNLOAD DIALOG
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="file"; filename*=UTF-8''${encodedFilename}`
    );

    // Stream response
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('Download proxy error:', error);
    res.status(500).json({
      error: 'Failed to download file: ' + error.message
    });
  }
};

/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const saveCustomSpeech = async (req, res) => {
  /** @type {{word:String ,speech:String}} */
  const { word, speech } = req.body;
  const insertQuery = 'INSERT INTO tts_custom (word, speech) VALUES ($1, $2) RETURNING *';
  try {
    const result = await pgClient.query(insertQuery, [word, speech]);
    return res.status(200).send({ msg: 'Custom speech saved successfully', data: result.rows });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}


/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const getAllCustomeSpeech = async (req, res) => {
  const selectQuery = 'SELECT * FROM tts_custom';
  try {
    const result = await pgClient.query(selectQuery);
    return res.status(200).send({ msg: 'Custom speech fetched successfully', data: result.rows });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}


/**
 * Cleans and applies custom pronunciations using SSML <sub> tags.
 */
const applyCustomPronunciation = async (text) => {
  const rawDictionary = await getAllCustomeSpeechAsDictionary();
  const sortedWords = Object.keys(rawDictionary).sort((a, b) => b.length - a.length);

  let processedText = text;

  for (const word of sortedWords) {
    const pronunciation = rawDictionary[word].replace(/[\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000]/g, " ");
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![\\u0980-\\u09FF])${escapedWord}(?![\\u0980-\\u09FF])`, 'g');
    processedText = processedText.replace(regex, `<sub alias="${pronunciation}">${word}</sub>`);
  }
  return processedText;
};

const getAllCustomeSpeechAsDictionary = async () => {
  const selectQuery = 'SELECT * FROM tts_custom';
  try {
    const result = await pgClient.query(selectQuery);
    const dictionary = result.rows.reduce((acc, row) => {
      acc[row.word] = row.speech;
      return acc;
    }, {});
    return dictionary;
  } catch (error) {
    console.log(error);
    return error;
  }
}


const generateCmykQr = async (audioUrl) => {
  // 1. Generate QR as a high-quality Buffer
  const qrPngBuffer = await QRCode.toBuffer(audioUrl, {
    width: 600,
    margin: 1,
    errorCorrectionLevel: 'L',
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  return await sharp(qrPngBuffer)
    .greyscale()
    .threshold(128)
    .toColourspace('cmyk')
    .jpeg({
      quality: 100,
      chromaSubsampling: '4:4:4',
      trellisQuantisation: true,
      overshootDeringing: true
    })
    .toBuffer();
};







export { createTts, saveTtsToDb, getPaginatedTtsRecords, updateTtsSpeech, downloadProxy, createSpeechOnly, getAudioPresignedUrl, finalizeTts, saveCustomSpeech, getAllCustomeSpeech };
