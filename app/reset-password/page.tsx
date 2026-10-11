'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { resetPasswordAction } from '@/app/actions/auth';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Password reset token is missing from URL.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('token', token);
    formData.append('newPassword', password);

    const result = await resetPasswordAction(null, formData);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(result.message || 'Password updated successfully!');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div className="w-full max-w-md bg-white border border-slate-200/80 shadow-xl rounded-2xl p-8 backdrop-blur-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900">Set New Password</h1>
          <p className="text-xs text-slate-500 mt-1">
            Choose a strong password for your account
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {success} Redirecting to login...
          </div>
        )}

        {!token ? (
          <div className="text-center py-6 text-sm text-slate-600">
            <p className="text-red-600 font-semibold mb-2">Invalid or Missing Token</p>
            <Link href="/login" className="text-xs text-blue-600 underline">
              Return to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
              >
                New Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow transition disabled:opacity-60"
            >
              {loading ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-sm text-slate-600">Loading reset session...</div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
