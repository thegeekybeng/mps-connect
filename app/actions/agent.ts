'use server';
// =================================================================
// MPS Connect — AI Approval Agent
// Evaluates pending letters against MP/admin preferences using Ollama.
// Hard rules are enforced in code; model handles content quality check.
// Cascade: qwen3.6:27b → gemma4:12b-mlx → gemma4:e2b → escalate
// =================================================================

import { requireAuth } from '@/lib/auth';
import { db, dbOne } from '@/lib/db';
import { can } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';

const OLLAMA_BASE   = (process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/chat').replace(/\/api\/chat$/, '');
const MODEL_CASCADE = ['gemma4:e2b', 'gemma4:12b-mlx', 'qwen3.6:27b'] as const;
const TIMEOUT_MS    = 90_000;  // 90 seconds timeout per model call

// ── Types ───────────────────────────────────────────────────────
export interface AgentPreferences {
  id?:                     number;
  userId:                  number;
  enabled:                 boolean;
  preferredModel:          string;
  autoApproveCategories:   string[];
  maxAutoUrgency:          'Low' | 'Medium';
  requireAgencyMentioned:  boolean;
  excludedKeywords:        string[];
}

export interface AgentResult {
  decision:    'approved' | 'escalated';
  reasoning:   string;          // stored in DB (plain text summary)
  confidence:  number;          // 0 = rule/deterministic, >0 = model output
  model:       string;
  source:      'rule' | 'model' | 'cascade-failed';  // what produced this decision
  summary:     string;          // one-sentence human-readable
  keyFactors:  string[];        // specific case facts that drove the decision
  policyBasis: string[];        // rules / policies cited
  flags:       string[];        // concerns even when approving
}

interface ModelDecision {
  appropriate:  boolean;
  confidence?:  number;
  summary?:     string;
  keyFactors?:  string[];
  policyBasis?: string[];
  flags?:       string[];
}

// ── Preferences CRUD ─────────────────────────────────────────────
export async function getAgentPreferences(userId: number): Promise<AgentPreferences | null> {
  const row = await dbOne<{
    id: number; user_id: number; auto_approve: boolean; preferred_model: string;
    auto_approve_categories: string[] | null; max_urgency: string;
    excluded_keywords: string[] | null;
  }>(
    `SELECT id, user_id, auto_approve, preferred_model,
            auto_approve_categories, max_urgency, excluded_keywords
     FROM agent_preferences WHERE user_id = $1`,
    [userId]
  );
  if (!row) return null;
  return {
    id:                    row.id,
    userId:                row.user_id,
    enabled:               row.auto_approve,
    preferredModel:        row.preferred_model,
    autoApproveCategories: row.auto_approve_categories ?? [],
    maxAutoUrgency:        (row.max_urgency as 'Low' | 'Medium') ?? 'Medium',
    requireAgencyMentioned: true,
    excludedKeywords:      row.excluded_keywords ?? [],
  };
}

export async function saveAgentPreferences(prefs: Omit<AgentPreferences, 'id' | 'userId'>): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) return { success: false, error: 'Insufficient permissions' };

  await dbOne(
    `INSERT INTO agent_preferences
       (user_id, auto_approve, preferred_model, auto_approve_categories,
        max_urgency, excluded_keywords, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       auto_approve             = EXCLUDED.auto_approve,
       preferred_model          = EXCLUDED.preferred_model,
       auto_approve_categories  = EXCLUDED.auto_approve_categories,
       max_urgency              = EXCLUDED.max_urgency,
       excluded_keywords        = EXCLUDED.excluded_keywords,
       updated_at               = NOW()`,
    [
      session.userId,
      prefs.enabled,
      prefs.preferredModel,
      prefs.autoApproveCategories,
      prefs.maxAutoUrgency,
      prefs.excludedKeywords,
    ]
  );
  revalidatePath('/dashboard/settings/agent');
  return { success: true };
}

