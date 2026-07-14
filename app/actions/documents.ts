'use server';
// =============================================================
// MPS Connect — Document Collection Server Actions (Phase 2)
// All actions run server-side only. Token is the sole credential
// for the public upload portal — no auth cookie required there.
// =============================================================

import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';

// ── Types ─────────────────────────────────────────────────────

export interface DocumentRequirement {
  id?:                number;
  caseId:             number;
  agency:             string;
  documentType:       string;
  reason:             string;
  relatedNodeIds?:    string[];
  required:           boolean;
  sourceType:         'resident' | 'government_request';
  sourceInstitution?: string;
  fulfilled?:         boolean;
}

export interface UploadTokenRecord {
  id:        number;
  caseId:    number;
  token:     string;
  expiresAt: string;
  used:      boolean;
}

export interface CaseDocument {
  id:             number;
  caseId:         number;
  requirementId?: number;
  tokenId?:       number;
  filename:       string;
  mimeType:       string;
  fileSizeBytes:  number;
  scanStatus:     'pending' | 'clean' | 'rejected';
  scanDetail?:    string;
  ocrText?:       string;
  ocrStatus?:     'pending' | 'processing' | 'completed' | 'failed';
  uploadedAt:     string;
}

// ── Save document requirements (called after causality) ────────

/**
 * Persists the documentRequirements[] from the causality engine.
 * Replaces any existing rows for this case (re-running causality
 * produces a fresh list).
 */
export async function saveDocumentRequirements(
  caseId: number,
  requirements: DocumentRequirement[]
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAuth();
  if (!can(session.role, 'cases:update')) {
    return { ok: false, error: 'Insufficient permissions' };
  }

  try {
    // Delete existing requirements for this case before re-inserting
    await db(
      'DELETE FROM document_requirements WHERE case_id = $1',
      [caseId]
    );

    if (requirements.length === 0) return { ok: true };

    for (const req of requirements) {
      await db(
        `INSERT INTO document_requirements
           (case_id, agency, document_type, reason, related_node_ids,
            required, source_type, source_institution)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          caseId,
          req.agency,
          req.documentType,
          req.reason,
          req.relatedNodeIds ?? [],
          req.required,
          req.sourceType,
          req.sourceInstitution ?? null,
        ]
      );
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Get document requirements (Case Intelligence panel) ────────

export async function getDocumentRequirements(caseId: number): Promise<{
  requirements: (DocumentRequirement & { id: number; fulfilled: boolean })[];
  documents: CaseDocument[];
  error?: string;
}> {
  const session = await requireAuth();
  if (!can(session.role, 'cases:read')) {
    return { requirements: [], documents: [], error: 'Insufficient permissions' };
  }

  const [requirements, documents] = await Promise.all([
    db<{
      id: number; case_id: number; agency: string; document_type: string;
      reason: string; related_node_ids: string[]; required: boolean;
      source_type: string; source_institution: string | null; fulfilled: boolean;
    }>(
      `SELECT id, case_id, agency, document_type, reason, related_node_ids,
              required, source_type, source_institution, fulfilled
       FROM document_requirements
       WHERE case_id = $1
       ORDER BY required DESC, agency`,
      [caseId]
    ),
    db<{
      id: number; case_id: number; requirement_id: number | null;
      token_id: number | null; filename: string; mime_type: string;
      file_size_bytes: number; scan_status: string; scan_detail: string | null;
      ocr_text: string | null; ocr_status: string;
      uploaded_at: string;
    }>(
      `SELECT id, case_id, requirement_id, token_id, filename, mime_type,
              file_size_bytes, scan_status, scan_detail, ocr_text, ocr_status, uploaded_at
       FROM case_documents
       WHERE case_id = $1
       ORDER BY uploaded_at DESC`,
      [caseId]
    ),
  ]);

  return {
    requirements: requirements.map(r => ({
      id:                r.id,
      caseId:            r.case_id,
      agency:            r.agency,
      documentType:      r.document_type,
      reason:            r.reason,
      relatedNodeIds:    r.related_node_ids,
      required:          r.required,
      sourceType:        r.source_type as 'resident' | 'government_request',
      sourceInstitution: r.source_institution ?? undefined,
      fulfilled:         r.fulfilled,
    })),
    documents: documents.map(d => ({
      id:             d.id,
      caseId:         d.case_id,
      requirementId:  d.requirement_id ?? undefined,
      tokenId:        d.token_id ?? undefined,
      filename:       d.filename,
      mimeType:       d.mime_type,
      fileSizeBytes:  d.file_size_bytes,
      scanStatus:     d.scan_status as 'pending' | 'clean' | 'rejected',
      scanDetail:     d.scan_detail ?? undefined,
      ocrText:        d.ocr_text ?? undefined,
      ocrStatus:      d.ocr_status as 'pending' | 'processing' | 'completed' | 'failed',
      uploadedAt:     d.uploaded_at,
    })),
  };
}

// ── Issue upload token ─────────────────────────────────────────

/**
 * Creates a single-use, 48-hour upload token linked to a case.
 * Returns the full portal URL for manual delivery to the resident.
 */
export async function issueUploadToken(
  caseId: number
): Promise<{ ok: boolean; token?: string; url?: string; expiresAt?: string; error?: string }> {
  const session = await requireAuth();
  if (!can(session.role, 'cases:update')) {
    return { ok: false, error: 'Insufficient permissions' };
  }

  const rows = await db<{ token: string; expires_at: string }>(
    `INSERT INTO upload_tokens (case_id, created_by)
     VALUES ($1, $2)
     RETURNING token::text, expires_at`,
    [caseId, session.id]
  );

  if (!rows[0]) return { ok: false, error: 'Failed to create token' };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3080';
  return {
    ok:        true,
    token:     rows[0].token,
    url:       `${baseUrl}/upload/${rows[0].token}`,
    expiresAt: rows[0].expires_at,
  };
}

// ── Validate upload token (public — called from upload API route) ──

/**
 * Validates a token string. Returns the full token record if valid.
 * Returns null if expired, used, or not found.
 * No authentication required — token is the credential.
 */
export async function getUploadToken(
  token: string
): Promise<UploadTokenRecord | null> {
  const rows = await db<{
    id: number; case_id: number; token: string;
    expires_at: string; used: boolean;
  }>(
    `SELECT id, case_id, token::text, expires_at, used
     FROM upload_tokens
     WHERE token = $1::uuid
       AND expires_at > NOW()
       AND used = FALSE`,
    [token]
  );

  if (!rows[0]) return null;
  return {
    id:        rows[0].id,
    caseId:    rows[0].case_id,
    token:     rows[0].token,
    expiresAt: rows[0].expires_at,
    used:      rows[0].used,
  };
}

// ── Mark requirement fulfilled ─────────────────────────────────

export async function markRequirementFulfilled(
  requirementId: number,
  documentId: number
): Promise<void> {
  await db(
    'UPDATE document_requirements SET fulfilled = TRUE WHERE id = $1',
    [requirementId]
  );
}

// ── Mark token used ────────────────────────────────────────────

export async function markTokenUsed(tokenId: number): Promise<void> {
  await db('UPDATE upload_tokens SET used = TRUE WHERE id = $1', [tokenId]);
}
