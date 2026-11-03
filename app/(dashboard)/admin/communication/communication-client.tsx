'use client';

import { useState, useEffect } from 'react';
import {
  getCommunicationConfigAction,
  updateCommunicationConfigAction,
  getCommunicationRosterAction,
  updateRecipientEmailAction,
  sendGroupCommunicationAction,
  getCommunicationHistoryAction,
  CommunicationGroupSummary,
  CommunicationHistoryItem,
} from '@/app/actions/communication';

export default function CommunicationClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sender Config State
  const [senderEmail, setSenderEmail] = useState('susovan.mandal@heritageit.edu');
  const [senderName, setSenderName] = useState('Dr. Susovan Mandal (ECE Project Committee)');
  const [replyTo, setReplyTo] = useState('susovan.mandal@heritageit.edu');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showConfigEdit, setShowConfigEdit] = useState(false);

  // Roster & Selection State
  const [batches, setBatches] = useState<{ id: string; active: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [groups, setGroups] = useState<CommunicationGroupSummary[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [includeStudents, setIncludeStudents] = useState(true);
  const [includeFaculty, setIncludeFaculty] = useState(false);

  // Recipient Editing State
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState<string>('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [customRecipients, setCustomRecipients] = useState<{ name: string; email: string; role: string }[]>([]);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomEmail, setNewCustomEmail] = useState('');

  // Message Composer State
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // History State
  const [history, setHistory] = useState<CommunicationHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Initial Data Load
  async function loadData(batch = selectedBatch) {
    setLoading(true);
    setError(null);

    const [cfgRes, rosterRes, histRes] = await Promise.all([
      getCommunicationConfigAction(),
      getCommunicationRosterAction(batch),
      getCommunicationHistoryAction(),
    ]);

    if (cfgRes.config) {
      setSenderEmail(cfgRes.config.senderEmail);
      setSenderName(cfgRes.config.senderName);
      setReplyTo(cfgRes.config.replyTo || cfgRes.config.senderEmail);
    }

    if (rosterRes.error) {
      setError(rosterRes.error);
    } else if (rosterRes.groups) {
      setBatches(rosterRes.batches || []);
      setGroups(rosterRes.groups || []);
      // Default to selecting all groups in current view
      setSelectedGroupIds(rosterRes.groups.map((g) => g.id));
    }

    if (histRes) {
      setHistory(histRes);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedBatch);
  }, [selectedBatch]);

  // Handle Save Sender Config
  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingConfig(true);
    setError(null);

    const res = await updateCommunicationConfigAction({
      senderEmail,
      senderName,
      replyTo,
    });

    setIsSavingConfig(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Sender configuration updated.');
      setShowConfigEdit(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  }

  // Handle Update Recipient Email
  async function handleSaveRecipientEmail(type: 'STUDENT' | 'FACULTY', id: string) {
    if (!editingEmailValue || !editingEmailValue.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsUpdatingEmail(true);
    setError(null);

    const res = await updateRecipientEmailAction(type, id, editingEmailValue);
    setIsUpdatingEmail(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Email updated successfully.');
      setEditingEmailId(null);
      // Update in local state
      setGroups((prev) =>
        prev.map((g) => {
          if (type === 'FACULTY' && g.supervisor.id === id) {
            return { ...g, supervisor: { ...g.supervisor, email: editingEmailValue } };
          }
          if (type === 'STUDENT') {
            return {
              ...g,
              students: g.students.map((st) =>
                st.id === id ? { ...st, email: editingEmailValue } : st
              ),
            };
          }
          return g;
        })
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // Add Custom Recipient
  function handleAddCustomRecipient() {
    if (!newCustomEmail || !newCustomEmail.includes('@')) {
      setError('Please enter a valid email for the custom recipient.');
      return;
    }
    setCustomRecipients((prev) => [
      ...prev,
      {
        name: newCustomName.trim() || 'Custom Recipient',
        email: newCustomEmail.trim().toLowerCase(),
        role: 'Ad-hoc Recipient',
      },
    ]);
    setNewCustomName('');
    setNewCustomEmail('');
  }

  function handleRemoveCustomRecipient(index: number) {
    setCustomRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  // Select / Deselect Groups
  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]
    );
  }

  function selectAllGroups() {
    setSelectedGroupIds(groups.map((g) => g.id));
  }

  function deselectAllGroups() {
    setSelectedGroupIds([]);
  }

  // Quick Message Templates
  function applyTemplate(type: 'viva' | 'deadline' | 'report') {
    if (type === 'viva') {
      setSubject('Notice: Capstone Project Viva Voce & Evaluation Schedule');
      setMessageBody(
        `Dear Students,\n\nThis is to notify all members of the selected project groups that the Capstone Project Viva Voce evaluation will be conducted as scheduled.\n\nAll members of each group are required to be present with their project documentation, design diagrams, and working prototype demonstrations.\n\nAttendance is mandatory. Please coordinate with your faculty supervisor for presentation timing.\n\nWarm regards,\nECE Capstone Project Committee`
      );
    } else if (type === 'deadline') {
      setSubject('Reminder: Upcoming Marks Submission & Rubric Deadline');
      setMessageBody(
        `Dear Faculty Supervisors & Students,\n\nThis is an urgent reminder that the evaluation window deadline for the current semester is approaching.\n\nPlease ensure all pending rubric assessments and project milestones are recorded in the departmental portal on time.\n\nLate submissions will require special permission from the Project Committee.\n\nRegards,\nECE Capstone Project Committee`
      );
    } else if (type === 'report') {
      setSubject('Notice: Submission of Capstone Project Progress Report');
      setMessageBody(
        `Dear Students,\n\nYou are instructed to submit the comprehensive project progress report for your capstone project before the upcoming evaluation milestone.\n\nThe report must follow the official departmental LaTeX / Word template and must include the problem formulation, methodology, and verification results.\n\nBest wishes,\nECE Capstone Project Committee`
      );
    }
  }

  // Handle Dispatch Message
  async function handleSendMessage() {
    if (!subject.trim()) {
      setError('Please enter a subject line for your message.');
      return;
    }
    if (!messageBody.trim()) {
      setError('Please write message content before sending.');
      return;
    }
    if (selectedGroupIds.length === 0 && customRecipients.length === 0) {
      setError('Please select at least one project group or add custom recipients.');
      return;
    }

    setIsSending(true);
    setError(null);

    const res = await sendGroupCommunicationAction({
      batchId: selectedBatch,
      selectedGroupIds,
      includeStudents,
      includeFaculty,
      customRecipients,
      subject,
      messageBody,
    });

    setIsSending(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Communication dispatched successfully.');
      setSubject('');
      setMessageBody('');
      setCustomRecipients([]);
      // Reload history
      const hist = await getCommunicationHistoryAction();
      setHistory(hist);
      setTimeout(() => setSuccessMsg(null), 5000);
    }
  }

  // Compute Active Recipients List
  const selectedGroupsList = groups.filter((g) => selectedGroupIds.includes(g.id));
  const activeStudentRecipients: { groupNum: number; student: any }[] = [];
  const activeSupervisorRecipients: { groupNum: number; supervisor: any }[] = [];

  selectedGroupsList.forEach((g) => {
    if (includeStudents) {
      g.students.forEach((st) => {
        activeStudentRecipients.push({ groupNum: g.number, student: st });
      });
    }
    if (includeFaculty && g.supervisor) {
      if (!activeSupervisorRecipients.some((s) => s.supervisor.email === g.supervisor.email)) {
        activeSupervisorRecipients.push({ groupNum: g.number, supervisor: g.supervisor });
      }
    }
  });

  const totalCalculatedRecipients =
    activeStudentRecipients.length + activeSupervisorRecipients.length + customRecipients.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              Project Committee Admin
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Department Communication Hub
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Communication &amp; Group Messaging Portal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dispatch announcements, notices, and reminders directly to student members and faculty supervisors across capstone project groups.
          </p>
        </div>

        {/* Sender Info Badge */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 flex items-center gap-3 self-stretch sm:self-auto">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Active Sender Address</div>
            <div className="font-mono font-bold text-blue-700">{senderEmail}</div>
            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{senderName}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowConfigEdit(!showConfigEdit)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition"
          >
            {showConfigEdit ? 'Close' : 'Configure'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start justify-between gap-3">
          <div>{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-start justify-between gap-3 shadow-sm">
          <div>{successMsg}</div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 font-bold">✕</button>
        </div>
      )}

      {/* Sender Configuration Box (Collapsible) */}
      {showConfigEdit && (
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Sender Email &amp; Identity Configuration</h3>
              <p className="text-xs text-slate-500">
                All communications sent to students and faculty will use this email address as the verified sender.
              </p>
            </div>
            <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold border border-blue-200">
              Default: susovan.mandal@heritageit.edu
            </span>
          </div>

          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sender Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="susovan.mandal@heritageit.edu"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sender Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Dr. Susovan Mandal (ECE Project Committee)"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reply-To Email Address
              </label>
              <input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="susovan.mandal@heritageit.edu"
              />
            </div>

            <div className="md:col-span-3 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfigEdit(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingConfig}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {isSavingConfig ? 'Saving Settings...' : 'Save Sender Configuration'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Grid: Composer & Recipients Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Group Selection & Options (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Target Audience & Group Filter */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">1. Select Target Batch &amp; Groups</h3>
                <p className="text-xs text-slate-500">Pick which project groups receive this communication.</p>
              </div>

              {/* Batch Selector */}
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value="ALL">All Batches</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Batch {b.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Recipient Role Options */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-700">Delivery Options:</div>
              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStudents}
                  onChange={(e) => setIncludeStudents(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-900">
                  Deliver to Individual Student Member Emails (Default)
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFaculty}
                  onChange={(e) => setIncludeFaculty(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Include Faculty Supervisors of selected groups</span>
              </label>
            </div>

            {/* Group Selection Controls */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold text-slate-600">
                {selectedGroupIds.length} of {groups.length} Groups Selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllGroups}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={deselectAllGroups}
                  className="text-[11px] font-semibold text-slate-500 hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Groups Grid / List */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {groups.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No project groups found for this batch.
                </div>
              ) : (
                groups.map((g) => {
                  const isSelected = selectedGroupIds.includes(g.id);
                  return (
                    <div
                      key={g.id}
                      onClick={() => toggleGroup(g.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by parent onClick
                          className="mt-0.5 rounded text-blue-600 h-4 w-4"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">Group {g.number}</span>
                            <span className="font-mono text-[10px] text-slate-400">{g.batchId}</span>
                            {g.topicCode && (
                              <span className="font-mono text-[10px] bg-slate-100 text-blue-700 px-1.5 py-0.2 rounded font-semibold">
                                {g.topicCode}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 truncate max-w-[220px]">
                            {g.topicTitle || 'Topic Title Pending'}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Guide: <span className="font-medium text-slate-600">{g.supervisor.name}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full font-bold text-[10px]">
                          {g.students.length} Students
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Ad-hoc Custom Recipients Box */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Add Additional / Ad-hoc Recipients</h3>
            <p className="text-xs text-slate-500">
              Optionally add individual email addresses outside the selected groups.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name (optional)"
                value={newCustomName}
                onChange={(e) => setNewCustomName(e.target.value)}
                className="w-1/3 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="email"
                placeholder="email@heritageit.edu"
                value={newCustomEmail}
                onChange={(e) => setNewCustomEmail(e.target.value)}
                className="w-1/2 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={handleAddCustomRecipient}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
              >
                + Add
              </button>
            </div>

            {customRecipients.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {customRecipients.map((cr, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{cr.name}</span>{' '}
                      <span className="font-mono text-slate-500">({cr.email})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomRecipient(idx)}
                      className="text-red-500 hover:text-red-700 font-bold ml-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Message Composer & Recipient Roster (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Message Composer Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">2. Compose Announcement / Message</h3>
                <p className="text-xs text-slate-500">
                  Delivered individually to the inbox of every selected recipient.
                </p>
              </div>

              {/* Quick Templates */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Templates:</span>
                <button
                  type="button"
                  onClick={() => applyTemplate('viva')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                >
                  Viva Voce
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('deadline')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                >
                  Deadline
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('report')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                >
                  Report
                </button>
              </div>
            </div>

            {/* Subject Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Subject Line <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Urgent: Schedule for Capstone Project Viva Voce & Progress Review"
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
              />
            </div>

            {/* Message Body Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Message Body <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={9}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Write your announcement or instructions here. It will be delivered cleanly formatted to all individual student and faculty email addresses..."
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed text-slate-800"
              />
            </div>

            {/* Dispatch Banner & Action Button */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900">
                  Ready to Deliver to {totalCalculatedRecipients} Recipient(s)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Sender: <span className="font-mono text-blue-700 font-medium">{senderEmail}</span>
                  {includeStudents && ` • ${activeStudentRecipients.length} Students`}
                  {includeFaculty && ` • ${activeSupervisorRecipients.length} Supervisors`}
                  {customRecipients.length > 0 && ` • ${customRecipients.length} Custom`}
                </div>
              </div>

              <button
                type="button"
                disabled={isSending || totalCalculatedRecipients === 0}
                onClick={handleSendMessage}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center gap-2 self-stretch sm:self-auto justify-center"
              >
                {isSending ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Dispatching Messages...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send Message Now ({totalCalculatedRecipients})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Recipients Roster & Inline Email Editor */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  3. Recipient Inboxes &amp; Email Address Verification ({totalCalculatedRecipients})
                </h3>
                <p className="text-xs text-slate-500">
                  Review and edit recipient email IDs directly. Changes save permanently to student and faculty profiles.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5">Group</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Name &amp; Roll</th>
                    <th className="px-4 py-2.5">Email Address</th>
                    <th className="px-4 py-2.5 text-right">Edit Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {totalCalculatedRecipients === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        No groups selected or no recipients match the criteria.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* Students List */}
                      {activeStudentRecipients.map(({ groupNum, student }) => {
                        const isEditing = editingEmailId === student.id;
                        return (
                          <tr key={`st-${student.id}`} className="hover:bg-slate-50/70 transition">
                            <td className="px-4 py-2.5 font-bold text-emerald-800 whitespace-nowrap">
                              Group {groupNum}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Student
                              </span>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <div className="font-semibold text-slate-900">{student.name}</div>
                              <div className="font-mono text-[10px] text-slate-400">{student.roll}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              {isEditing ? (
                                <input
                                  type="email"
                                  autoFocus
                                  value={editingEmailValue}
                                  onChange={(e) => setEditingEmailValue(e.target.value)}
                                  className="px-2.5 py-1 text-xs font-mono border border-blue-400 rounded-md w-60 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              ) : student.email ? (
                                <span className="font-mono text-blue-700">{student.email}</span>
                              ) : (
                                <span className="text-rose-500 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px] border border-rose-200">
                                  Missing Email (Click Edit)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isUpdatingEmail}
                                    onClick={() => handleSaveRecipientEmail('STUDENT', student.id)}
                                    className="px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingEmailId(null)}
                                    className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] hover:bg-slate-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingEmailId(student.id);
                                    setEditingEmailValue(student.email || '');
                                  }}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-semibold"
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Faculty List */}
                      {activeSupervisorRecipients.map(({ groupNum, supervisor }) => {
                        const isEditing = editingEmailId === supervisor.id;
                        return (
                          <tr key={`sup-${supervisor.id}`} className="hover:bg-slate-50/70 transition bg-purple-50/20">
                            <td className="px-4 py-2.5 font-bold text-purple-800 whitespace-nowrap">
                              Group {groupNum}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                Supervisor
                              </span>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <div className="font-semibold text-slate-900">{supervisor.name}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              {isEditing ? (
                                <input
                                  type="email"
                                  autoFocus
                                  value={editingEmailValue}
                                  onChange={(e) => setEditingEmailValue(e.target.value)}
                                  className="px-2.5 py-1 text-xs font-mono border border-purple-400 rounded-md w-60 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                              ) : supervisor.email ? (
                                <span className="font-mono text-purple-700">{supervisor.email}</span>
                              ) : (
                                <span className="text-rose-500 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px] border border-rose-200">
                                  Missing Email
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isUpdatingEmail}
                                    onClick={() => handleSaveRecipientEmail('FACULTY', supervisor.id)}
                                    className="px-2 py-0.5 bg-purple-600 text-white rounded text-[11px] font-semibold hover:bg-purple-700 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingEmailId(null)}
                                    className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] hover:bg-slate-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingEmailId(supervisor.id);
                                    setEditingEmailValue(supervisor.email || '');
                                  }}
                                  className="text-purple-600 hover:text-purple-800 text-xs font-semibold"
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Custom Recipients */}
                      {customRecipients.map((cr, idx) => (
                        <tr key={`cr-${idx}`} className="hover:bg-slate-50/70 transition bg-amber-50/20">
                          <td className="px-4 py-2.5 font-bold text-amber-800 whitespace-nowrap">-</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Custom
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-semibold text-slate-900">{cr.name}</td>
                          <td className="px-4 py-2.5 font-mono text-amber-700">{cr.email}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomRecipient(idx)}
                              className="text-red-500 hover:underline text-xs"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Dispatched Communications History Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Dispatched Communications Audit Log</h3>
            <p className="text-xs text-slate-500">
              Audit trail of all official notices and group messages sent from this portal.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-lg">
            {history.length} Record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-5 py-3">Dispatched At</th>
                <th className="px-5 py-3">Subject Line</th>
                <th className="px-4 py-3">Sender</th>
                <th className="px-4 py-3 text-center">Batch &amp; Groups</th>
                <th className="px-4 py-3 text-center">Recipients</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    No past communications dispatched yet.
                  </td>
                </tr>
              ) : (
                history.map((item) => {
                  const isExpanded = expandedHistoryId === item.id;
                  const dateStr = new Date(item.sentAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-3.5 font-mono text-slate-600 whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{item.subject}</div>
                        {isExpanded && (
                          <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 whitespace-pre-wrap font-sans text-xs">
                            {item.messageBody}
                            <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                              <strong>Recipient Inboxes ({item.recipients.length}):</strong>{' '}
                              {item.recipients.map((r) => r.email).join(', ')}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{item.senderName}</div>
                        <div className="font-mono text-[10px] text-blue-700">{item.senderEmail}</div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {item.batchId}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.groupNumbers.length} Group(s)
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                        {item.recipientCount}
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'SENT'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : item.status === 'SIMULATED'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                        >
                          {isExpanded ? 'Hide Details' : 'View Message'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
