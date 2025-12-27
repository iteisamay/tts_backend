import express from 'express';
import { createTts, saveTtsToDb, getPaginatedTtsRecords, updateTtsSpeech, downloadProxy, createSpeechOnly, getAudioPresignedUrl, finalizeTts, saveCustomSpeech } from '../controller/ttsController-gcp.js';
const ttsRouter = express.Router();

ttsRouter.post('/create', createTts);
ttsRouter.get('/get-audio-presigned-url', getAudioPresignedUrl);
ttsRouter.post('/finalize', finalizeTts);
ttsRouter.post('/create-speech-only', createSpeechOnly);
ttsRouter.post('/save', saveTtsToDb);
// ttsRouter.post('/save-speech-to-db', saveSpeechToDb);
ttsRouter.post('/get', getPaginatedTtsRecords);
ttsRouter.post('/update', updateTtsSpeech);
ttsRouter.get('/download-proxy', downloadProxy);
ttsRouter.post('/add/custom', saveCustomSpeech);
export default ttsRouter;