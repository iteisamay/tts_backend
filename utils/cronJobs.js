import cron from "node-cron";
import { fileURLToPath } from 'url';
import pgClient from '../db/pgClient.js';
import { createSpeechOnlyForCron, createSpeechOnlyWithElevenLabsForCorn, formatToISODuration, generateCmykQr, saveQRImage } from "../controller/ttsController-gcp.js";
import fs from "fs/promises";
import path from "path";
import { parseFile } from 'music-metadata';
import createAdminLog from "./logWriter.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE_PATH = path.join(__dirname, '..', '..', 'uploads');

cron.schedule("*/1 * * * *", async () => {
    console.log("⏱ Scaning for speech generation.");
    try {
        const getRowData = await getNoTtsGeneratedData();
        if (!getRowData || getRowData.length == 0) {
            return;
        }
        const currentDateTime = new Date();
        const modTime = `${currentDateTime.getFullYear()}-${currentDateTime.getMonth() + 1}-${currentDateTime.getDate()} ${currentDateTime.getHours()}:${currentDateTime.getMinutes()}:${currentDateTime.getSeconds()}`

        if (getRowData[0]['tts_generated'] == 'NO') {
            let getGenBuffer = null;
            //generate buffer
            if (getRowData[0]['llm_name'] === "google_llm") {
                getGenBuffer = await createSpeechOnlyForCron(getRowData[0]['tts_text']);
                
            } else if (getRowData[0]['llm_name'] === "eleven_labs") {
                getGenBuffer = await createSpeechOnlyWithElevenLabsForCorn(getRowData[0]['tts_text'],user_code="SYSTEM");
            }
                //save buffer
                const audioBufferData = await saveBufferToDrive(getGenBuffer);
                const audioFilePath = audioBufferData.filePath;
                const audioMetadata = await parseFile(audioFilePath);
                const duration = formatToISODuration(audioMetadata.format.duration);

                //generate qr
                const id = getRowData[0]['tts_id'].substring(3);
                const QR_LINK = `${process.env.USER_PORTAL}/audio/${id}`;
                const qrBuffer = await generateCmykQr(QR_LINK);
                let { fileName } = await saveQRImage(qrBuffer, getRowData[0]['title'].substring(0, 50));

                const insertQ = "update tbl_tts_record set audio_key=$1,qr_key=$2,duration=$3,tts_mod_time=$4, tts_generated=$5 where tts_id=$6;";
                const currentDateTime = new Date();
                const modTime = `${currentDateTime.getFullYear()}-${currentDateTime.getMonth() + 1}-${currentDateTime.getDate()} ${currentDateTime.getHours()}:${currentDateTime.getMinutes()}:${currentDateTime.getSeconds()}`
                await pgClient.query(insertQ, [audioBufferData.filename, fileName, duration, modTime, 'YES', getRowData[0]['tts_id']]);
                createAdminLog(`NEW TTS RECORD STORED(SYSTEM) TITLE->${getRowData[0]['title']}`, 'SYSTEM');
        }
        else if (getRowData[0]['tts_generated'] == 'NEED UPDATE') {
            //generate buffer
            const getGenBuffer = await createSpeechOnlyForCron(getRowData[0]['tts_text']);
            const audioBufferDataSaved = await updateBufferToDrive(getGenBuffer, getRowData[0]['audio_key']);
            if (audioBufferDataSaved) {
                const audioMetadata = await parseFile(path.join(UPLOAD_BASE_PATH, 'audios', getRowData[0]['audio_key']));
                const duration = formatToISODuration(audioMetadata.format.duration);
                const updateRowQ = "update tbl_tts_record set tts_mod_time=$1,duration=$2,tts_generated=$3 where tts_id=$4;"
                await pgClient.query(updateRowQ, [modTime, duration, "YES", getRowData[0]['tts_id']]);
                createAdminLog("AUDIO FILE UPDATED", "SYSTEM");
            }
        }

    } catch (err) {
        console.error("❌ Scaning failed: ", err);
    }
});


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
