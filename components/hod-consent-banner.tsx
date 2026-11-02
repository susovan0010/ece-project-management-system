'use client';

import { useState } from 'react';
import { respondToHodRemovalAction } from '@/app/actions/hod-authority';

interface HodConsentBannerProps {
  requestedAt?: string | null;
  superAdminName?: string;
}

export function HodConsentBanner({ requestedAt, superAdminName }: HodConsentBannerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);

  if (resolved) {
    return (
      <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 text-xs text-emerald-800 font-medium flex items-center justify-between">
        <span>{decisionMessage}</span>
      </div>
    );
  }

  const handleDecision = async (agree: boolean) => {
    if (!confirm(agree ? 'Are you sure you agree to step down as Head of Department (HOD)?' : 'Are you sure you want to decline the step-down request?')) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await respondToHodRemovalAction(agree);
      if (res.error) {
        setError(res.error);
      } else {
        setResolved(true);
        setDecisionMessage(res.message || (agree ? 'You have stepped down as HOD.' : 'Removal request declined.'));
        window.location.reload();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="no-print print:hidden bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-6 py-3.5 shadow-md flex flex-wrap items-center justify-between gap-4 border-b border-amber-600/40 animate-pulse-once">
      <div className="flex items-center gap-3">
        <span className="p-1.5 bg-white/20 rounded-lg text-lg">⚠️</span>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-100">
            HOD Governance Action Required
          </h4>
          <p className="text-xs font-medium text-white">
            {superAdminName || 'The Super Admin Type A'} has submitted a formal request for you to step down as Head of Department (HOD)
            {requestedAt ? ` on ${new Date(requestedAt).toLocaleDateString()}` : ''}. Under department policy, this requires your explicit mutual agreement.
          </p>
          {error && <p className="text-[11px] text-red-200 mt-1 font-semibold">{error}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => handleDecision(true)}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Agree & Step Down'}
        </button>
        <button
          onClick={() => handleDecision(false)}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Decline Request'}
        </button>
      </div>
    </div>
  );
}
