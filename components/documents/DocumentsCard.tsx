'use client';
// =============================================================
// MPS Connect — Documents Needed Card (Phase 2)
// Client component: polls for fulfilment updates, issues tokens.
// All write operations go through server actions.
// =============================================================

import { useState, useEffect, useCallback, useTransition } from 'react';
import {
  FileCheck2, FileX2, File, Upload, Copy,
  CheckCircle2, Clock, AlertCircle, RefreshCw,
  BookOpen, Loader2, Bot,
} from 'lucide-react';
import { issueUploadToken } from '@/app/actions/documents';
import type { DocumentRequirement, CaseDocument } from '@/app/actions/documents';

interface Props {
  caseId:               number;
  initialRequirements:  (DocumentRequirement & { id: number; fulfilled: boolean })[];
  initialDocuments:     CaseDocument[];
  canWrite:             boolean;
}

// Group requirements by agency
function groupByAgency(reqs: (DocumentRequirement & { id: number; fulfilled: boolean })[]) {
  const map = new Map<string, (DocumentRequirement & { id: number; fulfilled: boolean })[]>();
  for (const r of reqs) {
    if (!map.has(r.agency)) map.set(r.agency, []);
    map.get(r.agency)!.push(r);
  }
  return map;
}

function relDays(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function DocumentsCard({ caseId, initialRequirements, initialDocuments, canWrite }: Props) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [documents, setDocuments]       = useState(initialDocuments);
  const [uploadUrl, setUploadUrl]       = useState<string | null>(null);
  const [expiresAt, setExpiresAt]       = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedOcr, setExpandedOcr]   = useState<Record<number, boolean>>({});
  const [copiedDocId, setCopiedDocId]   = useState<number | null>(null);

  // Refresh fulfilment status every 30 seconds
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/documents/status?caseId=${caseId}`);
      if (res.ok) {
        const data = await res.json();
        setRequirements(data.requirements);
        setDocuments(data.documents);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [caseId]);

  useEffect(() => {
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleIssueToken = () => {
    startTransition(async () => {
      setError(null);
      const result = await issueUploadToken(caseId);
      if (result.ok && result.url) {
        setUploadUrl(result.url);
        setExpiresAt(result.expiresAt ?? null);
      } else {
        setError(result.error ?? 'Failed to generate upload link.');
      }
    });
  };

  const handleCopy = async () => {
    if (!uploadUrl) return;
    await navigator.clipboard.writeText(uploadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyDoc = (docId: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDocId(docId);
    setTimeout(() => setCopiedDocId(null), 2000);
  };

  if (requirements.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-bold text-slate-900 mb-2">Documents Needed</h2>
        <p className="text-slate-400 text-sm">
          No documents required — run the causality engine to generate a document checklist.
        </p>
      </div>
    );
  }

  const grouped   = groupByAgency(requirements);
  const total     = requirements.length;
  const fulfilled = requirements.filter(r => r.fulfilled).length;
  const allDone   = fulfilled === total;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900">Documents Needed</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {fulfilled}/{total} collected
            {allDone && <span className="text-green-600 font-semibold"> · All received</span>}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          title="Refresh fulfilment status"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${total > 0 ? (fulfilled / total) * 100 : 0}%` }}
        />
      </div>

      {/* Requirements by agency */}
      <div className="divide-y divide-slate-50">
        {[...grouped.entries()].map(([agency, reqs]) => (
          <div key={agency} className="px-5 py-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
              {agency}
            </p>
            <div className="space-y-2.5">
              {reqs.map(req => (
                <div key={req.id} className="flex items-start gap-2.5">
                  {/* Fulfilment icon */}
                  <div className="shrink-0 mt-0.5">
                    {req.fulfilled
                      ? <FileCheck2 size={16} className="text-green-500" />
                      : req.required
                        ? <FileX2   size={16} className="text-red-400" />
                        : <File     size={16} className="text-slate-300" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${req.fulfilled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {req.documentType}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{req.reason}</p>
                    {!req.required && (
                      <span className="inline-block mt-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        strengthens case
                      </span>
                    )}
                    {req.sourceType === 'government_request' && req.sourceInstitution && (
                      <span className="inline-block mt-1 text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                        G2G: {req.sourceInstitution}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Upload link section */}
      {canWrite && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100">
          {!uploadUrl ? (
            <button
              id="issue-upload-link-btn"
              onClick={handleIssueToken}
              disabled={isPending || allDone}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all
                ${allDone
                  ? 'bg-green-50 text-green-600 border border-green-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
              {allDone
                ? <><CheckCircle2 size={15} /> All documents received</>
                : isPending
                  ? <><Clock size={15} className="animate-spin" /> Generating…</>
                  : <><Upload size={15} /> Issue Upload Link</>}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={uploadUrl}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 truncate"
                />
                <button
                  onClick={handleCopy}
                  className="shrink-0 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all"
                >
                  {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              {expiresAt && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock size={11} />
                  Expires {new Date(expiresAt).toLocaleString('en-SG')} · single use
                </p>
              )}
              <button
                onClick={handleIssueToken}
                disabled={isPending}
                className="text-xs text-blue-600 hover:underline"
              >
                Issue a new link (invalidates previous)
              </button>
            </div>
          )}

          {error && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={13} />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Uploaded documents list */}
      {documents.length > 0 && (
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
            Received Files ({documents.length})
          </p>
          <div className="space-y-2">
            {documents.map(doc => {
              const hasOcr = doc.ocrStatus === 'completed' && doc.ocrText;
              const isProcessing = doc.ocrStatus === 'processing';
              const isFailed = doc.ocrStatus === 'failed';
              const isExpanded = !!expandedOcr[doc.id];

              return (
                <div key={doc.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-slate-50/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {doc.scanStatus === 'clean'    && <FileCheck2 size={14} className="text-green-500 shrink-0" />}
                      {doc.scanStatus === 'rejected' && <FileX2    size={14} className="text-red-400 shrink-0" />}
                      {doc.scanStatus === 'pending'  && <Clock     size={14} className="text-amber-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{doc.filename}</p>
                        <p className="text-[10px] text-slate-400">{(doc.fileSizeBytes / 1024).toFixed(0)} KB · {relDays(doc.uploadedAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isProcessing && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex items-center gap-0.5 border border-blue-200">
                          <Loader2 size={8} className="animate-spin" /> Processing
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                          OCR Failed
                        </span>
                      )}
                      {hasOcr && (
                        <button
                          onClick={() => setExpandedOcr(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                          className="text-[9px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-0.5 border border-indigo-200"
                        >
                          <BookOpen size={8} />
                          {isExpanded ? 'Hide Text' : 'View Text'}
                        </button>
                      )}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded
                        ${doc.scanStatus === 'clean'    ? 'bg-green-100 text-green-700' :
                          doc.scanStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                                                          'bg-amber-100 text-amber-700'}`}>
                        {doc.scanStatus}
                      </span>
                    </div>
                  </div>

                  {/* OCR Extracted Text Display */}
                  {hasOcr && isExpanded && (
                    <div className="border-t border-slate-100 px-3 py-2 bg-white space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-0.5">
                          <Bot size={10} className="text-indigo-500" /> Extracted Text (GLM-OCR)
                        </span>
                        <button
                          onClick={() => handleCopyDoc(doc.id, doc.ocrText || '')}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                          {copiedDocId === doc.id ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <pre className="text-[10px] text-slate-600 font-mono whitespace-pre-wrap bg-slate-50 p-2 rounded border border-slate-200 max-h-40 overflow-y-auto leading-normal">
                        {doc.ocrText}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
