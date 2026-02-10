import express from "express";
import { configDotenv } from "dotenv";
import cors from 'cors';
import ttsRouter from "./router/ttsRouter.js";
import authRouter from "./router/authRouter.js";
import pgClient from "./db/pgClient.js";

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

app.use(cors("*"));
app.use(express.json());

app.use('/s1/api/v1/tts', ttsRouter);
app.use('/s1/api/v1/auth', authRouter);

app.listen(PORT, () => console.log("Server listening on", PORT));
