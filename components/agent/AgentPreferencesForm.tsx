'use client';

import { useState, useTransition } from 'react';
import { saveAgentPreferences, type AgentPreferences } from '@/app/actions/agent';
import { Bot, Zap, Brain, Cpu, CheckCircle2, X, Plus, Loader2 } from 'lucide-react';

const ALL_CATEGORIES = [
  'Housing', 'Financial Assistance', 'Immigration', 'Employment',
  'Healthcare', 'Education', 'Infrastructure', 'Other'
];

const KNOWN_MODELS: Record<string, { label: string; tag: string; tagColor: string; icon: any; iconColor: string; desc: string }> = {
  'gemma4:e2b': {
    label: 'Gemma 4 2B',
    tag: 'Recommended',
    tagColor: 'bg-emerald-100 text-emerald-700',
    icon: Zap,
    iconColor: 'text-emerald-500',
    desc: 'Fastest. Works reliably in this environment.',
  },
  'gemma4:12b-mlx': {
    label: 'Gemma 4 12B MLX',
    tag: 'Apple Silicon',
    tagColor: 'bg-blue-100 text-blue-700',
    icon: Cpu,
    iconColor: 'text-blue-500',
    desc: 'Balanced speed and reasoning on MLX.',
  },
  'qwen3.6:27b': {
    label: 'Qwen 3.6 27B',
    tag: 'Best reasoning',
    tagColor: 'bg-violet-100 text-violet-700',
    icon: Brain,
    iconColor: 'text-violet-500',
    desc: 'Highest quality. Slower cold start.',
  },
};

interface Props {
  initial:  AgentPreferences | null;
  userName: string;
  userRole: string;
  availableModels: string[];
}

export default function AgentPreferencesForm({ initial, availableModels }: Props) {
  const modelsList = availableModels.length > 0 ? availableModels : ['gemma4:e2b', 'gemma4:12b-mlx', 'qwen3.6:27b'];

  const modelOptions = modelsList.map(name => {
    if (KNOWN_MODELS[name]) {
      return { value: name, ...KNOWN_MODELS[name] };
    }
    // Clean up HF model labels or custom model names for nice rendering
    const cleanLabel = name
      .replace(/^hf\.co\/[^\/]+\//, '')
      .replace(/:latest$/, '')
      .replace(/-/g, ' ');
    return {
      value: name,
      label: cleanLabel,
      tag: 'Ollama model',
      tagColor: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: Bot,
      iconColor: 'text-slate-500',
      desc: 'Installed model on Mac Mini M4 Pro.',
    };
  });

  const [enabled,       setEnabled]       = useState(initial?.enabled ?? false);
  const [model,         setModel]         = useState(initial?.preferredModel ?? 'gemma4:e2b');
  const [categories,    setCategories]    = useState<string[]>(initial?.autoApproveCategories ?? []);
  const [maxUrgency,    setMaxUrgency]    = useState<'Low' | 'Medium'>(initial?.maxAutoUrgency ?? 'Medium');
  const [requireAgency, setRequireAgency] = useState(initial?.requireAgencyMentioned ?? true);
  const [keywords,      setKeywords]      = useState<string[]>(initial?.excludedKeywords ?? []);
  const [kwInput,       setKwInput]       = useState('');
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState('');
  const [pending,       startTransition]  = useTransition();

  const toggleCat = (cat: string) =>
    setCategories(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]);

  const addKw = () => {
    const kw = kwInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) { setKeywords(p => [...p, kw]); setKwInput(''); }
  };

  const save = () => {
    setError('');
    startTransition(async () => {
      const r = await saveAgentPreferences({
        enabled, preferredModel: model, autoApproveCategories: categories,
        maxAutoUrgency: maxUrgency, requireAgencyMentioned: requireAgency, excludedKeywords: keywords,
      });
      if (r.success) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
      else setError(r.error ?? 'Save failed');
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

      {/* ── Section: Enable ────────────────────────────────────── */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-slate-50">
        <div>
          <p className="font-bold text-slate-900 text-sm">Auto-approval</p>
          <p className="text-slate-400 text-xs mt-0.5">
            Agent approves matching letters on your behalf
          </p>
        </div>
        {/* Custom toggle */}
        <button
          onClick={() => setEnabled(e => !e)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
            enabled ? 'bg-indigo-500' : 'bg-slate-200'
          }`}
          aria-label="Toggle agent"
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* ── Section: Model ─────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-slate-50">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Model</p>
        <div className="space-y-2">
          {modelOptions.map(opt => {
            const Icon = opt.icon;
            const active = model === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setModel(opt.value)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-indigo-200 bg-indigo-50/60'
                    : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  active ? 'bg-indigo-100' : 'bg-slate-100'
                }`}>
                  <Icon size={15} className={active ? 'text-indigo-500' : opt.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${active ? 'text-indigo-900' : 'text-slate-700'}`}>
                      {opt.label}
                    </p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${opt.tagColor}`}>
                      {opt.tag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                </div>
                {active && <CheckCircle2 size={16} className="text-indigo-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section: Categories ────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-slate-50">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Auto-approve categories</p>
          {categories.length === 0 && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md font-medium">All categories</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                categories.includes(cat)
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section: Max urgency ───────────────────────────────── */}
      <div className="px-6 py-5 border-b border-slate-50">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Maximum urgency for auto-approval
        </p>
        <div className="grid grid-cols-4 gap-1.5 bg-slate-100 rounded-xl p-1">
          {(['Low', 'Medium'] as const).map(u => (
            <button key={u} onClick={() => setMaxUrgency(u)}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                maxUrgency === u ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'
              }`}>
              {u}
            </button>
          ))}
          <div className="py-2 rounded-lg text-xs font-bold text-slate-300 text-center">High 🔒</div>
          <div className="py-2 rounded-lg text-xs font-bold text-slate-300 text-center">Critical 🔒</div>
        </div>
      </div>

      {/* ── Section: Agency + Keywords ─────────────────────────── */}
      <div className="px-6 py-5 border-b border-slate-50 space-y-4">
        {/* Require agency */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Require agency reference</p>
            <p className="text-xs text-slate-400 mt-0.5">Letter must name a gov agency (HDB, MOM, MOH…)</p>
          </div>
          <button
            onClick={() => setRequireAgency(r => !r)}
            className={`relative w-9 h-5 rounded-full transition-colors ${requireAgency ? 'bg-indigo-500' : 'bg-slate-200'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${requireAgency ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Excluded keywords */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Excluded keywords</p>
          <div className="flex gap-2">
            <input
              value={kwInput}
              onChange={e => setKwInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKw()}
              placeholder="e.g. eviction, bankrupt…"
              className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400 bg-slate-50"
            />
            <button onClick={addKw}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-slate-600">
              <Plus size={15} />
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {keywords.map(kw => (
                <span key={kw}
                  className="flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-100 text-xs px-2 py-1 rounded-lg">
                  {kw}
                  <button onClick={() => setKeywords(p => p.filter(k => k !== kw))} className="hover:text-rose-900">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: Save ───────────────────────────────────────── */}
      <div className="px-6 py-4 bg-slate-50">
        {error && <p className="text-rose-600 text-xs mb-2">{error}</p>}
        <button
          onClick={save}
          disabled={pending}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-slate-900 hover:bg-slate-700 text-white disabled:opacity-50'
          }`}
        >
          {pending ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
          : saved   ? <><CheckCircle2 size={14} /> Saved</>
          :           <><Bot size={14} /> Save preferences</>}
        </button>
      </div>
    </div>
  );
}
