'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeFirstLoginAction, updateUserDomainsAction } from '@/app/actions/auth';
import { ECE_DOMAIN_CATEGORIES, ALL_ECE_DOMAINS } from '@/lib/constants/domains';

interface FirstLoginModalProps {
  role: 'ADMIN' | 'FACULTY';
  userName: string;
  userEmail: string;
  mustChangePassword: boolean;
  userDomains?: string[];
}

export function FirstLoginModal({
  role,
  userName,
  userEmail,
  mustChangePassword,
  userDomains = [],
}: FirstLoginModalProps) {
  const router = useRouter();
  const [manualOpen, setManualOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DOMAINS' | 'PASSWORD'>('DOMAINS');
  const [completedInSession, setCompletedInSession] = useState(false);

  // Forced prompts
  const isForcedFirstLogin = mustChangePassword && !completedInSession;
  const isForcedDomainPrompt =
    !mustChangePassword && userDomains.length === 0 && !completedInSession;
  const isForced = isForcedFirstLogin || isForcedDomainPrompt;
  const isOpen = isForced || manualOpen;

  // Form states
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>(userDomains);
  const [domainSearch, setDomainSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Domain selection helpers
  function toggleDomain(domain: string) {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  }

  function selectCategoryAll(domains: string[]) {
    setSelectedDomains((prev) => {
      const set = new Set([...prev, ...domains]);
      return Array.from(set);
    });
  }

  function clearCategory(domains: string[]) {
    const toRemove = new Set(domains);
    setSelectedDomains((prev) => prev.filter((d) => !toRemove.has(d)));
  }

  function selectAllGlobal() {
    setSelectedDomains([...ALL_ECE_DOMAINS]);
  }

  function clearAllGlobal() {
    setSelectedDomains([]);
  }

  // Handle first-time login (Password + Domains)
  async function handleFirstLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (selectedDomains.length === 0) {
      setError('Please select at least one domain of expertise before continuing.');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    if (role === 'ADMIN') {
      formData.append('name', name);
      formData.append('email', email);
    }
    formData.append('currentPassword', currentPassword);
    formData.append('newPassword', newPassword);
    formData.append('confirmPassword', confirmPassword);
    selectedDomains.forEach((d) => formData.append('domains', d));

    const res = await completeFirstLoginAction(null, formData);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else if (res.success) {
      setSuccessMsg(res.message || 'Credentials and domain expertise recorded successfully!');
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

  // Handle standalone domain update (for members who already changed password)
  async function handleDomainsOnlySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (selectedDomains.length === 0) {
      setError('Please select at least one domain of expertise.');
      return;
    }

    setLoading(true);
    const res = await updateUserDomainsAction(selectedDomains);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else if (res.success) {
      setSuccessMsg(res.message || 'Domain expertise saved successfully!');
      setTimeout(() => {
        setCompletedInSession(true);
        setManualOpen(false);
        setSuccessMsg(null);
        router.refresh();
      }, 900);
    }
  }

  // Handle manual password update from account settings
  async function handlePasswordOnlySubmit(e: React.FormEvent<HTMLFormElement>) {
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
    // Preserve existing domains
    selectedDomains.forEach((d) => formData.append('domains', d));

    const res = await completeFirstLoginAction(null, formData);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else if (res.success) {
      setSuccessMsg(res.message || 'Account credentials updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setManualOpen(false);
        setSuccessMsg(null);
        router.refresh();
      }, 900);
    }
  }

  // Filter domains by search keyword
  const searchLower = domainSearch.trim().toLowerCase();

  return (
    <>
      {/* Top Header Button to view/edit anytime */}
      <button
        type="button"
        onClick={() => {
          setName(userName);
          setEmail(userEmail);
          setSelectedDomains(userDomains);
          setError(null);
          setSuccessMsg(null);
          setActiveTab('DOMAINS');
          setManualOpen(true);
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center gap-1.5 shadow-2xs"
      >
        <svg
          className="w-3.5 h-3.5 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        <span>{role === 'ADMIN' ? 'Account & Expertise' : 'Profile & Expertise'}</span>
        {userDomains.length > 0 && (
          <span className="bg-[#1985A1]/10 text-[#1985A1] text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-[#1985A1]/20">
            {userDomains.length}
          </span>
        )}
      </button>

      {/* Main Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1985A1]/10 text-[#1985A1] border border-[#1985A1]/30 mb-1.5">
                  {isForcedFirstLogin
                    ? 'First-Time Login Security Setup'
                    : isForcedDomainPrompt
                    ? 'Department Profile Setup Required'
                    : 'Account Settings & Domain Expertise'}
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {isForcedFirstLogin
                    ? role === 'ADMIN'
                      ? 'Admin Security Credentials & Domain Expertise'
                      : 'Faculty Password Reset & Domain Expertise'
                    : isForcedDomainPrompt
                    ? 'Specify Your ECE Domain Expertise'
                    : 'Manage Account Credentials & Domain Expertise'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isForcedFirstLogin
                    ? 'Please change your initial password and select the academic & research domains you specialize in.'
                    : isForcedDomainPrompt
                    ? 'Please choose your areas of specialization. One can have expertise in multiple domains.'
                    : 'Review or update your academic specialization and account security settings.'}
                </p>
              </div>

              {!isForced && (
                <button
                  type="button"
                  onClick={() => setManualOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1 rounded-lg hover:bg-slate-100 transition"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Error & Success Alerts */}
            {error && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                {successMsg}
              </div>
            )}

            {/* Manual Open Mode: Tab Switcher */}
            {!isForced && (
              <div className="px-6 pt-3 border-b border-slate-200 bg-white flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('DOMAINS');
                    setError(null);
                  }}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                    activeTab === 'DOMAINS'
                      ? 'border-[#1985A1] text-[#1985A1]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Domain Expertise ({selectedDomains.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('PASSWORD');
                    setError(null);
                  }}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                    activeTab === 'PASSWORD'
                      ? 'border-[#1985A1] text-[#1985A1]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {role === 'ADMIN' ? 'Admin Credentials & Password' : 'Change Password'}
                </button>
              </div>
            )}

            {/* Modal Body: Scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* CASE 1: Forced First Login (Password + Domains together) */}
              {isForcedFirstLogin ? (
                <form id="first-login-form" onSubmit={handleFirstLoginSubmit} className="space-y-6">
                  {/* Step 1: Credentials */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                      <span className="w-5 h-5 rounded-full bg-[#1985A1] text-white text-[11px] font-bold flex items-center justify-center">
                        1
                      </span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        {role === 'ADMIN'
                          ? 'Admin User Name & Password Setup'
                          : 'Update Initial Faculty Password'}
                      </h3>
                    </div>

                    {role === 'ADMIN' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="admin-name"
                            className="block text-[11px] font-semibold uppercase text-slate-700 mb-1"
                          >
                            Admin Display Name
                          </label>
                          <input
                            id="admin-name"
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-[#1985A1]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="admin-email"
                            className="block text-[11px] font-semibold uppercase text-slate-700 mb-1"
                          >
                            Admin Login Email
                          </label>
                          <input
                            id="admin-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-[#1985A1]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Faculty User Name (Fixed)
                          </span>
                          <span className="font-bold text-slate-800">{userName}</span>
                          <span className="font-mono text-[11px] text-slate-500 ml-2">({userEmail})</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          Locked
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="first-current-password"
                          className="block text-[11px] font-semibold uppercase text-slate-700 mb-1"
                        >
                          Initial Password
                        </label>
                        <input
                          id="first-current-password"
                          type="password"
                          required
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Current password"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-[#1985A1]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="first-new-password"
                          className="block text-[11px] font-semibold uppercase text-slate-700 mb-1"
                        >
                          New Password (Min. 6)
                        </label>
                        <input
                          id="first-new-password"
                          type="password"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-[#1985A1]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="first-confirm-password"
                          className="block text-[11px] font-semibold uppercase text-slate-700 mb-1"
                        >
                          Confirm Password
                        </label>
                        <input
                          id="first-confirm-password"
                          type="password"
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm password"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-[#1985A1]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Domain Expertise Selection */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1985A1] text-white text-[11px] font-bold flex items-center justify-center">
                          2
                        </span>
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            Academic &amp; Research Domain Expertise (Mandatory)
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Select one or more domains matching your teaching &amp; research specialization.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllGlobal}
                          className="text-[11px] font-semibold text-[#1985A1] hover:underline"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={clearAllGlobal}
                          className="text-[11px] font-semibold text-slate-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {renderDomainCategories()}
                  </div>

                  {/* Submission Footer */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Selected: <span className="text-[#1985A1]">{selectedDomains.length}</span> domain(s)
                    </span>

                    <button
                      type="submit"
                      disabled={loading || selectedDomains.length === 0}
                      className="px-6 py-2.5 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-semibold rounded-xl shadow-md transition disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Saving Account Setup...
                        </>
                      ) : (
                        'Save Password & Domain Expertise'
                      )}
                    </button>
                  </div>
                </form>
              ) : isForcedDomainPrompt || (!isForced && activeTab === 'DOMAINS') ? (
                /* CASE 2: Standalone Domain Update (Existing user prompted on login OR manual edit) */
                <form onSubmit={handleDomainsOnlySubmit} className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Academic &amp; Research Domain Specialization
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Check all domains that align with your technical expertise.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 mr-2">
                        Selected: <span className="text-[#1985A1]">{selectedDomains.length}</span>
                      </span>
                      <button
                        type="button"
                        onClick={selectAllGlobal}
                        className="text-[11px] font-semibold text-[#1985A1] hover:underline"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={clearAllGlobal}
                        className="text-[11px] font-semibold text-slate-500 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Search Bar for Domains */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search domain name (e.g. 5G, VLSI, AI, Microwave, Embedded)..."
                      value={domainSearch}
                      onChange={(e) => setDomainSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1985A1] focus:outline-none"
                    />
                    <svg
                      className="w-4 h-4 text-slate-400 absolute left-3 top-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {renderDomainCategories()}

                  {/* Submit Button */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    {!isForced && (
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
                      disabled={loading || selectedDomains.length === 0}
                      className="ml-auto px-6 py-2.5 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-semibold rounded-xl shadow-md transition disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Saving Domain Expertise...
                        </>
                      ) : (
                        `Confirm & Save Domain Expertise (${selectedDomains.length})`
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* CASE 3: Password Update tab (Manual open mode) */
                <form onSubmit={handlePasswordOnlySubmit} className="space-y-4">
                  {role === 'ADMIN' ? (
                    <>
                      <div>
                        <label
                          htmlFor="manual-admin-name"
                          className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                        >
                          Admin User Name (Display Name)
                        </label>
                        <input
                          id="manual-admin-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="manual-admin-email"
                          className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                        >
                          Admin Login Email
                        </label>
                        <input
                          id="manual-admin-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1] focus:bg-white"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Faculty User Name (Fixed)
                      </div>
                      <div className="text-sm font-bold text-slate-800">{userName}</div>
                      <div className="text-xs font-mono text-slate-500">{userEmail}</div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="manual-current-password"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                    >
                      Current Password
                    </label>
                    <input
                      id="manual-current-password"
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1] focus:bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="manual-new-password"
                        className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                      >
                        New Password (Min. 6)
                      </label>
                      <input
                        id="manual-new-password"
                        type="password"
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="manual-confirm-password"
                        className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                      >
                        Confirm New Password
                      </label>
                      <input
                        id="manual-confirm-password"
                        type="password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1985A1] focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setManualOpen(false)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-5 py-2.5 bg-[#1985A1] hover:bg-[#146E85] text-white font-semibold text-xs rounded-lg shadow-sm transition disabled:opacity-60"
                    >
                      {loading
                        ? 'Saving...'
                        : role === 'ADMIN'
                        ? 'Save Admin Credentials & Password'
                        : 'Update Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Helper renderer: 5 Categorized Domain Cards
  function renderDomainCategories() {
    return (
      <div className="space-y-4">
        {ECE_DOMAIN_CATEGORIES.map((cat) => {
          const filteredCatDomains = searchLower
            ? cat.domains.filter((d) => d.toLowerCase().includes(searchLower))
            : cat.domains;

          if (filteredCatDomains.length === 0) return null;

          const selectedInCat = cat.domains.filter((d) => selectedDomains.includes(d));
          const allInCatSelected = selectedInCat.length === cat.domains.length;

          return (
            <div
              key={cat.id}
              className={`rounded-xl border ${cat.color.border} ${cat.color.bg} p-4 transition shadow-2xs`}
            >
              {/* Category Header */}
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <h4 className={`text-xs font-bold ${cat.color.text} flex items-center gap-1.5`}>
                    {cat.name}
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${cat.color.badge}`}
                  >
                    {selectedInCat.length} / {cat.domains.length} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      allInCatSelected
                        ? clearCategory(cat.domains)
                        : selectCategoryAll(cat.domains)
                    }
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                  >
                    {allInCatSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              {/* Domains Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {filteredCatDomains.map((domain) => {
                  const isChecked = selectedDomains.includes(domain);
                  return (
                    <label
                      key={domain}
                      className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                        isChecked
                          ? 'bg-white border-[#1985A1] shadow-2xs font-semibold text-slate-900 ring-1 ring-[#1985A1]/20'
                          : 'bg-white/70 border-slate-200 hover:bg-white text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDomain(domain)}
                        className="mt-0.5 rounded text-[#1985A1] focus:ring-[#1985A1] h-3.5 w-3.5"
                      />
                      <span className="leading-tight">{domain}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
