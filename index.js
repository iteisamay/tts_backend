// server.js
import express from "express";
import { configDotenv } from "dotenv";
import bodyParser from "body-parser";
import cors from 'cors';
import ttsRouter from "./router/ttsRouter.js";
import authRouter from "./router/authRouter.js";
import pgClient from "./db/pgClient.js";
import { fileURLToPath } from 'url';
import path from 'path';
import "./utils/cronJobs.js"

configDotenv();

const PORT = process.env.PORT || 3000;

pgClient.connect()
  .then(client => {
    console.log("✅ Connected to PostgreSQL");
  })
  .catch(err => {
    console.error("❌ PostgreSQL connection error:", err.stack);
  });

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE_PATH = path.join(__dirname, '..', 'uploads');
app.use('/s1/qr', express.static(path.join(UPLOAD_BASE_PATH, 'qr'),{
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

app.use('/s1/audio', express.static(path.join(UPLOAD_BASE_PATH, 'audios'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

app.use('/s1/images', express.static(path.join(UPLOAD_BASE_PATH, 'images'),{
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

app.use(cors("*"));
app.use(express.json());

app.use('/s1/api/v1/tts', ttsRouter);
app.use('/s1/api/v1/auth', authRouter);

app.listen(PORT, () => console.log("Server listening on", PORT));
