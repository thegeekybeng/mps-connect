'use client';
// Upload form — renders per-requirement file inputs and submits
// to POST /api/upload/{token}. One requirement per upload submit
// so each file is individually tracked and ClamAV-scanned.

import { useState } from 'react';
import { FileCheck2, FileX2, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Requirement {
  id:           number;
  agency:       string;
  documentType: string;
  reason:       string;
  required:     boolean;
  sourceType:   'resident' | 'government_request';
}

interface UploadState {
  status:  'idle' | 'uploading' | 'success' | 'error';
  message: string;
}

const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp';

export default function UploadForm({
  token,
  requirements,
}: {
  token: string;
  requirements: Requirement[];
}) {
  const [states, setStates] = useState<Record<number, UploadState>>(
    Object.fromEntries(requirements.map(r => [r.id, { status: 'idle', message: '' }]))
  );

  const setReqState = (id: number, next: UploadState) =>
    setStates(prev => ({ ...prev, [id]: next }));

  const handleUpload = async (req: Requirement, file: File) => {
    setReqState(req.id, { status: 'uploading', message: 'Uploading and scanning…' });

    const form = new FormData();
    form.append('file', file);
    form.append('requirementId', String(req.id));

    try {
      const res = await fetch(`/api/upload/${token}`, { method: 'POST', body: form });
      const data = await res.json();

      if (res.ok) {
        setReqState(req.id, {
          status: 'success',
          message: `✓ ${data.filename} received (${data.scanStatus})`,
        });
      } else {
        setReqState(req.id, { status: 'error', message: data.error ?? 'Upload failed.' });
      }
    } catch {
      setReqState(req.id, { status: 'error', message: 'Network error. Please try again.' });
    }
  };

  // Group by agency
  const byAgency = new Map<string, Requirement[]>();
  for (const r of requirements) {
    if (!byAgency.has(r.agency)) byAgency.set(r.agency, []);
    byAgency.get(r.agency)!.push(r);
  }

  return (
    <div className="space-y-4">
      {[...byAgency.entries()].map(([agency, reqs]) => (
        <div key={agency} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">{agency}</p>
          </div>

          <div className="divide-y divide-slate-50">
            {reqs.map(req => {
              const state = states[req.id] ?? { status: 'idle', message: '' };
              const done  = state.status === 'success';

              return (
                <div key={req.id} className="px-5 py-4">
                  {/* Document label */}
                  <div className="flex items-start gap-2 mb-3">
                    <div className="shrink-0 mt-0.5">
                      {done
                        ? <FileCheck2 size={16} className="text-green-500" />
                        : <FileX2 size={16} className="text-red-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{req.documentType}</p>
                      <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{req.reason}</p>
                      <div className="flex gap-1.5 mt-1.5">
                        {!req.required && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            optional — strengthens case
                          </span>
                        )}
                        {req.sourceType === 'government_request' && (
                          <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                            G2G request
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Upload input */}
                  {!done ? (
                    <div>
                      <label
                        htmlFor={`file-${req.id}`}
                        className={`flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all text-sm
                          ${state.status === 'uploading'
                            ? 'border-blue-300 bg-blue-50 text-blue-600'
                            : state.status === 'error'
                              ? 'border-red-300 bg-red-50 text-red-600'
                              : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500'}`}
                      >
                        <Upload size={15} />
                        {state.status === 'uploading' ? 'Scanning…' : 'Choose file to upload'}
                      </label>
                      <input
                        id={`file-${req.id}`}
                        type="file"
                        accept={ACCEPTED}
                        className="hidden"
                        disabled={state.status === 'uploading'}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(req, file);
                        }}
                      />
                      <p className="text-xs text-slate-400 mt-1.5 text-center">
                        PDF, JPEG, PNG or WebP · max 10 MB
                      </p>
                    </div>
                  ) : null}

                  {/* Status message */}
                  {state.message && (
                    <div className={`mt-2 flex items-center gap-2 text-xs rounded-lg px-3 py-2
                      ${state.status === 'success' ? 'bg-green-50 text-green-700' :
                        state.status === 'error'   ? 'bg-red-50 text-red-700' :
                                                      'bg-blue-50 text-blue-700'}`}
                    >
                      {state.status === 'success' && <CheckCircle2 size={13} />}
                      {state.status === 'error'   && <AlertCircle  size={13} />}
                      {state.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