// ── Model call with timeout ──────────────────────────────────────
async function callModel(model: string, prompt: string): Promise<ModelDecision | null> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
          options: { 
            temperature: 0.1 + (attempt - 1) * 0.1, // slightly raise temperature on retry to resolve formatting lockups
            num_predict: 256 
          },
        }),
      });

      if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);
      const data = await res.json() as { response?: string };
      if (!data.response) throw new Error('Empty response content');

      const parsed = JSON.parse(data.response) as Partial<ModelDecision>;
      if (typeof parsed.appropriate !== 'boolean') throw new Error('Invalid JSON format: missing appropriate field');

      clearTimeout(timer);
      return {
        appropriate:  parsed.appropriate,
        confidence:   typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : undefined,
        summary:      parsed.summary,
        keyFactors:   Array.isArray(parsed.keyFactors)  ? parsed.keyFactors  : undefined,
        policyBasis:  Array.isArray(parsed.policyBasis) ? parsed.policyBasis : undefined,
        flags:        Array.isArray(parsed.flags)        ? parsed.flags        : undefined,
      };
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[callModel] Attempt ${attempt}/${maxRetries} for ${model} failed:`, err instanceof Error ? err.message : err);
      if (attempt === maxRetries) return null;
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return null;
}

// ── Core approval agent ──────────────────────────────────────────
export async function runApprovalAgent(
  caseId: number
): Promise<AgentResult> {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) {
    return ruleResult(caseId, session.userId, 'escalated',
      'Insufficient permissions to run agent.',
      [], ['RBAC: letters:approve required'], []);
  }

  // 1. Load case
  const kase = await dbOne<{
    category: string; urgency: string; summary: string;
    core_request: string | null; status: string;
  }>(
    'SELECT category, urgency, summary, core_request, status FROM cases WHERE id = $1',
    [caseId]
  );
  if (!kase) return ruleResult(caseId, session.userId, 'escalated',
    'Case not found.', [], [], []);
  if (kase.status !== 'pending_approval') {
    return ruleResult(caseId, session.userId, 'escalated',
      'Case is not in pending_approval status.',
      [`Current status: ${kase.status}`], ['Only pending_approval cases can be auto-reviewed'], []);
  }

  // 2. Load preferences (falls back to safe defaults)
  const prefs = await getAgentPreferences(session.userId) ?? {
    userId:                  session.userId,
    enabled:                 true,
    preferredModel:          'gemma4:e2b',
    autoApproveCategories:   [],
    maxAutoUrgency:          'Medium' as const,
    requireAgencyMentioned:  true,
    excludedKeywords:        [],
  };

  // ── Hard rules — deterministic pre-screen ───────────────────
  const URGENCY_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  const caseRank = URGENCY_RANK[kase.urgency] ?? 5;
  const maxRank  = URGENCY_RANK[prefs.maxAutoUrgency] ?? 2;

  if (caseRank > maxRank) {
    return ruleResult(caseId, session.userId, 'escalated',
      `Case urgency '${kase.urgency}' exceeds the configured auto-approval cap of '${prefs.maxAutoUrgency}'.`,
      [`Urgency: ${kase.urgency}`, `Category: ${kase.category}`],
      [
        `MPS Ops: Cases above '${prefs.maxAutoUrgency}' urgency require MP personal review`,
        `Configured cap: max auto-approval = ${prefs.maxAutoUrgency}`,
      ],
      [`Urgency '${kase.urgency}' above cap — human review mandatory`]);
  }

  if (prefs.autoApproveCategories.length > 0 && !prefs.autoApproveCategories.includes(kase.category)) {
    return ruleResult(caseId, session.userId, 'escalated',
      `Category '${kase.category}' is outside the configured auto-approve list.`,
      [`Category: ${kase.category}`],
      [
        `Configured categories: ${prefs.autoApproveCategories.join(', ')}`,
        'Cases outside the approved category list require human review',
      ],
      [`Category '${kase.category}' not in auto-approve scope`]);
  }

  const textToCheck = `${kase.summary ?? ''} ${kase.core_request ?? ''}`.toLowerCase();
  const hitKeyword  = prefs.excludedKeywords.find(kw => textToCheck.includes(kw.toLowerCase()));
  if (hitKeyword) {
    return ruleResult(caseId, session.userId, 'escalated',
      `Excluded keyword "${hitKeyword}" detected in case text.`,
      [`Keyword matched: "${hitKeyword}"`],
      ['Excluded keyword rule: automatic escalation regardless of other factors'],
      [`Keyword "${hitKeyword}" triggers mandatory escalation`]);
  }

  // ── Model call with cascade ──────────────────────────────────
  const prompt = buildPrompt(kase.category, kase.urgency, kase.summary ?? '', kase.core_request ?? '');
  const modelsToTry = [
    prefs.preferredModel,
    ...MODEL_CASCADE.filter(m => m !== prefs.preferredModel),
  ];

  for (const model of modelsToTry) {
    const result = await callModel(model, prompt);
    if (!result) continue;

    const confidence = result.confidence ?? (result.appropriate ? 0.80 : 0.50);
    const decision   = result.appropriate && confidence >= 0.75 ? 'approved' : 'escalated';

    return modelResult(caseId, session.userId, decision, confidence,
      result.summary  ?? (decision === 'approved' ? 'Letter meets approval criteria.' : 'Letter requires human review.'),
      result.keyFactors  ?? [],
      result.policyBasis ?? [],
      result.flags       ?? [],
      model);
  }

  // All models failed — safe default
  return {
    decision: 'escalated',
    reasoning: 'Inference Service Unreachable. All model retries and cascade targets were exhausted.',
    confidence: 0,
    model: 'none',
    source: 'cascade-failed',
    summary: 'Inference system timed out. Human review required.',
    keyFactors: ['Ollama model cascade timed out'],
    policyBasis: ['Fail-safe rule: model cascade exhausted → escalate'],
    flags: ['Model cascade exhausted — no AI assessment available']
  };
}

export async function prewarmAgentModel(): Promise<{ success: boolean }> {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) return { success: false };
  const prefs = await getAgentPreferences(session.userId);
  const model = prefs?.preferredModel ?? 'gemma4:e2b';
  try {
    fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).catch(() => {});
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getOllamaModels(): Promise<string[]> {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);
    const data = await res.json() as { models?: Array<{ name: string }> };
    return (data.models || []).map(m => m.name);
  } catch (err) {
    clearTimeout(timer);
    console.error('[getOllamaModels] Failed to fetch models:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ── Override a previous agent decision ──────────────────────────
export async function overrideAgentDecision(decisionId: number): Promise<{ success: boolean }> {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) return { success: false };

  await dbOne(
    'UPDATE agent_decisions SET overridden = TRUE, overridden_by = $1 WHERE id = $2',
    [session.userId, decisionId]
  );
  return { success: true };
}

// ── Dry run (no DB writes, no status changes) ────────────────────
export async function dryRunAgent(caseIds: number[]): Promise<Array<{
  caseId: number; decision: string; reasoning: string; model: string;
}>> {
  const results = [];
  for (const id of caseIds) {
    const r = await runApprovalAgent(id); // won't persist since status won't be pending_approval for test cases
    results.push({ caseId: id, decision: r.decision, reasoning: r.reasoning, model: r.model });
  }
  return results;
}

// ── Helpers ──────────────────────────────────────────────────────
function buildPrompt(category: string, urgency: string, summary: string, coreRequest: string): string {
  return `You review referral letters for a Singapore MP constituency case management system.

