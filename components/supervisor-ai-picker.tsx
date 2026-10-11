'use client';

import { useState, useEffect } from 'react';
import {
  getAvailableProvidersForFacultyAction,
  updateSupervisorAiPreferenceAction,
} from '@/app/actions/ai';

interface ProviderOption {
  id: string;
  name: string;
  model: string;
  priority: number;
}

interface SupervisorAiPickerProps {
  onSelectionChange?: (selectedProvider: string | null) => void;
  className?: string;
}

export function SupervisorAiPicker({ onSelectionChange, className = '' }: SupervisorAiPickerProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await getAvailableProvidersForFacultyAction();
      if (!res.error) {
        setProviders(res.providers || []);
        setPreferred(res.preferredAiProvider || null);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleChange(newPreference: string) {
    const val = newPreference === 'AUTO' ? null : newPreference;
    setPreferred(val);
    setSaving(true);
    setMessage(null);

    const res = await updateSupervisorAiPreferenceAction(val);
    setSaving(false);

    if (res.success) {
      setMessage(`AI provider set to ${val ? val : 'Auto (Priority Order)'}`);
      if (onSelectionChange) {
        onSelectionChange(val);
      }
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage('Failed to save preference');
    }
  }

  if (loading) {
    return (
      <div className={`p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 ${className}`}>
        Loading AI options...
      </div>
    );
  }

  return (
    <div className={`p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Supervisor AI Choice
          </span>
        </div>
        {saving && <span className="text-[11px] text-blue-600 font-semibold animate-pulse">Saving...</span>}
        {message && <span className="text-[11px] text-emerald-600 font-semibold">{message}</span>}
      </div>

      <p className="text-xs text-slate-500">
        Choose which AI model generates your topic suggestions. Free tiers of Gemini, Groq, and ChatGPT are supported. If one is unavailable, the system automatically falls back to the next.
      </p>

      {/* Choice Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => handleChange('AUTO')}
          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition text-left ${
            !preferred
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="font-bold">Auto (Default)</div>
          <div className="text-[10px] opacity-80 mt-0.5">Admin Priority Order</div>
        </button>

        {providers.map((p) => {
          const isSelected = preferred?.toLowerCase() === p.name.toLowerCase();
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleChange(p.name)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition text-left ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-[10px] opacity-80 truncate mt-0.5">{p.model}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
