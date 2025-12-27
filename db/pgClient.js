import pg from 'pg';
import { configDotenv } from "dotenv";
configDotenv();

const pgClient = new pg.Client({
  user:process.env.PGUSERNAME,
  password: process.env.PGPASS,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database:process.env.PGDATABASE,
})

export default pgClient;