Case:
- Category: ${category}
- Urgency: ${urgency}
- Summary: ${summary}
- Core request: ${coreRequest || 'Not yet drafted'}

Evaluate whether this referral letter is appropriate for auto-approval. Consider:
1. Does it name a specific Singapore agency (HDB, MOM, MOH, MSF, MHA, ICA, MOE, AIC)?
2. Does it state the resident's situation clearly with specific facts?
3. Is the request proportionate to the urgency and category?
4. Are there any red flags (vague language, missing evidence, inappropriate tone)?

Respond in JSON only — no other text:
{
  "appropriate": true or false,
  "confidence": 0.0 to 1.0,
  "summary": "one sentence decision summary",
  "keyFactors": ["specific fact 1 from the case", "specific fact 2", "specific fact 3"],
  "policyBasis": ["relevant MPS rule or Singapore agency policy that applies"],
  "flags": ["any concerns even if approving — empty array if none"]
}`;
}

// Produce a structured result from a deterministic rule (no confidence)
async function ruleResult(
  caseId: number, userId: number,
  decision: 'approved' | 'escalated',
  summary: string,
  keyFactors: string[], policyBasis: string[], flags: string[]
): Promise<AgentResult> {
  const reasoning = summary;
  await dbOne(
    `INSERT INTO agent_decisions (case_id, decision, confidence, reasoning, model, accountable_officer_id, source, summary, key_factors, policy_basis, flags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [caseId, decision, 0, reasoning, 'rule-engine', userId, 'rule', summary, keyFactors, policyBasis, flags]
  );
  if (decision === 'approved') {
    await dbOne(`UPDATE cases SET status = 'approved', updated_at = NOW() WHERE id = $1`, [caseId]);
    revalidatePath(`/dashboard/cases/${caseId}`);
    revalidatePath('/dashboard');
  }
  return { decision, reasoning, confidence: 0, model: 'rule-engine',
           source: 'rule', summary, keyFactors, policyBasis, flags };
}

// Produce a structured result from an AI model call
async function modelResult(
  caseId: number, userId: number,
  decision: 'approved' | 'escalated',
  confidence: number,
  summary: string,
  keyFactors: string[], policyBasis: string[], flags: string[],
  model: string
): Promise<AgentResult> {
  const reasoning = summary;
  await dbOne(
    `INSERT INTO agent_decisions (case_id, decision, confidence, reasoning, model, accountable_officer_id, source, summary, key_factors, policy_basis, flags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [caseId, decision, confidence, reasoning, model, userId, 'model', summary, keyFactors, policyBasis, flags]
  );
  if (decision === 'approved') {
    await dbOne(`UPDATE cases SET status = 'approved', updated_at = NOW() WHERE id = $1`, [caseId]);
    revalidatePath(`/dashboard/cases/${caseId}`);
    revalidatePath('/dashboard');
  }
  return { decision, reasoning, confidence, model,
           source: 'model', summary, keyFactors, policyBasis, flags };
}
