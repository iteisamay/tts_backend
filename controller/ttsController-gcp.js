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
import { parseFile } from 'music-metadata';
import { configDotenv } from "dotenv";
import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatLocalISO } from "../utils/utils.js";
import createAdminLog from "../utils/logWriter.js";
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { streamToBuffer } from "../utils/steamToBuffer.js";
import { getElevenLabsCredits } from "../utils/getElevenLabsCredit.js";
import { generatePublicToken } from "../utils/crypto.js";


import { execa } from "execa";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { readFile, writeFile, unlink } from "fs/promises";


configDotenv()

const S3_BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION;
const minmum_char = 10;

const elevenLabClient = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY_2 });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QR_FOLDER = path.resolve(__dirname, '..', '..', 'uploads', 'qr');
const s3 = new S3Client({ region: REGION });
const DEFAULT_FILE_NAME = 'under_process_audio.mp3';
const AUDIO_UPLOAD_BASE_PATH = path.join(__dirname, '..', '..', 'uploads', 'audios');

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

const createTts_forFirst = async (req, res) => {
  const { title, text, user_code = 'test', pk_frontend } = req.body;
  if (!title || title.trim() == "" || !text || text.trim() == "") {
    return res.status(500).send({ msg: "Please provide valid data." });
  }
  const insertQ = 'insert into tbl_tts_record(tts_id,title,tts_text,frontend_pk,audio_key,qr_key,public_token) values ($1,$2,$3,$4,$5,$6,$7);'
  try {
    const nextId = await getNextVal();
    const tts_id = `TTS${nextId}`;

    const default_audio = DEFAULT_FILE_NAME;
    const public_token = generatePublicToken();
    const QR_LINK = `${process.env.USER_PORTAL}/audio/${public_token}`;
    const qrBuffer = await generateCmykQr(QR_LINK);
    let { fileName } = await saveQRImage(qrBuffer, title.substring(0, 50));

    const { rows } = await pgClient.query(insertQ, [tts_id, title, text, pk_frontend, default_audio, fileName, public_token]);
    createAdminLog(`NEW STORY UPLOADED ID: ${tts_id}`, user_code);
    console.log(rows);
    return res.status(200).send({ msg: "Data Submitted for qr generation." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "server error" });
  }
};


