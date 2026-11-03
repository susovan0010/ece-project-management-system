'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/actions/auth';

export default function LoginPage() {
  const router = useRouter();
  const [loginRole, setLoginRole] = useState<'FACULTY' | 'ADMIN'>('FACULTY');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set('loginRole', loginRole);
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
          <img
            src="/app-icon.png"
            alt="ECE Logo"
            className="inline-block w-16 h-16 rounded-2xl object-contain bg-white shadow-lg shadow-blue-500/20 mb-3 p-1.5 border border-slate-200"
          />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Project Management System
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Heritage Institute of Technology, Kolkata
          </p>
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
          {/* Role Option Buttons (Default: Supervisor) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Sign In Role
            </label>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Sign In Role">
              <label
                onClick={() => setLoginRole('FACULTY')}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold cursor-pointer transition ${
                  loginRole === 'FACULTY'
                    ? 'bg-blue-50 border-blue-600 text-blue-900 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="loginRole"
                  value="FACULTY"
                  checked={loginRole === 'FACULTY'}
                  onChange={() => setLoginRole('FACULTY')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <div>
                  <div>Supervisor</div>
                  <div className="text-[10px] font-normal text-slate-500">Faculty Workspace</div>
                </div>
              </label>

              <label
                onClick={() => setLoginRole('ADMIN')}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold cursor-pointer transition ${
                  loginRole === 'ADMIN'
                    ? 'bg-amber-50 border-amber-600 text-amber-900 ring-2 ring-amber-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="loginRole"
                  value="ADMIN"
                  checked={loginRole === 'ADMIN'}
                  onChange={() => setLoginRole('ADMIN')}
                  className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300"
                />
                <div>
                  <div>Admin</div>
                  <div className="text-[10px] font-normal text-slate-500">Project Committee</div>
                </div>
              </label>
            </div>
          </div>

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
            ) : loginRole === 'ADMIN' ? (
              'Sign In as Admin'
            ) : (
              'Sign In as Supervisor'
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
