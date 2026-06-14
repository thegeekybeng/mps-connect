// =============================================================
// MPS Connect — Public Upload Portal (Phase 2)
// Resident-facing. No authentication required.
// Token is the sole credential — validated server-side.
// No PII shown — only case branch + priority.
// =============================================================

import type { Metadata } from 'next';
import { getUploadToken } from '@/app/actions/documents';
import { db } from '@/lib/db';
import UploadForm from '@/components/documents/UploadForm';
import { ShieldCheck, Info, AlertTriangle, CheckCircle2, Upload } from 'lucide-react';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const record = await getUploadToken(token);
  if (!record) return { title: 'Invalid Upload Link' };
  return { title: 'Upload Documents — MPS Connect' };
}

async function fetchRequirementsForToken(tokenId: number, caseId: number) {
  return db<{
    id: number; agency: string; document_type: string;
    reason: string; required: boolean; source_type: string; fulfilled: boolean;
  }>(
    `SELECT id, agency, document_type, reason, required, source_type, fulfilled
     FROM document_requirements
     WHERE case_id = $1 AND fulfilled = FALSE
     ORDER BY required DESC, agency`,
    [caseId]
  );
}

async function fetchCaseRef(caseId: number) {
  const rows = await db<{ case_number: string | null; urgency: string }>(
    'SELECT case_number, urgency FROM cases WHERE id = $1',
    [caseId]
  );
  return rows[0];
}

const URGENCY_STYLE: Record<string, string> = {
  Critical: 'urgency-critical',
  High:     'urgency-high',
  Medium:   'urgency-medium',
  Low:      'urgency-low',
};

export default async function UploadPortalPage({ params }: Props) {
  const { token } = await params;

  const tokenRecord = await getUploadToken(token);

  if (!tokenRecord) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--gov-surface-alt)' }}>
        {/* Masthead */}
        <div className="py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 shrink-0"
          style={{ background: '#1C3D5A', color: '#FFFFFF' }}>
          <Info size={13} />
          DEMO — Not an official Singapore Government service
        </div>

        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full gov-card p-8 text-center">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--gov-accent-50)' }}>
              <AlertTriangle size={24} style={{ color: 'var(--gov-accent)' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--gov-text)' }}>Upload Link Expired</h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
              This link is invalid, expired (48-hour limit), or has already been used.
              Please contact the constituency office for a new link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const [requirements, caseRef] = await Promise.all([
    fetchRequirementsForToken(tokenRecord.id, tokenRecord.caseId),
    fetchCaseRef(tokenRecord.caseId),
  ]);

  const caseLabel = caseRef?.case_number ?? `Case #${tokenRecord.caseId}`;
  const expiresAt = new Date(tokenRecord.expiresAt).toLocaleString('en-SG');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--gov-surface-alt)' }}>
      {/* Government masthead */}
      <div className="py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 shrink-0"
        style={{ background: '#1C3D5A', color: '#FFFFFF' }}>
        <Info size={13} />
        DEMO — Not an official Singapore Government service
      </div>

      {/* Header bar */}
      <header className="shrink-0" style={{ background: 'var(--gov-surface)', borderBottom: '1px solid var(--gov-border)' }}>
        <div className="max-w-xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--gov-primary)' }}>
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight" style={{ color: 'var(--gov-text)' }}>MPS Connect</p>
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--gov-text-muted)' }}>
              Secure Document Upload
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 py-8 px-4 sm:py-10">
        <div className="max-w-xl mx-auto space-y-6">

          {/* Header */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--gov-primary-50)' }}>
              <Upload size={24} style={{ color: 'var(--gov-primary)' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--gov-text)' }}>Upload Documents</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--gov-text-secondary)' }}>
              {caseLabel}
              {caseRef?.urgency && (
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${URGENCY_STYLE[caseRef.urgency] ?? ''}`}>
                  {caseRef.urgency}
                </span>
              )}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--gov-text-muted)' }}>Link expires: {expiresAt}</p>
          </div>

          {/* Privacy notice */}
          <div className="gov-card px-5 py-4" style={{ background: 'var(--gov-primary-50)' }}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
              <strong style={{ color: 'var(--gov-text)' }}>Privacy:</strong> Documents are stored securely and scanned for viruses
              before being accessible to constituency staff. Only the documents listed below
              are needed. Do not upload items not requested.
            </p>
          </div>

          {/* No requirements left */}
          {requirements.length === 0 ? (
            <div className="gov-card p-8 text-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ background: '#ECFDF5' }}>
                <CheckCircle2 size={24} style={{ color: '#059669' }} />
              </div>
              <h2 className="font-bold" style={{ color: 'var(--gov-text)' }}>All documents received</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--gov-text-secondary)' }}>
                Nothing more is needed at this time. Thank you.
              </p>
            </div>
          ) : (
            <UploadForm
              token={token}
              requirements={requirements.map(r => ({
                id:           r.id,
                agency:       r.agency,
                documentType: r.document_type,
                reason:       r.reason,
                required:     r.required,
                sourceType:   r.source_type as 'resident' | 'government_request',
              }))}
            />
          )}

          <p className="text-center text-xs" style={{ color: 'var(--gov-text-muted)' }}>
            Having trouble? Contact the constituency office directly.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 px-6 text-center shrink-0"
        style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-surface)' }}>
        <p className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>
          MPS Connect · Secure Document Upload Portal
        </p>
      </footer>
    </div>
  );
}
