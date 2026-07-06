import cron from "node-cron";
import textToSpeech from "@google-cloud/text-to-speech";
import { fileURLToPath } from 'url';
import pgClient from '../db/pgClient.js';
import { createSpeechOnly, createSpeechOnlyForCron, createSpeechOnlyWithElevenLabsForCorn, formatToISODuration, generateCmykQr, saveQRImage } from "../controller/ttsController-gcp.js";
import fs from "fs";
import path from "path";
import { parseFile } from 'music-metadata';
import createAdminLog from "./logWriter.js";
import { generatePublicToken } from "./crypto.js";
import { chunkText } from '../utils/chunk.js';
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { streamToBuffer } from "../utils/steamToBuffer.js";
import pLimit from 'p-limit'
import { exec } from 'child_process';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_FILE_NAME = 'under_process_audio.mp3';
const UPLOAD_BASE_PATH = path.join(__dirname, '..', "..", 'uploads');
const DEFAULT_AUDIO_PATH = path.join(__dirname, '..', "..", 'uploads/audios', DEFAULT_FILE_NAME);
const gcpTTSClient = new textToSpeech.TextToSpeechClient({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
const elevenLabClient = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY_2 });

const voiceId = {
    1: ["DGTOOUoGpoP6UZ9uSWfA", "Bengali"],
    2: ["kvQSb3naDTi3sgHwwBC1", "Bengali"],
    3: ["emceOb89ymaMozXE8Kfw", "English"],
    4: ["ZZaFmqC4m1spoEWv9Jcp", "English"],
    5: ["hdkYGMdbdWZpANLZvmnk", "Hindi"],
    6: ["kvQSb3naDTi3sgHwwBC1", "Hindi"],
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

async function startTtsWorker() {
    console.log("🚀 TTS Worker Started...");

    while (true) {
        console.log("⏱ Scanning for speech generation...");

        try {
            const getRowData = await getNoTtsGeneratedData();
            if (!getRowData || getRowData.length === 0) {
                await sleep(60 * 1000);//1 min
                continue;
            }
            const currentDateTime = new Date();
            const modTime = `${currentDateTime.getFullYear()}-${currentDateTime.getMonth() + 1}-${currentDateTime.getDate()} ${currentDateTime.getHours()}:${currentDateTime.getMinutes()}:${currentDateTime.getSeconds()}`;
            if (getRowData[0]['tts_generated'] === 'NO') {
                const audioFilePath = DEFAULT_AUDIO_PATH;

                const audioMetadata = await parseFile(audioFilePath);
                const duration = formatToISODuration(audioMetadata.format.duration);
                const hashedId = generatePublicToken();
                const QR_LINK = `${process.env.USER_PORTAL}/audio/${hashedId}`;

                const qrBuffer = await generateCmykQr(QR_LINK);
                const { fileName } = await saveQRImage(
                    qrBuffer,
                    getRowData[0]['title'].substring(0, 50)
                );

                const insertQ = `
                    UPDATE tbl_tts_record
                    SET audio_key=$1,
                        qr_key=$2,
                        duration=$3,
                        tts_mod_time=$4,
                        tts_generated=$5,
                        public_token=$6
                    WHERE tts_id=$7;
                `;

                await pgClient.query(insertQ, [
                    DEFAULT_FILE_NAME,
                    fileName,
                    duration,
                    modTime,
                    'NEED TO CREATE',
                    hashedId,
                    getRowData[0]['tts_id']
                ]);

                createAdminLog(
                    `NEW TTS RECORD STORED(SYSTEM) TITLE->${getRowData[0]['title']}`,
                    'SYSTEM'
                );
            }

        } catch (err) {
            console.error("❌ Scanning failed: ", err);
        }

        // 🔁 Wait 1 minute before next scan
        await sleep(60 * 1000);
    }
}

function autoTtsWorker() {
    console.log("Auto generation worker started");
    cron.schedule('30 5 * * *', async() => {
    // cron.schedule('*/5 * * * *', async() => {
        console.log("Auto Cron running on 5:30 AM Daily");
        const updateQ=`update tbl_tts_record 
         set tts_generated='SET FOR GENERATION',generate_proc='AUTO' where tts_generated='NEED TO CREATE'`;

         await pgClient.query(updateQ);
    });
    
}

//used for generate audio
async function generateAudioBufferAndSaveThroughLlm() {
    const getNonGeneratedData = `
    select tts_id, tts_text, llm_name,lang_id 
    from tbl_tts_record 
    where tts_generated='SET FOR GENERATION'
    order by tts_id 
    limit 1;
  `;

    while (true) {
        console.log("Audio Generation started.");
        const { rows, rowCount } =
            await pgClient.query(getNonGeneratedData);

        if (rowCount === 0) {
            await sleep(60 * 1000);
            continue;
        }

        const job = rows[0];

        try {
            // 🔒 Lock row
            await pgClient.query(
                `update tbl_tts_record 
         set tts_generated='PROCESSING' 
         where tts_id=$1`,
                [job.tts_id]
            );

            let finalAudio;

            if (job.llm_name === "GOOGLE_API") {
                finalAudio = await generateWithGoogleV2(job.tts_text);
            } else if (job.llm_name === "ELEVENLAB_API") {
                finalAudio = await generateWithElevenLabsV2(job.tts_text, job.lang_id);
            } else {
                throw new Error("Invalid LLM");
            }



            // ✅ Save file
            const timestamp = Date.now();
            const random5 = Math.floor(10000 + Math.random() * 90000);
            const fileName = `${timestamp}_${random5}.mp3`;

            const filePath = path.join(__dirname,"..", "..", "uploads/audios", fileName);

            console.log("Filepath:- ",filePath);
            console.log(finalAudio.length);
            fs.writeFileSync(filePath, finalAudio);

            // ✅ Update DB as completed
            await pgClient.query(
                `update tbl_tts_record 
         set tts_generated='COMPLETED',
             audio_key=$1,language=$3
         where tts_id=$2`,
                [fileName, job.tts_id, voiceId[job.lang_id][1]]
            );

        } catch (err) {
            console.error("Generation failed:", err);

            await pgClient.query(
                `update tbl_tts_record 
         set tts_generated='FAILED'
         where tts_id=$1`,
                [job.tts_id]
            );
        }
    }
}




async function generateWithGoogle(text) {
    const chunks = chunkText(text);
    const audioBuffers = [];

    for (const chunk of chunks) {
        const processedText = await applyCustomPronunciation(chunk);

        const ssmlPayload =
            `<speak><prosody pitch="-2st">${processedText}</prosody></speak>`;

        const [response] = await gcpTTSClient.synthesizeSpeech({
            input: { ssml: ssmlPayload },
            voice: {
                languageCode: "bn-IN",
                name: "bn-IN-Wavenet-A",
            },
            audioConfig: {
                audioEncoding: "MP3",
                speakingRate: 1.18,
                pitch: 1.3,
            },
        });

        const buffer = Buffer.isBuffer(response.audioContent)
            ? response.audioContent
            : Buffer.from(response.audioContent, "base64");

        audioBuffers.push(buffer);
    }

    return Buffer.concat(audioBuffers);
}

async function generateWithGoogleV2(text) {
    if (!text) throw new Error("Text is required");

    const chunks = chunkText(text);
    const audioBuffers = [];

    for (const chunk of chunks) {
        const processedText = await applyCustomPronunciation(chunk);

        const ssmlPayload =
            `<speak><prosody pitch="-2st">${processedText}</prosody></speak>`;

        const [response] = await gcpTTSClient.synthesizeSpeech({
            input: { ssml: ssmlPayload },
            voice: {
                languageCode: "bn-IN",
                name: "bn-IN-Wavenet-A",
            },
            audioConfig: {
                audioEncoding: "MP3",
                speakingRate: 1.18,
                pitch: 1.3,
            },
        });

        const buffer = Buffer.isBuffer(response.audioContent)
            ? response.audioContent
            : Buffer.from(response.audioContent, "base64");

        audioBuffers.push(buffer);
    }

    // ⚠️ Raw broken concat
    const rawBuffer = Buffer.concat(audioBuffers);

    // ---- FIX CONTAINER ----
    const tempId = uuidv4();
    const inputPath = path.join(os.tmpdir(), `${tempId}_raw.mp3`);
    const outputPath = path.join(os.tmpdir(), `${tempId}_fixed.mp3`);

    fs.writeFileSync(inputPath, rawBuffer);
    // const ffmpegPath = "C:\\Users\\subhradip.majumder\\Desktop\\ffmpeg-master-latest-win64-gpl-shared\\ffmpeg-master-latest-win64-gpl-shared\\bin\\ffmpeg.exe";
    const ffmpegPath = "ffmpeg";

    await new Promise((resolve, reject) => {
        exec(
            `"${ffmpegPath}" -y -i "${inputPath}" -acodec libmp3lame -qscale:a 2 -write_xing 1 "${outputPath}"`,
            (error) => {
                if (error) reject(error);
                else resolve();
            }
        );
    });

    const fixedBuffer = fs.readFileSync(outputPath);

    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    return fixedBuffer;
}



async function generateWithElevenLabs(text) {
    if (!text) throw new Error("Text is required");

    const MAX_CHARS = 1000;
    const CONCURRENCY = 3;

    const chunks = splitTextByDanda(text, MAX_CHARS);

    const limit = pLimit(CONCURRENCY);

    const audioBuffers = await Promise.all(
        chunks.map(chunk =>
            limit(async () => {
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
        )
    );

    return Buffer.concat(audioBuffers);
}



async function generateWithElevenLabsV2(text, lang_id) {
    if (!text) throw new Error("Text is required");

    const MAX_CHARS = 1000;
    const CONCURRENCY = 3;

    const chunks = splitTextBySentence(text, MAX_CHARS);
    const limit = pLimit(CONCURRENCY);
    console.log(lang_id, voiceId[lang_id]);
    const audioBuffers = await Promise.all(
        chunks.map(chunk =>
            limit(async () => {
                const audioStream =
                    await elevenLabClient.textToSpeech.convert(
                        voiceId[lang_id][0],
                        {
                            text: chunk,
                            modelId: "eleven_v3",
                            outputFormat: "mp3_44100_128",
                        }
                    );

                return streamToBuffer(audioStream);
            })
        )
    );

    // ⚠️ This concat creates invalid MP3 container
    const rawBuffer = Buffer.concat(audioBuffers);

    // Create temp files
    const tempId = uuidv4();
    const inputPath = path.join(os.tmpdir(), `${tempId}_raw.mp3`);
    const outputPath = path.join(os.tmpdir(), `${tempId}_fixed.mp3`);

    fs.writeFileSync(inputPath, rawBuffer);
    // const ffmpegPath = "C:\\Users\\subhradip.majumder\\Desktop\\ffmpeg-master-latest-win64-gpl-shared\\ffmpeg-master-latest-win64-gpl-shared\\bin\\ffmpeg.exe";
    const ffmpegPath = "ffmpeg";
    await new Promise((resolve, reject) => {
        exec(
            `"${ffmpegPath}" -y -i "${inputPath}" -acodec libmp3lame -qscale:a 2 -write_xing 1 "${outputPath}"`,
            (error) => {
                if (error) reject(error);
                else resolve();
            }
        );
    });

    const fixedBuffer = fs.readFileSync(outputPath);
    // Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    return fixedBuffer;
}




// function splitTextByDanda(text, maxChars = 1000) {
//     if (!text) return [];
//     const sentences = text.split("।")
//         .map(s => s.trim())
//         .filter(Boolean);

//     const chunks = [];
//     let currentChunk = "";

//     for (let i = 0; i < sentences.length; i++) {
//         const sentence = sentences[i] + "।"; // add back danda

//         // If adding this sentence exceeds limit → push current chunk
//         if ((currentChunk + " " + sentence).trim().length > maxChars) {
//             if (currentChunk.trim()) {
//                 chunks.push(currentChunk.trim());
//                 currentChunk = sentence;
//             } else {
//                 // Edge case: single sentence longer than maxChars
//                 chunks.push(sentence.slice(0, maxChars));
//                 currentChunk = sentence.slice(maxChars);
//             }
//         } else {
//             currentChunk = currentChunk
//                 ? currentChunk + " " + sentence
//                 : sentence;
//         }
//     }

//     if (currentChunk.trim()) {
//         chunks.push(currentChunk.trim());
//     }

//     return chunks;
// }
function splitTextBySentence(text, maxChars = 1000) {
    if (!text) return [];

    // Match sentences ending with either । or .
    const sentences = text.match(/[^।.]+[।.]?/g)
        ?.map(s => s.trim())
        .filter(Boolean) || [];

    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length > maxChars) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
                currentChunk = sentence;
            } else {
                // Edge case: single sentence longer than maxChars
                chunks.push(sentence.slice(0, maxChars));
                currentChunk = sentence.slice(maxChars);
            }
        } else {
            currentChunk = currentChunk
                ? currentChunk + " " + sentence
                : sentence;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}





const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getNoTtsGeneratedData = async () => {
    const getQ = "SELECT tts_id,title,tts_text,tts_generated,audio_key,llm_name from tbl_tts_record where tts_generated='NO'or tts_generated='NEED UPDATE' order by tts_time limit 1;";
    try {
        const { rowCount, rows } = await pgClient.query(getQ);
        return rows;
    } catch (error) {
        return null;
    }
}

const saveBufferToDrive = async (bufferData) => {
    const randomName = Date.now() + '_' + Math.round(Math.random() * 1E5);
    try {
        const filePath = path.join(UPLOAD_BASE_PATH, 'audios', `${randomName}.mp3`);
        await fs.writeFile(filePath, bufferData);
        return { filename: `${randomName}.mp3`, filePath: filePath };
    } catch (error) {
        console.log(error);
    }
}

const updateBufferToDrive = async (bufferData, filename) => {
    try {
        const filePath = path.join(UPLOAD_BASE_PATH, 'audios', filename);
        await fs.writeFile(filePath, bufferData);
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
}

export { startTtsWorker, generateAudioBufferAndSaveThroughLlm,autoTtsWorker }
