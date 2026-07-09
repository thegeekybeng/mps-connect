'use strict';
// =============================================================
// MPS Connect — Immutable AI Audit Log
// Replaces console.log-only auditLog with SQLite prev_hash chain.
// Chain integrity: each row stores SHA-256 of the previous row's
// key fields. Any retroactive edit breaks the chain detectably.
// Volume-mounted at /data/audit.db — survives container restarts.
// =============================================================

const Database = require('better-sqlite3');
const crypto   = require('crypto');
const path     = require('path');

const DB_PATH = process.env.AUDIT_DB_PATH || '/data/audit.db';

// Open (or create) the SQLite database — non-fatal if /data is not writable.
// On permission failure the server stays up and all events are emitted to stdout
// (Docker captures stdout). SQLite persistence resumes after volume is fixed.
let db = null;
let INSERT = null;
let LAST   = null;

try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('journal_size_limit = 10485760'); // 10MB limit on WAL file before auto-checkpointing
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         TEXT    NOT NULL,
      event_type TEXT    NOT NULL,
      session_id TEXT,
      ip_hash    TEXT,
      input_len  INTEGER,
      output_len INTEGER,
      is_urgent  INTEGER,
      canary_det INTEGER,
      detail     TEXT,
      prev_hash  TEXT    NOT NULL
    );
  `);
  INSERT = db.prepare(`
    INSERT INTO audit_events
      (ts, event_type, session_id, ip_hash, input_len, output_len,
       is_urgent, canary_det, detail, prev_hash)
    VALUES
      (@ts, @event_type, @session_id, @ip_hash, @input_len, @output_len,
       @is_urgent, @canary_det, @detail, @prev_hash)
  `);
  LAST = db.prepare(
    'SELECT id, ts, detail, prev_hash FROM audit_events ORDER BY id DESC LIMIT 1'
  );
  console.log('[audit] SQLite audit chain initialised at', DB_PATH);
} catch (err) {
  console.error('[audit] SQLite unavailable — falling back to stdout only:', err.message);
  console.error('[audit] Fix: ensure the audit-data volume is owned by the aiproxy user.');
  db = null;
}

// Genesis constant — first row chains against this
const GENESIS = 'MPS-CONNECT-AUDIT-GENESIS-V1';

/**
 * Write one audit event and chain it to the previous row.
 * Also emits to stdout so Docker log capture still works.
 *
 * @param {string} type  - Event type e.g. CHAT | CAUSALITY | BLOCKED_ORIGIN
 * @param {object} meta  - Arbitrary metadata (no PII — PII stripped before this call)
 */
function writeAuditEvent(type, meta = {}) {
  const ts = new Date().toISOString();

  // Always emit to stdout — Docker log capture works regardless of SQLite state
  console.log(JSON.stringify({ ts, type, ...meta }));

  if (!db || !INSERT || !LAST) return; // SQLite unavailable — stdout-only mode

  const last = LAST.get();
  const chainInput = last
    ? `${last.id}|${last.ts}|${last.detail}|${last.prev_hash}`
    : GENESIS;
  const prevHash = crypto.createHash('sha256').update(chainInput).digest('hex');

  const row = {
    ts,
    event_type: type,
    session_id: meta.sessionId  ?? null,
    ip_hash:    meta.ipHash     ?? null,
    input_len:  meta.inputLen   ?? 0,
    output_len: meta.outputLen  ?? 0,
    is_urgent:  meta.isUrgent   ? 1 : 0,
    canary_det: meta.canaryDet  ? 1 : 0,
    detail:     JSON.stringify(meta),
    prev_hash:  prevHash,
  };

  INSERT.run(row);
}

/**
 * Verify chain integrity from startId to end of table.
 * Returns { ok: true } or { ok: false, brokenAt: rowId }.
 */
function verifyChain(startId = 1) {
  if (!db) return { ok: false, brokenAt: null, reason: 'SQLite unavailable' };
  const rows = db.prepare(
    'SELECT id, ts, detail, prev_hash FROM audit_events WHERE id >= ? ORDER BY id'
  ).all(startId);

  let expectedPrev = GENESIS;
  let prevId = null;

  for (const row of rows) {
    // The first row in the scan has no prior context — compute from genesis
    if (prevId === null) {
      const chainInput = GENESIS;
      const expected = crypto.createHash('sha256').update(chainInput).digest('hex');
      if (row.id === 1 && row.prev_hash !== expected) {
        return { ok: false, brokenAt: row.id };
      }
      prevId = row.id;
      expectedPrev = `${row.id}|${row.ts}|${row.detail}|${row.prev_hash}`;
      continue;
    }

    const expected = crypto.createHash('sha256').update(expectedPrev).digest('hex');
    if (row.prev_hash !== expected) {
      return { ok: false, brokenAt: row.id };
    }
    prevId = row.id;
    expectedPrev = `${row.id}|${row.ts}|${row.detail}|${row.prev_hash}`;
  }

  return { ok: true };
}

module.exports = { writeAuditEvent, verifyChain, db };