const createTts_forUpdate = async (req, res) => {
  const { title, text, user_code = 'test', pk_frontend } = req.body;
  if (!pk_frontend || !title?.trim() || !text?.trim()) {
    return res.status(400).send({ msg: "Please provide valid data." }); // 400 is better for validation errors
  }
  const updateQ = `
    UPDATE tbl_tts_record 
    SET title = $1, 
        tts_text = $2, 
        tts_generated = $3, 
        tts_mod_time = NOW()
    WHERE frontend_pk = $4 
    RETURNING tts_id;`;

  try {
    const { rows } = await pgClient.query(updateQ, [title, text, 'NEED TO UPDATE', pk_frontend]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Record not found with provided ID." });
    }
    const id = rows[0].tts_id;
    await createAdminLog(`STORY UPDATED ID: ${id}`, user_code);
    return res.status(200).send({
      msg: "Data Submitted for story update.",
      tts_id: id
    });
  } catch (err) {
    console.error("Database Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Saves Text-to-Speech data to the database
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
const getQrAudioByFrontendKey = async (req, res) => {
  const { id } = req.body;
  if (!id || isNaN(id)) {
    return res.status(500).send({ msg: "Invalid ID." });
  }

  const getDataQ = "select audio_key,qr_key from tbl_tts_record where frontend_pk = $1 and (tts_generated='YES' or tts_generated='COMPLETED');";
  try {
    const { rows, rowCount } = await pgClient.query(getDataQ, [id]);
    if (rowCount == 0) {
      return res.status(500).send({ msg: "TTS GENERATION NOT COMPLETTE", data: null });
    }
    const audioKey = `${process.env.BACKEND_ASSET_PORTAL}/audio/${rows[0]["audio_key"]}`;
    const qrKey = `${process.env.BACKEND_ASSET_PORTAL}/qr/${rows[0]["qr_key"]}`;
    console.log({ audioKey, qrKey });
    return res.status(200).send({ data: { audioKey, qrKey } });
  } catch (error) {
    return res.status(500).send({ msg: "Error: " + error });
  }

}

const createSpeechOnLlmNumber = async (req, res) => {
  let { llm_name, text, user_code = "test",id } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }
  llm_name = parseInt(llm_name);
  if (llm_name === 1) {
    // createSpeechOnly(req,res);
    const updateQ="update tbl_tts_record set tts_text=$1, tts_generated='SET FOR GENERATION', llm_name='GOOGLE_API' where tts_id=$2;";
    const {rowCount}=await pgClient.query(updateQ,[text,id]);
    if(rowCount===1){
      return res.status(200).send({ msg: "Audio is set to generate." });
    }else{
      return res.status(500).send({msg:"Error while set to generate."});
    }

  } else if (llm_name === 2) {
    // createSpeechOnlyWithElevenLabs(req,res);
     const updateQ="update tbl_tts_record set tts_text=$1, tts_generated='SET FOR GENERATION', llm_name='ELEVENLAB_API' where tts_id=$2;";
    const {rowCount}=await pgClient.query(updateQ,[text,id]);
    if(rowCount===1){
      return res.status(200).send({ msg: "Audio is set to generate." });
    }else{
      return res.status(500).send({msg:"Error while set to generate."});
    }
  } else {
    res.status(500).json({
      error: "Select a llm to generate speech",
    });
  }
}

const createSpeechOnly = async (req, res) => {
  const {
    text,
    language = "bn-IN",
    voice = "bn-IN-Wavenet-A",
    pitch = 1.3,
    speakingRate = 1.18,
    user_code = 'test'
  } = req.body;

  try {
    const chunks = chunkText(text);
    const audioBuffers = [];

    for (const chunk of chunks) {
      const processedText = await applyCustomPronunciation(chunk);
      const ssmlPayload = `<speak><prosody pitch="-2st">${processedText}</prosody></speak>`;
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
    createAdminLog("TEXT TO SPEECH GENERATED", user_code);
    return res.send(finalAudio);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "TTS failed" });
  }
};

// const createSpeechOnlyWithElevenLabs = async (req, res) => {
//   const { text, user_code = "test" } = req.body;

//   try {
//     const chunks = chunkText(text);
//     const audioBuffers = [];

//     for (const chunk of chunks) {
//       const audioStream =
//         await elevenLabClient.textToSpeech.convert(
//           "DGTOOUoGpoP6UZ9uSWfA",
//           {
//             text: chunk,
//             modelId: "eleven_v3",
//             outputFormat: "mp3_44100_128",
//           }
//         );

//       // ✅ Web ReadableStream → Buffer
//       const buffer = await streamToBuffer(audioStream);
//       audioBuffers.push(buffer);
//     }

//     const finalAudio = Buffer.concat(audioBuffers);

//     res.setHeader("Content-Type", "audio/mpeg");
//     res.setHeader("Content-Length", finalAudio.length);
//     res.setHeader(
//       "Content-Disposition",
//       'inline; filename="news-tts.mp3"'
//     );

//     createAdminLog("TEXT TO SPEECH GENERATED (ELEVENLABS)", user_code);
//     return res.send(finalAudio);

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       error: err.message || "TTS failed",
//     });
//   }
// };


const createSpeechOnlyWithElevenLabs = async (req, res) => {


  try {
    const MAX_CHARS = 5000;
    const chunks = text.length > MAX_CHARS
      ? chunkText(text, MAX_CHARS)
      : [text];

    // Parallel processing
    const audioBuffers = await Promise.all(
      chunks.map(async (chunk) => {
        const audioStream =
          await elevenLabClient.textToSpeech.convert(
            "DGTOOUoGpoP6UZ9uSWfA",
            {
              text: chunk,
              modelId: "eleven_v3",
              outputFormat: "mp3_44100_128",
            }
          );

        return streamToBuffer(audioStream);
      })
    );

    const finalAudio = Buffer.concat(audioBuffers);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", finalAudio.length);
    res.setHeader(
      "Content-Disposition",
      'inline; filename="news-tts.mp3"'
    );

    createAdminLog("TEXT TO SPEECH GENERATED (ELEVENLABS)", user_code);

    return res.send(finalAudio);

  } catch (err) {
    console.error("ElevenLabs error:", err);
    return res.status(500).json({
      error: err.message || "TTS failed",
    });
  }
};


const createSpeechOnlyWithElevenLabsForCorn = async (data) => {
  const { text, user_code = "test" } = data;

  try {
    const chunks = chunkText(text);
    const audioBuffers = [];

    for (const chunk of chunks) {
      const audioStream =
        await elevenLabClient.textToSpeech.convert(
          "DGTOOUoGpoP6UZ9uSWfA",
          {
            text: chunk,
            modelId: "eleven_v3",
            outputFormat: "mp3_44100_128",
          }
        );

      // ✅ Web ReadableStream → Buffer
      const buffer = await streamToBuffer(audioStream);
      audioBuffers.push(buffer);
    }

    const finalAudio = Buffer.concat(audioBuffers);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", finalAudio.length);
    res.setHeader(
      "Content-Disposition",
      'inline; filename="news-tts.mp3"'
    );

    createAdminLog("TEXT TO SPEECH GENERATED (ELEVENLABS)", user_code);
    return res.send(finalAudio);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "TTS failed",
    });
  }
};






