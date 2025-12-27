// server.js
import express from "express";
import { configDotenv } from "dotenv";
import bodyParser from "body-parser";
import cors from 'cors';
import ttsRouter from "./router/ttsRouter.js";
import pgClient from "./db/pgClient.js";

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

app.use(bodyParser.json({ limit: "2mb" }));
app.use(cors("*"));

app.use('/s1/api/v1/tts', ttsRouter);

app.listen(PORT, () => console.log("Server listening on", PORT));
