'use client';

import { useState } from 'react';
import { createInviteAction, createFacultyAccountAction } from '@/app/actions/auth';

export default function AdminFacultyPage() {
  // Direct Account Creation State
  const [directName, setDirectName] = useState('');
  const [directEmail, setDirectEmail] = useState('');
  const [directTempPassword, setDirectTempPassword] = useState('');
  const [directRole, setDirectRole] = useState<'FACULTY' | 'ADMIN'>('FACULTY');
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directSuccess, setDirectSuccess] = useState<string | null>(null);

  // Invite Token State
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'FACULTY' | 'ADMIN'>('FACULTY');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreateDirectAccount(e: React.FormEvent) {
    e.preventDefault();
    setDirectError(null);
    setDirectSuccess(null);
    setDirectLoading(true);

    const formData = new FormData();
    formData.append('name', directName);
    formData.append('email', directEmail);
    formData.append('tempPassword', directTempPassword);
    formData.append('role', directRole);

    const result = await createFacultyAccountAction(null, formData);
    setDirectLoading(false);

    if (result.error) {
      setDirectError(result.error);
    } else if (result.success) {
      setDirectSuccess(result.message || 'Faculty account created!');
      setDirectName('');
      setDirectEmail('');
      setDirectTempPassword('');
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteUrl(null);
    setCopied(false);
    setLoading(true);

    const formData = new FormData();
    formData.append('email', email);
    formData.append('role', role);

    const result = await createInviteAction(null, formData);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (result.success && result.inviteUrl) {
      setInviteUrl(result.inviteUrl);
      setEmail('');
    }
  }

  function handleCopy() {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Faculty Account Management
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Provision faculty supervisor accounts with fixed user names or generate expiring invitation links.
        </p>
      </div>

      {/* Direct Faculty Account Provisioning Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Create Faculty Account (With Fixed User Name & Temporary Password)
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          Faculty user names are locked and cannot be altered by the faculty member. When they log in for the first time with the temporary password, a prompt will automatically appear requiring them to set a new personal password.
        </p>

        {directError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {directError}
          </div>
        )}

        {directSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
            {directSuccess}
          </div>
        )}

        <form onSubmit={handleCreateDirectAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="directName"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Faculty Full Name (Locked User Name)
            </label>
            <input
              id="directName"
              type="text"
              required
              value={directName}
              onChange={(e) => setDirectName(e.target.value)}
              placeholder="Dr. Subhashish Roy"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="directEmail"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Faculty Login Email
            </label>
            <input
              id="directEmail"
              type="email"
              required
              value={directEmail}
              onChange={(e) => setDirectEmail(e.target.value)}
              placeholder="teacher.name@heritageit.edu"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="directTempPassword"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Initial Temporary Password
            </label>
            <input
              id="directTempPassword"
              type="text"
              required
              minLength={6}
              value={directTempPassword}
              onChange={(e) => setDirectTempPassword(e.target.value)}
              placeholder="Welcome@2026"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="directRole"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Account Role
            </label>
            <select
              id="directRole"
              value={directRole}
              onChange={(e) => setDirectRole(e.target.value as 'FACULTY' | 'ADMIN')}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            >
              <option value="FACULTY">FACULTY (Supervisor)</option>
              <option value="ADMIN">ADMIN (Committee Member)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={directLoading}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm transition disabled:opacity-60"
            >
              {directLoading ? 'Creating Account...' : 'Create Account (Requires Password Change on First Login)'}
            </button>
          </div>
        </form>
      </div>

      {/* Invite Generator Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">Invite New Faculty Supervisor</h3>
        <p className="text-xs text-slate-500 mb-5">
          Invites expire in 72 hours. Once generated, share the secure activation link with the teacher.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="sm:col-span-2">
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Faculty Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher.name@heritageit.edu"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Account Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'FACULTY' | 'ADMIN')}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            >
              <option value="FACULTY">FACULTY (Supervisor)</option>
              <option value="ADMIN">ADMIN (Committee Member)</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition disabled:opacity-60"
            >
              {loading ? 'Generating Token...' : 'Create Expiring Invite Link'}
            </button>
          </div>
        </form>

        {inviteUrl && (
          <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200 animate-in fade-in-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-900">
                Generated Invite Link (Valid for 72 Hours)
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs font-semibold px-2.5 py-1 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded shadow-xs transition"
              >
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>
            <div className="p-2.5 bg-white border border-blue-200 rounded text-xs font-mono text-slate-800 break-all select-all">
              {inviteUrl}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
