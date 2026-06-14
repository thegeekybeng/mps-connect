'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, AlertTriangle, ArrowRight, Loader2, ShieldCheck, Info } from 'lucide-react';
import PrivacyConsentGate from '@/components/chat/PrivacyConsentGate';

export default function EnterPostalCodePage() {
  const router = useRouter();
  const [showConsent, setShowConsent] = useState(false);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    mp_name: string;
    division: string;
    constituency: string;
    constituency_id: number;
  } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const SAMPLE_CODES = [
    { code: '310123', area: 'Toa Payoh' },
    { code: '520301', area: 'Pasir Ris' },
    { code: '680456', area: 'Bukit Panjang' },
    { code: '460210', area: 'Bedok' },
    { code: '150088', area: 'Bukit Merah' },
    { code: '730512', area: 'Woodlands' },
  ];

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);
    setResult(null);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const postalCode = newDigits.join('');
    if (postalCode.length === 6 && newDigits.every(d => d !== '')) {
      lookupPostalCode(postalCode);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      inputRefs.current[5]?.focus();
      lookupPostalCode(pasted);
    }
  }

  async function lookupPostalCode(postalCode: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/postal-lookup?code=${postalCode}`);
      const data = await res.json();

      if (!res.ok || !data.constituency_id) {
        const sector = postalCode.substring(0, 2);
        const sectorNum = parseInt(sector, 10);
        if (sectorNum > 82 || sectorNum === 0) {
          setError(`Sector ${sector} is outside Singapore's postal range (01–82). Try a sample code below.`);
        } else {
          setError(data.error || 'Could not resolve constituency for this postal code.');
        }
        setLoading(false);
        return;
      }

      setResult(data);
      setLoading(false);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  function fillSample(code: string) {
    const newDigits = code.split('');
    setDigits(newDigits);
    setError(null);
    setResult(null);
    inputRefs.current[5]?.focus();
    lookupPostalCode(code);
  }

  function handleProceed() {
    if (result) {
      setShowConsent(true);
    }
  }

  function handleConsent(consentedAt: string) {
    if (result) {
      router.push(`/chat?c=${result.constituency_id}&consent=${encodeURIComponent(consentedAt)}`);
    }
  }

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
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--gov-primary)' }}>
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight" style={{ color: 'var(--gov-text)' }}>MPS Connect</p>
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--gov-text-muted)' }}>
              Constituency Lookup
            </p>
          </div>
        </div>
      </header>

      {/* Main — centred card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">

          {/* Card */}
          <div className="gov-card p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--gov-primary-50)' }}>
                <MapPin size={24} style={{ color: 'var(--gov-primary)' }} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--gov-text)' }}>
                Enter Your Postal Code
              </h1>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
                We&apos;ll match you with your constituency&apos;s MP so you can start your session.
              </p>
            </div>

            {/* 6-digit input grid */}
            <div className="flex justify-center gap-2 sm:gap-3 mb-6" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-lg
                    transition-all outline-none"
                  style={{
                    border: error
                      ? '2px solid var(--gov-accent)'
                      : digit
                        ? '2px solid var(--gov-primary-light)'
                        : '1px solid var(--gov-border)',
                    color: error ? 'var(--gov-accent)' : 'var(--gov-text)',
                    background: 'var(--gov-surface)',
                  }}
                  placeholder="·"
                  aria-label={`Postal code digit ${i + 1}`}
                  id={`postal-digit-${i}`}
                />
              ))}
            </div>

            {/* Sample postal codes */}
            {!result && !loading && (
              <div className="mb-6">
                <p className="text-xs text-center mb-2" style={{ color: 'var(--gov-text-muted)' }}>
                  Try a sample postal code:
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SAMPLE_CODES.map(s => (
                    <button
                      key={s.code}
                      onClick={() => fillSample(s.code)}
                      className="px-3 py-1.5 rounded-lg text-xs transition-all"
                      style={{
                        background: 'var(--gov-surface-alt)',
                        border: '1px solid var(--gov-border)',
                        color: 'var(--gov-text-secondary)',
                      }}
                      id={`sample-${s.code}`}
                    >
                      <span className="font-mono font-bold">{s.code}</span>
                      <span className="ml-1" style={{ color: 'var(--gov-text-muted)' }}>({s.area})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm mb-4" style={{ color: 'var(--gov-primary-light)' }}>
                <Loader2 size={16} className="animate-spin" />
                Looking up your constituency…
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg px-4 py-3 mb-4 flex items-start gap-2"
                style={{ background: 'var(--gov-accent-50)', border: '1px solid var(--gov-accent-100)' }}>
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--gov-accent)' }} />
                <p className="text-sm" style={{ color: 'var(--gov-accent)' }}>{error}</p>
              </div>
            )}

            {/* Result card → Consent gate transition */}
            {result && !showConsent && (
              <div className="rounded-xl px-4 py-4 mb-6 animate-fade-in"
                style={{ background: 'var(--gov-primary-50)', border: '1px solid var(--gov-primary-100)' }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--gov-primary-light)' }}>
                  Your Constituency
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--gov-text)' }}>{result.constituency}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--gov-text-secondary)' }}>
                  {result.division} — <span className="font-medium" style={{ color: 'var(--gov-primary)' }}>{result.mp_name}</span>
                </p>

                <button
                  onClick={handleProceed}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2.5
                    font-bold px-6 py-3.5 rounded-lg text-sm transition-all text-white"
                  style={{ background: 'var(--gov-accent)' }}
                  id="proceed-to-chat"
                >
                  Chat with Your MP&apos;s Digital Twin
                  <ArrowRight size={16} />
                </button>
              </div>
            )}

            {/* PDPA Consent Gate — shown after constituency found, before chat */}
            {showConsent && result && (
              <div className="mb-6 animate-fade-in">
                <PrivacyConsentGate
                  onConsent={handleConsent}
                  mpName={result.mp_name}
                  constituency={result.constituency}
                />
              </div>
            )}

            {/* Disclaimer */}
            <div className="rounded-lg px-4 py-3 mt-2"
              style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <p className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
                <strong>Demo note:</strong> In this demo, constituency resolution
                uses postal code sector mapping which may not be 100% accurate.
                In production, your constituency is auto-detected via your SingPass registered address
                through GovTech&apos;s electoral boundary data.
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center mt-6 text-xs" style={{ color: 'var(--gov-text-muted)' }}>
            MPS Connect Demo · Built by TheGeekyBeng
          </p>
        </div>
      </div>
    </div>
  );
}
