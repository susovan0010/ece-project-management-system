'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeFirstLoginAction } from '@/app/actions/auth';

interface FirstLoginModalProps {
  role: 'ADMIN' | 'FACULTY';
  userName: string;
  userEmail: string;
  mustChangePassword: boolean;
}

export function FirstLoginModal({
  role,
  userName,
  userEmail,
  mustChangePassword,
}: FirstLoginModalProps) {
  const router = useRouter();
  const [manualOpen, setManualOpen] = useState(false);
  const [completedInSession, setCompletedInSession] = useState(false);

  const isForcedFirstLogin = mustChangePassword && !completedInSession;
  const isOpen = isForcedFirstLogin || manualOpen;

  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const formData = new FormData();
    if (role === 'ADMIN') {
      formData.append('name', name);
      formData.append('email', email);
    }
    formData.append('currentPassword', currentPassword);
    formData.append('newPassword', newPassword);
    formData.append('confirmPassword', confirmPassword);

    const res = await completeFirstLoginAction(null, formData);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else if (res.success) {
      setSuccessMsg(res.message || 'Credentials updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setCompletedInSession(true);
        setManualOpen(false);
        setSuccessMsg(null);
        router.refresh();
      }, 900);
    }
  }

  return (
    <>
      {/* Header Button to allow changing credentials/password anytime */}
      <button
        type="button"
        onClick={() => {
          setName(userName);
          setEmail(userEmail);
          setError(null);
          setSuccessMsg(null);
          setManualOpen(true);
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        <span>{role === 'ADMIN' ? 'Account & Password' : 'Change Password'}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-2">
                  {isForcedFirstLogin ? 'First-Time Login Security Setup' : 'Account Security'}
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  {role === 'ADMIN'
                    ? 'Update Admin User Name & Password'
                    : 'Change Your Faculty Password'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {role === 'ADMIN'
                    ? 'As Project Committee Admin, you can customize your user name, login email, and password.'
                    : 'Please set a new personal password for your account. Your faculty user name is locked and cannot be changed.'}
                </p>
              </div>
              {!isForcedFirstLogin && (
                <button
                  type="button"
                  onClick={() => setManualOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {role === 'ADMIN' ? (
                <>
                  <div>
                    <label
                      htmlFor="first-login-name"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                    >
                      Admin User Name (Display Name)
                    </label>
                    <input
                      id="first-login-name"
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="first-login-email"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                    >
                      Admin Login Email / Username
                    </label>
                    <input
                      id="first-login-email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                  </div>
                </>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Faculty User Name (Locked)
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      Read-Only
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">{userName}</div>
                  <div className="text-xs font-mono text-slate-500">{userEmail}</div>
                </div>
              )}

              <div>
                <label
                  htmlFor="currentPassword"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                >
                  Current / Initial Password
                </label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                >
                  New Password (Min. 6 characters)
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
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
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                {!isForcedFirstLogin && (
                  <button
                    type="button"
                    onClick={() => setManualOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition disabled:opacity-60"
                >
                  {loading
                    ? 'Saving Changes...'
                    : role === 'ADMIN'
                    ? 'Save User Name & Password'
                    : 'Update Password & Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
