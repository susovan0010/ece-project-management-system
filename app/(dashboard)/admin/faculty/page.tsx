'use client';

import { useState, useEffect } from 'react';
import { createInviteAction, createFacultyAccountAction } from '@/app/actions/auth';
import {
  getAdminDirectoryDataAction,
  removeSupervisorAction,
  removeAdminAction,
  transferUserRoleAction,
  updateUserInformationAction,
  AdminUserItem,
  SupervisorUserItem,
} from '@/app/actions/admin-directory';
import { PRIORITY_A_ADMIN_EMAIL } from '@/lib/admin-priority';

export default function AdminFacultyPage() {
  // Directory Lists State
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorUserItem[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);

  // Current Logged-in Admin Identity
  const [currentUserPriority, setCurrentUserPriority] = useState<'HOD' | 'A' | 'B'>('B');
  const [currentUserId, setCurrentUserId] = useState<string>('');

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

  // User Information Edit Modal State
  const [editingUser, setEditingUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'FACULTY';
  } | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function loadAccounts() {
    setLoadingDirectory(true);
    const res = await getAdminDirectoryDataAction();
    if (!res.error) {
      setAdmins(res.admins || []);
      setSupervisors(res.supervisors || []);
      if (res.currentUserPriority) {
        setCurrentUserPriority(res.currentUserPriority);
      }
      if (res.currentUserId) {
        setCurrentUserId(res.currentUserId);
      }
    }
    setLoadingDirectory(false);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function handleRemoveSupervisor(supervisorId: string, name: string) {
    if (!window.confirm(`Are you sure you want to remove supervisor "${name}"?`)) return;
    setRemovingId(supervisorId);
    setDirectError(null);
    setDirectSuccess(null);
    const res = await removeSupervisorAction(supervisorId);
    if (res.error) {
      setDirectError(res.error);
    } else {
      setDirectSuccess(res.message || `Supervisor ${name} removed.`);
      await loadAccounts();
    }
    setRemovingId(null);
  }

  async function handleRemoveAdmin(adminId: string, name: string) {
    if (
      !window.confirm(
        `Are you sure you want to remove administrator "${name}"? This will permanently remove their admin access.`
      )
    )
      return;
    setRemovingId(adminId);
    setDirectError(null);
    setDirectSuccess(null);
    const res = await removeAdminAction(adminId);
    if (res.error) {
      setDirectError(res.error);
    } else {
      setDirectSuccess(res.message || `Admin ${name} removed.`);
      await loadAccounts();
    }
    setRemovingId(null);
  }

  async function handleTransferRole(userId: string, targetRole: 'ADMIN' | 'FACULTY', name: string) {
    const roleLabel = targetRole === 'ADMIN' ? 'Project Committee Admin' : 'Faculty Supervisor';
    if (!window.confirm(`Are you sure you want to transfer "${name}" to ${roleLabel} role?`)) return;
    setTransferringId(userId);
    setDirectError(null);
    setDirectSuccess(null);
    const res = await transferUserRoleAction(userId, targetRole);
    if (res.error) {
      setDirectError(res.error);
    } else {
      setDirectSuccess(res.message || `${name} transferred to ${roleLabel}.`);
      await loadAccounts();
    }
    setTransferringId(null);
  }

  function handleOpenEdit(user: { id: string; name: string; email: string; role: 'ADMIN' | 'FACULTY' }) {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    setEditError(null);

    const res = await updateUserInformationAction({
      userId: editingUser.id,
      name: editName,
      email: editEmail,
    });
    setEditLoading(false);

    if (res.error) {
      setEditError(res.error);
    } else {
      setDirectSuccess(res.message || 'User information updated successfully.');
      setEditingUser(null);
      await loadAccounts();
    }
  }

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
      setDirectSuccess(result.message || 'Account created successfully!');
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
    if (typeof window !== 'undefined' && window.location.origin) {
      formData.append('origin', window.location.origin);
    }

    const result = await createInviteAction(null, formData);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (result.success && result.inviteUrl) {
      let finalUrl = result.inviteUrl;
      // Self-heal: If returned URL has localhost but client is on a deployed domain, normalize to current origin
      if (
        finalUrl.includes('localhost') &&
        typeof window !== 'undefined' &&
        window.location.origin &&
        !window.location.origin.includes('localhost')
      ) {
        try {
          const parsed = new URL(finalUrl);
          finalUrl = `${window.location.origin}${parsed.pathname}${parsed.search}`;
        } catch {
          // Keep original if URL parse fails
        }
      }
      setInviteUrl(finalUrl);
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
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Faculty &amp; Admin Account Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Provision faculty and admin accounts, manage tiered priority roles, and edit profile credentials.
          </p>
        </div>
        <div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 shadow-xs ${
              currentUserPriority === 'HOD'
                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                : currentUserPriority === 'A'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-slate-100 text-slate-800 border border-slate-300'
            }`}
          >
            <span>{currentUserPriority === 'HOD' || currentUserPriority === 'A' ? '👑' : '🛡️'}</span>
            <span>
              Your Access:{' '}
              {currentUserPriority === 'HOD'
                ? 'HOD (Top Priority)'
                : `Priority Type ${currentUserPriority}`}
            </span>
            <span className="text-[10px] font-normal opacity-80">
              ({currentUserPriority === 'HOD' ? 'Head of Department' : currentUserPriority === 'A' ? 'Super Admin' : 'Admin'})
            </span>
          </span>
        </div>
      </div>

      {directError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{directError}</div>
        </div>
      )}

      {directSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-start gap-2">
          <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>{directSuccess}</div>
        </div>
      )}

      {/* Direct Account Provisioning Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Create Account (With User Name &amp; Temporary Password)
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          User names and email addresses are initialized with a temporary password. Users will automatically be prompted to customize their password upon first login.
        </p>

        <form onSubmit={handleCreateDirectAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="directName"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Full Name
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
              Login Email
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
              {currentUserPriority === 'A' ? (
                <option value="ADMIN">ADMIN (Committee Member)</option>
              ) : (
                <option value="ADMIN" disabled>
                  ADMIN (Committee Member) — Only Priority A
                </option>
              )}
            </select>
            {currentUserPriority === 'B' && (
              <p className="text-[11px] text-slate-400 mt-1">
                Only Priority A Admin ({PRIORITY_A_ADMIN_EMAIL}) can create new committee admin accounts.
              </p>
            )}
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
        <h3 className="text-base font-bold text-slate-900 mb-1">Invite Faculty or Admin</h3>
        <p className="text-xs text-slate-500 mb-5">
          Invites expire in 72 hours. Once generated, share the secure activation link with the member.
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
              Login Email
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
              {currentUserPriority === 'A' ? (
                <option value="ADMIN">ADMIN (Committee Member)</option>
              ) : (
                <option value="ADMIN" disabled>
                  ADMIN (Committee Member) — Only Priority A
                </option>
              )}
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
              List of all registered committee administrators with priority hierarchy.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">Admin Name</th>
                <th className="px-6 py-3">Login Email</th>
                <th className="px-6 py-3 text-center">Priority</th>
                <th className="px-6 py-3 text-center">Security Status</th>
                <th className="px-6 py-3 text-right">Created On</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingDirectory ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Loading admins...
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No admins found.
                  </td>
                </tr>
              ) : (
                admins.map((adm) => {
                  const isHod = adm.priority === 'HOD';
                  const isTypeA = adm.priority === 'A';
                  const isSelf = adm.id === currentUserId;
                  const canEdit = currentUserPriority === 'HOD' || currentUserPriority === 'A' || isSelf;
                  const canTransferToSupervisor = !isTypeA && !isHod && (currentUserPriority === 'A' || currentUserPriority === 'HOD' || isSelf);
                  const canRemove = (currentUserPriority === 'A' || currentUserPriority === 'HOD') && !isTypeA && !isHod && !isSelf;

                  return (
                    <tr key={adm.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          {adm.name}
                          {isSelf && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                              You
                            </span>
                          )}
                        </div>
                        {adm.domainExpertise && adm.domainExpertise.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1 max-w-xs">
                            {adm.domainExpertise.slice(0, 3).map((d) => (
                              <span
                                key={d}
                                className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#1985A1]/10 text-[#1985A1] border border-[#1985A1]/20"
                              >
                                {d}
                              </span>
                            ))}
                            {adm.domainExpertise.length > 3 && (
                              <span
                                title={adm.domainExpertise.slice(3).join(', ')}
                                className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600"
                              >
                                +{adm.domainExpertise.length - 3} more
                              </span>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">{adm.email}</td>
                      <td className="px-6 py-3.5 text-center">
                        {isHod ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 inline-flex items-center gap-1 shadow-xs">
                            <span>👑</span> HOD (Top Priority)
                          </span>
                        ) : isTypeA ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1 shadow-xs">
                            <span>👑</span> Priority Type A (Super Admin)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 inline-flex items-center gap-1">
                            <span>🛡️</span> Priority Type B (Admin)
                          </span>
                        )}
                      </td>
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
                      <td className="px-6 py-3.5 text-right space-x-2 whitespace-nowrap">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenEdit({
                                id: adm.id,
                                name: adm.name,
                                email: adm.email,
                                role: 'ADMIN',
                              })
                            }
                            className="px-2.5 py-1 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                          >
                            Edit
                          </button>
                        )}

                        {canTransferToSupervisor && (
                          <button
                            type="button"
                            disabled={transferringId === adm.id}
                            onClick={() => handleTransferRole(adm.id, 'FACULTY', adm.name)}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition disabled:opacity-50"
                          >
                            {transferringId === adm.id ? 'Transferring...' : 'Transfer to Supervisor'}
                          </button>
                        )}

                        {canRemove && (
                          <button
                            type="button"
                            disabled={removingId === adm.id}
                            onClick={() => handleRemoveAdmin(adm.id, adm.name)}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition disabled:opacity-50"
                          >
                            {removingId === adm.id ? 'Removing...' : 'Remove'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
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
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingDirectory ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Loading supervisors...
                  </td>
                </tr>
              ) : supervisors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No faculty supervisors registered yet.
                  </td>
                </tr>
              ) : (
                supervisors.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-3.5">
                      <div className="font-bold text-slate-900">{sup.name}</div>
                      {sup.domainExpertise && sup.domainExpertise.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1 max-w-xs">
                          {sup.domainExpertise.slice(0, 3).map((d) => (
                            <span
                              key={d}
                              className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#1985A1]/10 text-[#1985A1] border border-[#1985A1]/20"
                            >
                              {d}
                            </span>
                          ))}
                          {sup.domainExpertise.length > 3 && (
                            <span
                              title={sup.domainExpertise.slice(3).join(', ')}
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600"
                            >
                              +{sup.domainExpertise.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-medium italic">Pending specialization</span>
                      )}
                    </td>
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
                    <td className="px-6 py-3.5 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenEdit({
                            id: sup.id,
                            name: sup.name,
                            email: sup.email,
                            role: 'FACULTY',
                          })
                        }
                        className="px-2.5 py-1 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                      >
                        Edit
                      </button>

                      {currentUserPriority === 'A' && (
                        <button
                          type="button"
                          disabled={transferringId === sup.id}
                          onClick={() => handleTransferRole(sup.id, 'ADMIN', sup.name)}
                          className="px-2.5 py-1 rounded text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-50"
                        >
                          {transferringId === sup.id ? 'Transferring...' : 'Transfer to Admin'}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={removingId === sup.id}
                        onClick={() => handleRemoveSupervisor(sup.id, sup.name)}
                        className="px-2.5 py-1 rounded text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition disabled:opacity-50"
                      >
                        {removingId === sup.id ? 'Removing...' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Information Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Edit {editingUser.role === 'ADMIN' ? 'Committee Admin' : 'Faculty Supervisor'} Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Login Email
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
