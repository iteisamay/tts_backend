import express from 'express';
import { createTts, saveTtsToDb, getPaginatedTtsRecords, updateTtsSpeech, downloadProxy, createSpeechOnly, getAudioPresignedUrl, finalizeTts, saveCustomSpeech, getCustom, storeInMechine, updateTtsSpeechv2, uploadImage, updateDataByRowId, getAudioDataById, createTts_forFirst,createTts_forUpdate,getQrAudioByFrontendKey,getTodaysData,deleteAudioById, getUserData, toogleUserAccessById, createSpeechOnlyWithElevenLabs, createSpeechOnLlmNumber, getElevenLabcreditData, getAllpublicToken } from '../controller/ttsController-gcp.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { verifyAction } from '../middlewares/verification.js';

const ttsRouter = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE_PATH = path.join(__dirname,'..', 'uploads');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let subFolder = '';
        if (file.fieldname === 'qr') {
            subFolder = 'qr';
        } else if (file.fieldname === 'audio') {
            subFolder = 'audios';
        }else if (file.fieldname === 'thumbnail'){
            subFolder='images';
        }
        const finalPath = path.join(UPLOAD_BASE_PATH, subFolder);
        if (!fs.existsSync(finalPath)) {
            fs.mkdirSync(finalPath, { recursive: true });
        }
        cb(null, finalPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E5);
        if(file.fieldname==='thumbnail'){
            cb(null, uniqueSuffix +path.extname(file.originalname));
        }else{
            cb(null, uniqueSuffix + '.mp3');
        }
    }
});

const upload=multer({storage});

ttsRouter.post('/create', createTts);

//front end portal API's
ttsRouter.post('/generate-first',verifyAction,createTts_forFirst);
ttsRouter.post('/generate-update',verifyAction, createTts_forUpdate);
ttsRouter.post('/get-qr-audio',verifyAction, getQrAudioByFrontendKey);
ttsRouter.post('/get/today',verifyAction, getTodaysData);
ttsRouter.delete('/delete',verifyAction, deleteAudioById);



ttsRouter.get('/get-audio-presigned-url', getAudioPresignedUrl);
ttsRouter.post('/finalize', finalizeTts);
ttsRouter.post('/create-speech-only',verifyAction, createSpeechOnLlmNumber);
ttsRouter.post('/save', saveTtsToDb);
// ttsRouter.post('/save-speech-to-db', saveSpeechToDb);
ttsRouter.post('/get', getPaginatedTtsRecords);
// ttsRouter.post('/update', updateTtsSpeech);
ttsRouter.get('/download-proxy', downloadProxy);
ttsRouter.post('/add/custom',verifyAction, saveCustomSpeech);
ttsRouter.get('/get/custom', getCustom);

//bare metal 
ttsRouter.post('/store',upload.any(),storeInMechine);
ttsRouter.post('/update',upload.any(),verifyAction, updateTtsSpeechv2);
ttsRouter.post('/image-upload',upload.any(),uploadImage);
ttsRouter.post('/update-data',updateDataByRowId);

ttsRouter.get('/get/:id',getAudioDataById);

ttsRouter.post('/get/userdata',verifyAction,getUserData)
ttsRouter.post('/toggle/user/access',verifyAction,toogleUserAccessById)

//get llm information
ttsRouter.get('/llm/get/credit/eleven',getElevenLabcreditData);

//get all id
ttsRouter.get('/get-pub-token',getAllpublicToken);

export default ttsRouter;