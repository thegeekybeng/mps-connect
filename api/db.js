'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'mps-postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'mps',
  password: process.env.POSTGRES_PASSWORD || 'mps_secret',
  database: process.env.POSTGRES_DB || 'mps_connect',
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id          SERIAL PRIMARY KEY,
        ts          TIMESTAMP WITH TIME ZONE NOT NULL,
        event_type  TEXT NOT NULL,
        session_id  TEXT,
        ip_hash     TEXT,
        input_len   INTEGER,
        output_len  INTEGER,
        is_urgent   INTEGER,
        canary_det  INTEGER,
        detail      TEXT,
        prev_hash   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS case_events (
        id          SERIAL PRIMARY KEY,
        ts          TIMESTAMP WITH TIME ZONE NOT NULL,
        case_ref    TEXT NOT NULL,
        status_code TEXT NOT NULL,
        actor       TEXT NOT NULL,
        note        TEXT,
        prev_hash   TEXT NOT NULL
      );
    `);
    console.log('[DB] Initialization complete');
  } catch (err) {
    console.error('[DB] Initialization failed:', err);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
