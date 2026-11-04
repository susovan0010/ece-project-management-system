'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/app/actions/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('email', email);
    if (typeof window !== 'undefined' && window.location.origin) {
      formData.append('origin', window.location.origin);
    }

    const result = await requestPasswordResetAction(null, formData);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setMessage(result.message || 'Reset link dispatched.');
      if (result.devResetUrl) {
        setDevUrl(result.devResetUrl);
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-[#DCDCDD] via-[#f4f7f9] to-[#d4e4ea]">
      <div className="w-full max-w-md bg-white border border-[#C5C3C6] shadow-xl rounded-2xl p-8 backdrop-blur-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-[#46494C]">Reset Your Password</h1>
          <p className="text-xs text-[#4C5C68] mt-1">
            Enter your registered faculty email to receive a password reset link
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {message}
          </div>
        )}

        {devUrl && (
          <div className="mb-4 p-3 rounded-lg bg-[#eef8fa] border border-[#1985A1]/40 text-xs text-[#1985A1]">
            <span className="font-bold">Development mode link: </span>
            <Link href={devUrl} className="underline break-all">
              {devUrl}
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-[#46494C] mb-1"
            >
              Registered Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="faculty@heritageit.edu"
              className="w-full px-3.5 py-2 bg-slate-50 border border-[#C5C3C6] rounded-lg text-[#46494C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#1985A1] hover:bg-[#146E85] text-white font-semibold text-sm rounded-lg shadow transition disabled:opacity-60"
          >
            {loading ? 'Dispatching Link...' : 'Send Password Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-xs text-[#4C5C68] hover:text-[#1985A1]">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
