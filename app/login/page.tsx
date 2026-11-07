'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/actions/auth';

export default function LoginPage() {
  const router = useRouter();
  const [loginRole, setLoginRole] = useState<'FACULTY' | 'ADMIN' | 'STUDENT'>('FACULTY');
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
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-[#DCDCDD] via-[#f4f7f9] to-[#d4e4ea]">
      <div className="w-full max-w-md bg-white border border-[#C5C3C6] shadow-xl rounded-2xl p-8 backdrop-blur-md">
        {/* Department Crest & Header */}
        <div className="text-center mb-8">
          <img
            src="/app-icon.png"
            alt="ECE Logo"
            className="inline-block w-16 h-16 rounded-2xl object-contain bg-white shadow-lg shadow-[#1985A1]/20 mb-3 p-1.5 border border-[#C5C3C6]"
          />
          <h1 className="text-2xl font-bold tracking-tight text-[#46494C]">
            Project Management System
          </h1>
          <p className="text-sm text-[#4C5C68] mt-1 font-medium">
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#46494C] mb-2">
              Sign In Role
            </label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Sign In Role">
              <label
                onClick={() => setLoginRole('STUDENT')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition text-center ${
                  loginRole === 'STUDENT'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 border-[#C5C3C6] text-[#4C5C68] hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="loginRole"
                  value="STUDENT"
                  checked={loginRole === 'STUDENT'}
                  onChange={() => setLoginRole('STUDENT')}
                  className="sr-only"
                />
                <span className="text-base mb-0.5">🎓</span>
                <div className="text-[#46494C]">Student</div>
                <div className="text-[9px] font-normal text-[#4C5C68]">Project Portal</div>
              </label>

              <label
                onClick={() => setLoginRole('FACULTY')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition text-center ${
                  loginRole === 'FACULTY'
                    ? 'bg-[#eef8fa] border-[#1985A1] text-[#1985A1] ring-2 ring-[#1985A1]/20'
                    : 'bg-slate-50 border-[#C5C3C6] text-[#4C5C68] hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="loginRole"
                  value="FACULTY"
                  checked={loginRole === 'FACULTY'}
                  onChange={() => setLoginRole('FACULTY')}
                  className="sr-only"
                />
                <span className="text-base mb-0.5">👨‍🏫</span>
                <div className="text-[#46494C]">Supervisor</div>
                <div className="text-[9px] font-normal text-[#4C5C68]">Faculty Hub</div>
              </label>

              <label
                onClick={() => setLoginRole('ADMIN')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition text-center ${
                  loginRole === 'ADMIN'
                    ? 'bg-amber-50 border-amber-600 text-amber-900 ring-2 ring-amber-500/20'
                    : 'bg-slate-50 border-[#C5C3C6] text-[#4C5C68] hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="loginRole"
                  value="ADMIN"
                  checked={loginRole === 'ADMIN'}
                  onChange={() => setLoginRole('ADMIN')}
                  className="sr-only"
                />
                <span className="text-base mb-0.5">🛡️</span>
                <div className="text-[#46494C]">Admin</div>
                <div className="text-[9px] font-normal text-[#4C5C68]">Committee</div>
              </label>
            </div>
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-[#46494C] mb-1.5"
            >
              {loginRole === 'STUDENT'
                ? 'Student Registered Email'
                : 'Institute or Registered Email'}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={
                loginRole === 'STUDENT'
                  ? 'student.demo@heritageit.edu'
                  : 'faculty@heritageit.edu'
              }
              className="w-full px-4 py-2.5 bg-slate-50 border border-[#C5C3C6] rounded-lg text-[#46494C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1] focus:bg-white transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-[#46494C]"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-[#1985A1] hover:text-[#146E85] font-medium transition"
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
              className="w-full px-4 py-2.5 bg-slate-50 border border-[#C5C3C6] rounded-lg text-[#46494C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1] focus:bg-white transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#1985A1] hover:bg-[#146E85] active:scale-[0.99] text-white font-semibold text-sm rounded-lg shadow-md shadow-[#1985A1]/25 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            ) : loginRole === 'STUDENT' ? (
              'Sign In as Student'
            ) : (
              'Sign In as Supervisor'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#C5C3C6]/60 text-center text-xs text-[#4C5C68]">
          <p>
            Invite-only portal. Department supervisors receive invitation links from the Project Committee.
          </p>
        </div>
      </div>
    </div>
  );
}
