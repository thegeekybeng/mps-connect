'use client';
// =============================================================
// MPS Connect — Gate 1: Low Confidence Warning (HITL Gate 1)
//
// Non-blocking display gate. Surfaces a visible amber warning
// banner when any causal node confidence score is below the
// threshold (0.6). Ensures the Writer sees the warning before
// proceeding with the case.
//
// Matches existing component patterns in CaseApprovalBar.tsx
// and CaseIntelligencePanel.tsx.
// =============================================================

import { AlertTriangle } from 'lucide-react';

const CONFIDENCE_THRESHOLD = 0.6;

interface CausalNode {
  id?: string;
  label?: string;
  confidence?: number;
  type?: string;
}

interface Props {
  /** Array of causal graph nodes with confidence scores */
  nodes: CausalNode[];
  /** Overall urgency score (0-10 scale, normalised to 0-1 internally) */
  urgencyScore?: number;
}

/**
 * HITL Gate 1 — Low Confidence Warning
 *
 * Renders an amber warning banner when any causal node has a
 * confidence score below the threshold. Non-blocking — the Writer
 * can still proceed, but must see the warning.
 */
export default function LowConfidenceWarning({ nodes, urgencyScore }: Props) {
  // Find all nodes below the confidence threshold
  const lowConfidenceNodes = nodes.filter(
    n => typeof n.confidence === 'number' && n.confidence < CONFIDENCE_THRESHOLD
  );

  // Also check overall urgency score (0-10 scale → normalise to 0-1)
  const normalisedUrgency = typeof urgencyScore === 'number'
    ? urgencyScore / 10
    : undefined;
  const urgencyBelowThreshold = typeof normalisedUrgency === 'number'
    && normalisedUrgency < CONFIDENCE_THRESHOLD;

  // Nothing to warn about
  if (lowConfidenceNodes.length === 0 && !urgencyBelowThreshold) {
    return null;
  }

  const minConfidence = lowConfidenceNodes.length > 0
    ? Math.min(...lowConfidenceNodes.map(n => n.confidence!))
    : undefined;

  return (
    <div
      id="hitl-gate-1-warning"
      className="rounded-2xl border p-5 bg-amber-50 border-amber-200"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-bold text-sm text-amber-800 flex items-center gap-2">
            HITL Gate 1 — Low Confidence Warning
          </p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            The AI analysis contains{' '}
            <strong>{lowConfidenceNodes.length} finding{lowConfidenceNodes.length !== 1 ? 's' : ''}</strong>
            {' '}with confidence below {Math.round(CONFIDENCE_THRESHOLD * 100)}%.
            {minConfidence !== undefined && (
              <> Lowest confidence: <strong>{Math.round(minConfidence * 100)}%</strong>.</>
            )}
            {urgencyBelowThreshold && (
              <> Overall urgency assessment confidence is also below threshold.</>
            )}
          </p>
          <p className="text-xs text-amber-600 mt-2 italic">
            Review the flagged items carefully before proceeding. Low-confidence findings
            may require additional information from the resident.
          </p>

          {/* List specific low-confidence nodes */}
          {lowConfidenceNodes.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {lowConfidenceNodes.map((node, i) => (
                <div
                  key={node.id ?? i}
                  className="flex items-center gap-2 text-xs bg-amber-100 rounded-lg px-3 py-1.5"
                >
                  <span className="font-mono text-amber-800 font-bold shrink-0">
                    {Math.round((node.confidence ?? 0) * 100)}%
                  </span>
                  <span className="text-amber-900">
                    {node.label ?? node.id ?? `Node ${i + 1}`}
                  </span>
                  {node.type && (
                    <span className="ml-auto text-amber-600 text-[10px] uppercase font-semibold">
                      {node.type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
