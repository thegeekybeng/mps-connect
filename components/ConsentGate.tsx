import React, { useState } from 'react';
import { ShieldAlert, Bot, Database, Trash2 } from 'lucide-react';

interface ConsentGateProps {
  mpName: string;
  constituency: string;
  onConsent: () => void;
}

const ConsentGate: React.FC<ConsentGateProps> = ({ mpName, constituency, onConsent }) => {
  const [aiConsent, setAiConsent] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const [demoAck, setDemoAck] = useState(false);

  const allChecked = aiConsent && dataConsent && demoAck;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-slate-700 text-white p-4 text-center">
        <h2 className="font-bold text-lg">Before You Continue</h2>
        <p className="text-slate-300 text-xs mt-1">
          Please read and acknowledge the following before submitting your case
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Demo disclaimer */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <ShieldAlert size={14} /> Demo System — Not an Official Government Service
          </p>
          <p className="text-sm text-amber-700 leading-relaxed">
            This is a <strong>research demonstration</strong> built by TheGeekyBeng. It is
            not affiliated with, endorsed by, or operated by the Singapore Government, any
            Member of Parliament, or any statutory board. Case data submitted here is{' '}
            <strong>not processed by any real government office</strong>.
          </p>
        </div>

        {/* AI processing notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Bot size={14} /> AI Processing Disclosure
          </p>
          <p className="text-sm text-blue-700 leading-relaxed">
            Your messages are processed by a <strong>local AI language model</strong> (running on
            private infrastructure — not sent to external cloud services). The AI will:
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
            <li>Respond to your queries in real time</li>
            <li>Categorise your case (urgency, type, suggested agencies)</li>
            <li>Generate a case summary for routing to {mpName}&apos;s office ({constituency})</li>
          </ul>
          <p className="text-xs text-blue-600 mt-2 italic">
            AI decisions are advisory only. No automated action is taken without human review.
          </p>
        </div>

        {/* Data notice */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Database size={14} /> Data Handling (Demo)
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            In this demonstration, no data is persisted to a database. All session data exists
            only in your browser&apos;s memory for the duration of this session and is lost on
            page refresh or logout.
          </p>
          <p className="text-sm text-slate-600 mt-2 flex items-center gap-1.5">
            <Trash2 size={13} className="shrink-0" />
            Do not submit real NRIC numbers or sensitive personal information.
          </p>
        </div>

        {/* Consent checkboxes */}
        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={demoAck}
              onChange={(e) => setDemoAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 shrink-0"
            />
            <span className="text-sm text-gray-700 group-hover:text-gray-900">
              I understand this is a <strong>demo system</strong> and not an official Singapore
              Government service.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={aiConsent}
              onChange={(e) => setAiConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
            />
            <span className="text-sm text-gray-700 group-hover:text-gray-900">
              I consent to my messages being processed by an <strong>AI language model</strong> to
              assist with case categorisation and response.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={dataConsent}
              onChange={(e) => setDataConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-slate-600 focus:ring-slate-500 shrink-0"
            />
            <span className="text-sm text-gray-700 group-hover:text-gray-900">
              I will not submit real NRIC numbers, financial account details, or other sensitive
              personal data in this demo session.
            </span>
          </label>
        </div>
      </div>

      {/* Action */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onConsent}
          disabled={!allChecked}
          className="w-full bg-slate-700 hover:bg-slate-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors shadow-sm"
        >
          {allChecked ? 'I Understand — Continue' : 'Please acknowledge all items above'}
        </button>
      </div>
    </div>
  );
};

export default ConsentGate;
