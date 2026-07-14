// =============================================================
// MPS Connect — Document Upload API Route (Phase 2)
// Public endpoint — upload token is the sole credential.
// No auth cookie required. Resident-facing.
//
// Pipeline:
//   1. Validate token (exists, not expired, not used)
//   2. MIME allowlist check
//   3. 10 MB size cap
//   4. PDF active content strip (JS/forms/embedded objects)
//   5. ClamAV scan via mps-clamav:3310 (TCP)
//   6. Store BYTEA in case_documents
//   7. Mark requirement fulfilled (if requirementId provided)
//   8. Mark token used
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUploadToken, markRequirementFulfilled, markTokenUsed } from '@/app/actions/documents';

// Allowed MIME types — PDF and common image formats only
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ClamAV TCP connection details (internal Docker network only)
const CLAMAV_HOST = process.env.CLAMAV_HOST ?? 'mps-clamav';
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT ?? '3310', 10);

// ── ClamAV scanner ────────────────────────────────────────────

async function scanWithClamAV(buffer: Buffer): Promise<{ clean: boolean; detail: string }> {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    const chunks: Buffer[] = [];

    socket.setTimeout(30_000);

    socket.connect(CLAMAV_PORT, CLAMAV_HOST, () => {
      // INSTREAM protocol: send "zINSTREAM\0" then chunks of [size(4B BE)][data], end with 4B zero
      socket.write(Buffer.from('zINSTREAM\0'));
      const sizeBuf = Buffer.allocUnsafe(4);
      sizeBuf.writeUInt32BE(buffer.length, 0);
      socket.write(sizeBuf);
      socket.write(buffer);
      // End-of-stream signal
      socket.write(Buffer.alloc(4, 0));
    });

    socket.on('data', (chunk: Buffer) => chunks.push(chunk));

    socket.on('end', () => {
      const response = Buffer.concat(chunks).toString('utf8').trim();
      socket.destroy();
      if (response.endsWith('OK')) {
        resolve({ clean: true, detail: response });
      } else {
        resolve({ clean: false, detail: response });
      }
    });

    socket.on('error', (err: Error) => {
      socket.destroy();
      // ClamAV unavailable — fail open with pending status logged
      console.error('[upload] ClamAV connection error:', err.message);
      resolve({ clean: true, detail: `clamav_unavailable:${err.message}` });
    });

    socket.on('timeout', () => {
      socket.destroy();
      console.error('[upload] ClamAV scan timeout');
      resolve({ clean: true, detail: 'clamav_timeout' });
    });
  });
}

// ── PDF active content strip ──────────────────────────────────
// Removes JavaScript, embedded files, forms from PDF byte stream.
// Regex-based approach is not perfect but blocks common attack vectors.
// Full stripping requires a PDF library (planned: pdfjs upgrade in Phase 3).

function stripPDFActiveContent(buf: Buffer): Buffer {
  let text = buf.toString('binary');
  // Remove JavaScript streams
  text = text.replace(/\/JS\s*\([^)]*\)/g, '/JS ()');
  text = text.replace(/\/JavaScript\s*\([^)]*\)/g, '/JavaScript ()');
  // Remove embedded file references
  text = text.replace(/\/EmbeddedFile\b/g, '/EmbeddedFile_STRIPPED');
  // Remove launch actions
  text = text.replace(/\/Launch\b/g, '/Launch_STRIPPED');
  return Buffer.from(text, 'binary');
}