const createSpeechOnlyForCron = async (text) => {
  const data = {
    text: text,
    language: "bn-IN",
    voice: "bn-IN-Wavenet-B",
    pitch: -1.45,
    speakingRate: 1.25,
    user_code: 'SYSTEM'
  };

  try {
    const chunks = chunkText(data.text);
    const audioBuffers = [];

    for (const chunk of chunks) {
      const processedText = await applyCustomPronunciation(chunk);
      const ssmlPayload = `<speak>${processedText}</speak>`;
      const [response] = await gcpTTSClient.synthesizeSpeech({
        input: { ssml: ssmlPayload },
        voice: {
          languageCode: data.language,
          name: data.voice
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: data.speakingRate,
          pitch: data.pitch
        }
      });
      const buffer = Buffer.isBuffer(response.audioContent)
        ? response.audioContent
        : Buffer.from(response.audioContent, "base64");

      audioBuffers.push(buffer);
    }

    const finalAudio = Buffer.concat(audioBuffers);
    return finalAudio;

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
 * Saves Text-to-Speech data to the database
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
const saveTtsToDbV2 = async (req, res) => {
  /** 
   * @type {{title: string, text: string, audioKey: string, audioUrl: string, qrKey: string, qrUrl: string,lang:String,desc:String,duration:String,thumbnail:String,keywords:String}} 
   */
  const { title, text, audioKey, audioUrl, qrKey, qrUrl, lang = 'bengali', desc = 'listen audio on audio.eisamay.com', duration = null, thumbnail = '/demo.webp', keywords = 'ei samay audio,breaking news,audio news' } = req.body;

  const query = `
    INSERT INTO tbl_tts_record (title, tts_text, audio_key, audio_url, qr_key, qr_url,language,desc,duration,thumbnail,keywords)
    VALUES ($1, $2, $3, $4, $5, $6,$7,$8,$9,$10,$11);`;

  try {
    await pgClient.query(query, [title, text, audioKey, audioUrl, qrKey, qrUrl, lang, desc, duration, thumbnail, keywords]);
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
  const { tts_id, text, title } = req.body;

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
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const updateTtsSpeechv2 = async (req, res) => {
  /** @type {{text:String,title:String,id:String}} */
  const { text, id, user_code = 'test' } = req.body;
  if (!req.files || req.files.length === 0) {
    return res.status(400).send({ msg: "No audio file uploaded." });
  }
  const newFilePath = req.files[0].path;
  try {
    const { rows } = await pgClient.query(
      'SELECT audio_key FROM tbl_tts_record WHERE tts_id = $1',
      [id]
    );
    if (rows.length === 0) {
      await fsp.unlink(newFilePath).catch(() => { });
      return res.status(404).send("Record not found");
    }
    const oldFileName = rows[0]["audio_key"] === 'under_process_audio.mp3' ? Date.now() + '_' + Math.round(Math.random() * 1E5) + '.mp3' : rows[0]["audio_key"];
    console.log(oldFileName);
    const oldFilePath = path.join(AUDIO_UPLOAD_BASE_PATH, oldFileName);
    fs.rename(newFilePath, oldFilePath, (error) => {
      if (error) {
        fs.unlink(newFilePath).catch(() => { });
        return res.status(500).send({ msg: 'Error: ' + error.message });
      }
    });
    const { rowCount } = await pgClient.query(
      'update tbl_tts_record set tts_text=$1,tts_generated=$2,audio_key=$3,tts_mod_time=NOW() WHERE tts_id = $4',
      [text, "YES", oldFileName, id]
    );
    if (rowCount == 0) {
      await fsp.unlink(newFilePath).catch(() => { });
      return res.status(500).send({ msg: 'Error: ' + error.message });
    }
    createAdminLog(`TTS RECORD UPDATED ID: ${id}`, user_code);
    return res.status(200).send({ msg: "Audio updated successfully." });
  } catch (error) {
    console.error("FileSystem Error:", error);
    await fsp.unlink(newFilePath).catch(() => { });
    return res.status(500).send({ msg: 'Error: ' + error.message });
  }
};




/**
 * Proxy download endpoint to bypass CORS restrictions
 */
const downloadProxy = async (req, res) => {
  const { filename, user_code = 'test' } = req.query;

  try {
    const filePath = path.join(__dirname, "..", "..", "uploads", "qr", filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    const sanitizedFilename = filename.replace(/[\r\n\t]/g, '_').trim();
    res.download(filePath, sanitizedFilename, (err) => {
      if (err) {
        console.error("Error during download transfer:", err);
        if (!res.headersSent) {
          res.status(500).send("Error downloading file");
        }
      }
    });
    createAdminLog(`QR CODE FILE DOWNLOADED FILE NAME-> ${filename}`, user_code);

  } catch (error) {
    console.error('Download proxy error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const saveCustomSpeech = async (req, res) => {
  /** @type {{word:String ,speech:String}} */
  const { word, speech, user_code = 'test' } = req.body;
  const insertQuery = 'INSERT INTO tts_custom (word, speech) VALUES ($1, $2) RETURNING *';
  try {
    const result = await pgClient.query(insertQuery, [word, speech]);
    createAdminLog(`CUSTOM SPEECH ADDED ${word}->${speech}`, user_code);
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

// const generateCmykQr = async (audioUrl) => {
//   // Step 1: Generate high-res 1-bit QR
//   const qrBuffer = await QRCode.toBuffer(audioUrl, {
//     width: 1000, // High res helps prevent JPEG blurring
//     margin: 1,
//     errorCorrectionLevel: 'H',
//     color: { dark: '#000000', light: '#FFFFFF' }
//   });

//   // Step 2: Extract raw grayscale data
//   const { data, info } = await sharp(qrBuffer)
//     .greyscale()
//     .raw()
//     .toBuffer({ resolveWithObject: true });

//   const totalPixels = info.width * info.height;
//   const cmykBuffer = Buffer.alloc(totalPixels * 4);

//   for (let i = 0; i < totalPixels; i++) {
//     const isBlack = data[i] < 128; 
//     if(data[i]!==0 && data[i]!==255){
//       console.log(data[i]);
//     }
//     const idx = i * 4;

//     // Manually force all color channels to 0
//     cmykBuffer[idx]     = 0; // C
//     cmykBuffer[idx + 1] = 0; // M
//     cmykBuffer[idx + 2] = 0; // Y
//     cmykBuffer[idx + 3] = isBlack ? 255 : 0; // K
//   }

//   return await sharp(cmykBuffer, {
//   raw: {
//     width: info.width,
//     height: info.height,
//     channels: 4
//   }
// })
//   .jpeg({
//     quality: 100,
//     chromaSubsampling: '4:4:4'
//   })
//   .withMetadata({density:300}) // no density first, test pure output
//   .toBuffer();
// };


// const generateCmykQr = async (audioUrl) => {
//   // Step 1: Generate QR
//   const qrBuffer = await QRCode.toBuffer(audioUrl, {
//     width: 600,              // Higher is safer for print
//     margin: 1,
//     errorCorrectionLevel: 'L'
//   });

//   // Step 2: Convert to pure 1-bit black/white
//   const { data, info } = await sharp(qrBuffer)
//     .greyscale()
//     .threshold(128)
//     .raw()
//     .toBuffer({ resolveWithObject: true });

//   const totalPixels = info.width * info.height;

//   // Step 3: Create pure CMYK buffer (4 channels)
//   const cmykBuffer = Buffer.alloc(totalPixels * 4);

//   for (let i = 0; i < totalPixels; i++) {
//     const pixel = data[i]; // 0 (black) or 255 (white)
//     const isBlack = pixel === 0;

//     const idx = i * 4;

//     cmykBuffer[idx]     = 0;             // C
//     cmykBuffer[idx + 1] = 0;             // M
//     cmykBuffer[idx + 2] = 0;             // Y
//     cmykBuffer[idx + 3] = isBlack ? 255 : 0; // K only
//   }

//   // Step 4: Save as uncompressed CMYK TIFF
//   return await sharp(cmykBuffer, {
//     raw: {
//       width: info.width,
//       height: info.height,
//       channels: 4
//     }
//   })
//     .tiff({
//       compression: 'none'
//     })
//     .withMetadata({
//       density: 300   // 300 DPI for newspaper
//     })
//     .toBuffer();
// };



const generateCmykQr = async (audioUrl) => {
  // Step 1: Generate high-res QR (black/white)
  const qrBuffer = await QRCode.toBuffer(audioUrl, {
    width: 1000,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" }
  });

  // Step 2: Convert to pure K-only CMYK TIFF (intermediate)
  const tempId = randomUUID();
  const tempTiff = join(tmpdir(), `${tempId}.tif`);
  const tempJpg = join(tmpdir(), `${tempId}.jpg`);

  await sharp(qrBuffer)
    .toColourspace("cmyk")        // convert properly
    .withMetadata({ density: 300 })
    .tiff({ compression: "none" }) // lossless intermediate
    .toFile(tempTiff);

  // Step 3: Use ImageMagick for proper CMYK JPEG encoding
  // await execa("magick", [
  //   tempTiff,
  //   "-colorspace", "CMYK",
  //   "-channel", "CMY", "-evaluate", "set", "0",
  //   "+channel",
  //   "-sampling-factor", "4:4:4",
  //   "-quality", "100",
  //   "-define", "jpeg:colorspace=CMYK",
  //   "-density", "300",
  //   tempJpg
  // ]);

  await execa("convert", [
  tempTiff,

  "-colorspace", "Gray",
  "-type", "Bilevel",
  "-colorspace", "CMYK",
  "-channel", "CMY",
  "-evaluate", "set", "0",
  "+channel",
  "-sampling-factor", "4:4:4",
  "-quality", "100",
  "-define", "jpeg:colorspace=CMYK",
  "-density", "300",
  tempJpg
]);

  // Step 4: Read final JPEG
  const finalBuffer = await readFile(tempJpg);

  // Cleanup temp files
  await unlink(tempTiff);
  await unlink(tempJpg);

  return finalBuffer;
};


/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const getCustom = async (req, res) => {
  try {
    const selectQuery = 'SELECT * FROM tts_custom';
    const { rows } = await pgClient.query(selectQuery);
    return res.status(200).send({ data: rows });
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
const storeInMechine = async (req, res) => {
  /** @type {{title:String,text:String,}} */
  const { title, text, user_code = 'test', llm_code } = req.body;
  try {
    const audioFilename = req.files[0]['filename'];
    const audioFilePath = req.files[0]['path'];
    const audioMetadata = await parseFile(audioFilePath);
    const duration = formatToISODuration(audioMetadata.format.duration);
    // const nextId = await getNextVal();
    // const nextTtsId = `TTS${nextId}`;
    const hashedId = generatePublicToken();
    const QR_LINK = `${process.env.USER_PORTAL}/audio/${hashedId}`;
    const qrBuffer = await generateCmykQr(QR_LINK);
    let { fileName } = await saveQRImage(qrBuffer, title.substring(0, 50));
    const insertQ = "insert into tbl_tts_record(public_token,title,tts_text,audio_key,qr_key,duration,tts_generated,llm_name) values ($1,$2,$3,$4,$5,$6,$7,$8);";
    await pgClient.query(insertQ, [hashedId, title, text, audioFilename, fileName, duration, "YES", llm_code]);
    createAdminLog(`NEW TTS GENERATED BY ${llm_code} AND STORED TITLE->${title}`, user_code);
    return res.status(200).send({ msg: "Audio saved and QR Code created." });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}

const saveQRImage = async (buffer, buffername) => {
  try {
    await fsp.mkdir(QR_FOLDER, { recursive: true });
    const safeName = buffername.trim().replace(/[\\/:*?"<>|]/g, "_");
    const finalName = safeName || `qr-${Date.now()}`;
    const fileName = `${finalName}.jpg`;
    const filePath = path.join(QR_FOLDER, fileName);
    await fsp.writeFile(filePath, buffer);
    return {
      success: true,
      fileName: fileName,
      filePath: filePath
    };
  } catch (error) {
    console.error("Error saving QR buffer:", error);
    throw error;
  }
};

const getNextVal = async () => {
  const getNextRowVal = "Select nextval('tts_id_seq');";
  const { rows } = await pgClient.query(getNextRowVal);
  return rows[0]["nextval"];
}

const formatToISODuration = (durationInSeconds) => {
  if (!durationInSeconds) return 'PT0S';

  const minutes = Math.floor(durationInSeconds / 60);
  const seconds = Math.floor(durationInSeconds % 60);

  let format = 'PT';
  if (minutes > 0) format += `${minutes}M`;
  if (seconds > 0 || minutes === 0) format += `${seconds}S`;

  return format;
};

/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const uploadImage = async (req, res) => {
  /** @type {{id:String}} */
  const { id, user_code = 'test' } = req.body;
  const imageFilename = req.files[0]['filename'];
  try {
    const updateaudioData = "update tbl_tts_record set thumbnail=$1 where tts_id=$2;";
    const { rowCount } = await pgClient.query(updateaudioData, [imageFilename, id]);
    if (rowCount == 0) {
      return res.status(500).send({ msg: "Error occure while updateing database." });
    }
    createAdminLog(`IMAGE THUMBNAIL UPDATED: ${id}`, user_code);
    return res.status(200).send({ msg: "File uploaded.", imageFilename });
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
const updateDataByRowId = async (req, res) => {
  /** @type {{title:String,desc:String,alt_text:String,keywords:String,id:String}} */
  const { title, desc, alt_text, keywords, id, user_code = 'test' } = req.body;
  const currentDatetime = formatLocalISO(new Date());
  const updateQ = "update tbl_tts_record set title=$1,description=$2,thumbnail_alt=$3,keywords=$4,tts_mod_time=$5 where tts_id=$6";
  try {
    const { rowCount } = await pgClient.query(updateQ, [title, desc, alt_text, keywords, currentDatetime, id]);
    if (rowCount == 0) {
      return res.status(500).send({ msg: "Data not updated." });
    }
    createAdminLog(`META DATA UPDATED ID: ${id}`, user_code);
    return res.status(200).send({ msg: "Data updated" });
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
const getAudioDataById = async (req, res) => {
  /** @type {{parameter:Datatype}} */
  const { id } = req.params;
  let rowId = `TTS${id}`;
  try {
    const seletcQ = 'select * from tbl_tts_record where tts_id=$1;';
    const { rows, rowCount } = await pgClient.query(seletcQ, [rowId]);
    if (rowCount != 1) {
      return res.status(500).send({ msg: "Id does not exist." });
    }
    return res.status(200).send({ msg: "", data: rows });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}


/**
* Fetches data based on a shifting 12-hour window (3PM to 3AM)
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const getTodaysData = async (req, res) => {
  // Cleaned up the query string
  const getDataQ = `
      SELECT * FROM tbl_tts_record
      WHERE tts_time >= (
          CASE 
              WHEN CURRENT_TIME < TIME '03:00:00' THEN CURRENT_DATE - INTERVAL '1 day'
              ELSE CURRENT_DATE 
          END + TIME '15:00:00'
      )
      AND tts_time < (
          CASE 
              WHEN CURRENT_TIME < TIME '03:00:00' THEN CURRENT_DATE
              ELSE CURRENT_DATE + INTERVAL '1 day' 
          END + TIME '03:00:00'
      )
      AND status='ACTIVE'
      ORDER BY tts_time DESC;`;

  try {
    const { rows } = await pgClient.query(getDataQ);
    return res.status(200).send({
      msg: 'Data fetched successfully',
      data: rows
    });
  } catch (error) {
    console.error('Database Error:', error); // console.error is better for logs
    return res.status(500).send({ msg: 'Internal Server Error' });
  }
}

/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const deleteAudioById = async (req, res) => {
  /** @type {{id:String,user_code}} */
  const { id, user_code = "test_user" } = req.body;
  const deleteAudioDataQ = "update tbl_tts_record set status='INACTIVE' where tts_id=$1;";
  try {
    const { rowCount } = await pgClient.query(deleteAudioDataQ, [id]);
    if (rowCount === 0) {
      return res.status(500).send({ msg: "Failed to delete." });
    }
    createAdminLog(`AUDIO INACTIVE ID:${id}`, user_code);
    return res.status(200).send({ msg: "Data deleted." });
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
const getUserData = async (req, res) => {
  /** @type {{user_code:String}} */
  const { user_code } = req.body;
  const getAllUsersData = "select user_empcode,user_email,user_type,user_status,can_edit,can_create,can_view from tbl_user where user_empcode!=$1 order by user_id;"
  try {
    const { rows } = await pgClient.query(getAllUsersData, [user_code]);
    if (rows.length == 0) {
      return res.status(500).send({ msg: "No user to show" });
    }
    return res.status(200).send({ data: rows });
  } catch (error) {
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}


/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const toogleUserAccessById = async (req, res) => {
  /** @type {{user_id:String,current_status:String,access_name:String,user_code:String}} */
  const { user_id, current_status, access_name, user_code } = req.body;
  const colname = `can_${access_name}`
  const toggledStatus = current_status === "NO" ? "YES" : "NO";
  const updateQ = `update tbl_user set ${colname}=$1 where user_empcode=$2;`;
  try {
    const { rowCount } = await pgClient.query(updateQ, [toggledStatus, user_id]);

    toggledStatus === "NO" ? createAdminLog(`USER ACCESS MODIFIED ID:${user_id} HAVE NO ${access_name} ACCESS.`, user_code) : createAdminLog(`USER ACCESS MODIFIED ID:${user_id} HAVE ${access_name} ACCESS.`, user_code);

    return res.status(200).send({ data: rowCount });
  } catch (error) {
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}


/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const getElevenLabcreditData = async (req, res) => {

  try {
    const data = await getElevenLabsCredits();
    return res.status(200).send({ data: data });
  } catch (error) {
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}



/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const getAllpublicToken = async (req, res) => {
  const getAllPubTokeQ = 'select public_token,tts_mod_time from tbl_tts_record order by tts_id desc;';
  try {
    const { rows } = await pgClient.query(getAllPubTokeQ);
    return res.status(200).send({ msg: "Data fetched.", data: rows });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ msg: 'Error: ' + error });
  }
}







export { createTts, saveTtsToDb, getPaginatedTtsRecords, updateTtsSpeech, downloadProxy, createSpeechOnly, getAudioPresignedUrl, finalizeTts, saveCustomSpeech, getAllCustomeSpeech, getCustom, storeInMechine, updateTtsSpeechv2, uploadImage, updateDataByRowId, getAudioDataById, createTts_forFirst, createSpeechOnlyForCron, generateCmykQr, saveQRImage, formatToISODuration, createTts_forUpdate, getQrAudioByFrontendKey, getTodaysData, deleteAudioById, getUserData, toogleUserAccessById, createSpeechOnlyWithElevenLabs, createSpeechOnLlmNumber, getElevenLabcreditData, createSpeechOnlyWithElevenLabsForCorn, getAllpublicToken };
