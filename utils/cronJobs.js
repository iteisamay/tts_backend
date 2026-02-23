import cron from "node-cron";
import { fileURLToPath } from 'url';
import pgClient from '../db/pgClient.js';
import { createSpeechOnlyForCron, createSpeechOnlyWithElevenLabsForCorn, formatToISODuration, generateCmykQr, saveQRImage } from "../controller/ttsController-gcp.js";
import fs from "fs/promises";
import path from "path";
import { parseFile } from 'music-metadata';
import createAdminLog from "./logWriter.js";
import { generatePublicToken } from "./crypto.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_FILE_NAME='under_process_audio.mp3';
const UPLOAD_BASE_PATH = path.join(__dirname, '..', '..', 'uploads');
const DEFAULT_AUDIO_PATH=path.join(__dirname, '..', '..', 'uploads/audios',DEFAULT_FILE_NAME);



async function startTtsWorker() {
    console.log("🚀 TTS Worker Started...");

    while (true) {
        console.log("⏱ Scanning for speech generation...");

        try {
            const getRowData = await getNoTtsGeneratedData();
            if (!getRowData || getRowData.length === 0) {
                await sleep(10 * 1000);//10 sec
                continue;
            }

            const currentDateTime = new Date();
            const modTime = `${currentDateTime.getFullYear()}-${currentDateTime.getMonth() + 1}-${currentDateTime.getDate()} ${currentDateTime.getHours()}:${currentDateTime.getMinutes()}:${currentDateTime.getSeconds()}`;

            if (getRowData[0]['tts_generated'] === 'NO') {
                const audioFilePath = DEFAULT_AUDIO_PATH;

                const audioMetadata = await parseFile(audioFilePath);
                const duration = formatToISODuration(audioMetadata.format.duration);
                const hashedId=generatePublicToken();
                const QR_LINK = `${process.env.USER_PORTAL}/listen/audio/${hashedId}`;

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

export{startTtsWorker}