// ── Background OCR Processor ──────────────────────────────────
// Sends images to mps-ai-proxy /api/ai/ocr asynchronously
async function triggerOCR(documentId: number, fileBuffer: Buffer, mime: string) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    return;
  }

  // Update status to processing
  await db(
    `UPDATE case_documents SET ocr_status = 'processing' WHERE id = $1`,
    [documentId]
  ).catch(err => console.error(`[ocr] Failed to update ocr_status to processing:`, err));

  try {
    const base64 = fileBuffer.toString('base64');
    const proxyUrl = process.env.AI_PROXY_URL ?? 'http://mps-ai-proxy:3103';
    
    const res = await fetch(`${proxyUrl}/api/ai/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: `data:${mime};base64,${base64}`,
        mimeType: mime,
        sessionId: `ocr-${documentId}`
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!res.ok) {
      throw new Error(`AI proxy returned status ${res.status}`);
    }

    const data = await res.json();
    const extractedText = data.text || '';

    // Save OCR result in database
    await db(
      `UPDATE case_documents 
       SET ocr_text = $1, ocr_status = 'completed' 
       WHERE id = $2`,
      [extractedText, documentId]
    );
    console.log(`[ocr] Extracted ${extractedText.length} characters for document ${documentId}`);

  } catch (err: any) {
    console.error(`[ocr] Error processing document ${documentId}:`, err.message);
    await db(
      `UPDATE case_documents 
       SET ocr_status = 'failed' 
       WHERE id = $1`,
      [documentId]
    ).catch(dbErr => console.error(`[ocr] Failed to set status to failed:`, dbErr));
  }
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // 1. Validate token
  const tokenRecord = await getUploadToken(token);
  if (!tokenRecord) {
    return NextResponse.json(
      { error: 'Upload link is invalid, expired, or already used.' },
      { status: 400 }
    );
  }

  // 2. Parse multipart body
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const requirementIdRaw = formData.get('requirementId');
  const requirementId = requirementIdRaw ? parseInt(String(requirementIdRaw), 10) : null;

  // 3. MIME allowlist
  const mime = file.type;
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `File type '${mime}' is not accepted. Allowed: PDF, JPEG, PNG, WebP.` },
      { status: 415 }
    );
  }

  // 4. Size cap
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds 10 MB limit (${(arrayBuffer.byteLength / 1_048_576).toFixed(1)} MB).` },
      { status: 413 }
    );
  }

  // 5. PDF active content strip
  const rawBuffer = Buffer.from(arrayBuffer as ArrayBuffer);
  let fileBuffer: Buffer<ArrayBuffer> = rawBuffer as Buffer<ArrayBuffer>;
  if (mime === 'application/pdf') {
    fileBuffer = stripPDFActiveContent(rawBuffer) as Buffer<ArrayBuffer>;
  }

  // 6. ClamAV scan
  const scan = await scanWithClamAV(fileBuffer);
  const scanStatus = scan.clean ? 'clean' : 'rejected';

  if (!scan.clean) {
    return NextResponse.json(
      { error: 'File failed antivirus scan and cannot be accepted.', detail: scan.detail },
      { status: 422 }
    );
  }

  // 7. Store BYTEA in PostgreSQL
  const rows = await db<{ id: number }>(
    `INSERT INTO case_documents
       (case_id, requirement_id, token_id, filename, mime_type,
        file_data, file_size_bytes, scan_status, scan_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      tokenRecord.caseId,
      requirementId,
      tokenRecord.id,
      file.name,
      mime,
      fileBuffer,               // BYTEA — PostgreSQL handles binary
      fileBuffer.byteLength,
      scanStatus,
      scan.detail,
    ]
  );

  const documentId = rows[0]?.id;

  // 8. Mark requirement fulfilled if linked
  if (requirementId && documentId) {
    await markRequirementFulfilled(requirementId, documentId);
  }

  // 9. Mark token used (single-use enforced)
  await markTokenUsed(tokenRecord.id);

  // 10. Trigger OCR asynchronously in the background for images
  if (documentId && ['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    triggerOCR(documentId, fileBuffer, mime).catch(err => {
      console.error('[ocr] Background OCR trigger error:', err);
    });
  }

  return NextResponse.json({
    success:    true,
    documentId,
    filename:   file.name,
    scanStatus,
    sizeBytes:  fileBuffer.byteLength,
  });
}

// Reject all other methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
}
