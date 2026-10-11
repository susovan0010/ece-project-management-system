'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/actions/auth';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await loginAction(null, formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if (result.success && result.redirectTo) {
      router.push(result.redirectTo);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div className="w-full max-w-md bg-white border border-slate-200/80 shadow-xl rounded-2xl p-8 backdrop-blur-md">
        {/* Department Crest & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white font-bold text-xl shadow-lg shadow-blue-500/30 mb-3">
            ECE
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Capstone Management System
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Heritage Institute of Technology, Kolkata
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span>NBA & Washington Accord Accredited</span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2 animate-in fade-in-50"
          >
            <span className="font-semibold">Error:</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Institute or Registered Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="faculty@heritageit.edu"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm rounded-lg shadow-md shadow-blue-600/25 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Authenticating...</span>
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
          <p>
            Invite-only portal. Department supervisors receive invitation links from the Project Committee.
          </p>
        </div>
      </div>
    </div>
  );
}
