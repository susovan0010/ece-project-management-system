'use client';

import { useState, useEffect } from 'react';
import { createInviteAction, createFacultyAccountAction } from '@/app/actions/auth';
import {
  getAdminDirectoryDataAction,
  AdminUserItem,
  SupervisorUserItem,
} from '@/app/actions/admin-directory';

export default function AdminFacultyPage() {
  // Directory Lists State
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorUserItem[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);

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

  async function loadAccounts() {
    setLoadingDirectory(true);
    const res = await getAdminDirectoryDataAction();
    if (!res.error) {
      setAdmins(res.admins || []);
      setSupervisors(res.supervisors || []);
    }
    setLoadingDirectory(false);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

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
      loadAccounts();
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

      {/* Registered Project Committee Admins Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Project Committee Admins ({admins.length})
            </h3>
            <p className="text-xs text-slate-500">
              List of all registered committee administrator accounts.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">Admin Name</th>
                <th className="px-6 py-3">Login Email</th>
                <th className="px-6 py-3 text-center">Security Status</th>
                <th className="px-6 py-3 text-right">Created On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingDirectory ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    Loading admins...
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    No admins found.
                  </td>
                </tr>
              ) : (
                admins.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{adm.name}</td>
                    <td className="px-6 py-3.5 font-mono text-slate-600">{adm.email}</td>
                    <td className="px-6 py-3.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          adm.mustChangePassword
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {adm.mustChangePassword ? 'INITIAL CREDENTIALS' : 'CUSTOMIZED'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-500">
                      {new Date(adm.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registered Faculty Supervisors Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Registered Faculty Supervisors ({supervisors.length})
            </h3>
            <p className="text-xs text-slate-500">
              List of all department supervisors, their proposed topics, and allotted project groups.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">Supervisor Name</th>
                <th className="px-6 py-3">Login Email</th>
                <th className="px-6 py-3 text-center">Proposed Topics</th>
                <th className="px-6 py-3">Allotted Groups</th>
                <th className="px-6 py-3 text-center">Password Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingDirectory ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    Loading supervisors...
                  </td>
                </tr>
              ) : supervisors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No faculty supervisors registered yet.
                  </td>
                </tr>
              ) : (
                supervisors.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{sup.name}</td>
                    <td className="px-6 py-3.5 font-mono text-slate-600">{sup.email}</td>
                    <td className="px-6 py-3.5 text-center font-mono font-bold text-slate-800">
                      {sup.proposedTopicsCount}
                    </td>
                    <td className="px-6 py-3.5">
                      {sup.groups.length === 0 ? (
                        <span className="text-slate-400 italic">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {sup.groups.map((g) => (
                            <span
                              key={g.id}
                              title={`${g.topicTitle} (${g.batchId})`}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200"
                            >
                              Grp {g.number} ({g.topicCode})
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sup.mustChangePassword
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {sup.mustChangePassword ? 'FIRST LOGIN PENDING' : 'CHANGED'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
