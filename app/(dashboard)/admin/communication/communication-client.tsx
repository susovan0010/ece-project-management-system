'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getCommunicationConfigAction,
  updateCommunicationConfigAction,
  getCommunicationRosterAction,
  updateRecipientEmailAction,
  sendGroupCommunicationAction,
  getCommunicationHistoryAction,
  CommunicationGroupSummary,
  CommunicationHistoryItem,
  FacultyDirectoryItem,
} from '@/app/actions/communication';
import {
  getInboxEmailsAction,
  getEmailDetailAction,
  quickReplyAction,
  InboxMessageSummary,
  InboxMessageDetail,
} from '@/app/actions/inbox';
import {
  getScheduledCommunicationsAction,
  createScheduledCommunicationAction,
  updateScheduleStatusAction,
  deleteScheduledCommunicationAction,
  triggerScheduledEmailImmediateAction,
  processDueScheduledCommunicationsAction,
  ScheduledCommunicationJob,
} from '@/app/actions/communication-schedule';

const FACULTY_GOOGLE_GROUP_EMAIL = 'hit_ece_faculties@googlegroups.com';

export default function CommunicationClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'COMPOSE' | 'INBOX' | 'SCHEDULED' | 'HISTORY'>('COMPOSE');

  // Scheduled Email State
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledCommunicationJob[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [isProcessingDue, setIsProcessingDue] = useState(false);
  const [actionScheduleId, setActionScheduleId] = useState<string | null>(null);
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null);

  // Delivery Mode and Schedule Configuration
  const [deliveryMode, setDeliveryMode] = useState<'NOW' | 'SCHEDULE'>('NOW');
  const [scheduleStartDate, setScheduleStartDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [scheduleEndDate, setScheduleEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [scheduleFrequency, setScheduleFrequency] = useState<number>(1);
  const [scheduleTimeMode, setScheduleTimeMode] = useState<'SPECIFIC' | 'RANDOM_WINDOW'>('SPECIFIC');
  const [scheduleSpecificTimes, setScheduleSpecificTimes] = useState<string[]>(['10:00']);
  const [scheduleRandomWindow, setScheduleRandomWindow] = useState<{ startTime: string; endTime: string }>({
    startTime: '09:00',
    endTime: '18:00',
  });

  // Inbox State
  const [inboxMessages, setInboxMessages] = useState<InboxMessageSummary[]>([]);
  const [inboxTotal, setInboxTotal] = useState<number>(0);
  const [inboxPage, setInboxPage] = useState<number>(1);
  const [hasMoreInbox, setHasMoreInbox] = useState<boolean>(true);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [selectedEmailUid, setSelectedEmailUid] = useState<number | null>(null);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<InboxMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);

  // Sender Config State
  const [senderEmail, setSenderEmail] = useState('ece.project.committee@heritageit.edu');
  const [senderName, setSenderName] = useState('ECE Project Committee');
  const [replyTo, setReplyTo] = useState('ece.project.committee@heritageit.edu');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showConfigEdit, setShowConfigEdit] = useState(false);

  // Faculty Directory & Google Group State
  const [facultyList, setFacultyList] = useState<FacultyDirectoryItem[]>([]);
  const [selectedFacultyIds, setSelectedFacultyIds] = useState<string[]>([]);
  const [sendToFacultyGoogleGroup, setSendToFacultyGoogleGroup] = useState(false);
  const [facultySearch, setFacultySearch] = useState('');

  // Roster & Group Selection State
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

  // Attachment State
  const [attachments, setAttachments] = useState<
    Array<{
      filename: string;
      content: string; // base64
      contentType: string;
      size: number;
    }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History State
  const [history, setHistory] = useState<CommunicationHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Initial Data Load
  async function loadData(batch = selectedBatch) {
    setLoading(true);
    setError(null);

    const [cfgRes, rosterRes, histRes, schedRes] = await Promise.all([
      getCommunicationConfigAction(),
      getCommunicationRosterAction(batch),
      getCommunicationHistoryAction(),
      getScheduledCommunicationsAction(),
    ]);

    if (cfgRes.config) {
      setSenderEmail(cfgRes.config.senderEmail);
      setSenderName(cfgRes.config.senderName);
      setReplyTo(cfgRes.config.replyTo || cfgRes.config.senderEmail);
    }

    if (rosterRes.error) {
      setError(rosterRes.error);
    } else {
      setBatches(rosterRes.batches || []);
      setGroups(rosterRes.groups || []);
      setFacultyList(rosterRes.facultyList || []);
      setSelectedGroupIds(rosterRes.groups?.map((g) => g.id) || []);
    }

    if (histRes) {
      setHistory(histRes);
    }

    if (schedRes.jobs) {
      setScheduledJobs(schedRes.jobs);
    }

    setLoading(false);
  }

  // Load Scheduled Emails
  async function loadSchedules() {
    setScheduledLoading(true);
    const res = await getScheduledCommunicationsAction();
    if (res.error) {
      setError(res.error);
    } else if (res.jobs) {
      setScheduledJobs(res.jobs);
    }
    setScheduledLoading(false);
  }

  function handleFrequencyChange(newFreq: number) {
    const clamped = Math.max(1, Math.min(3, newFreq));
    setScheduleFrequency(clamped);
    setScheduleSpecificTimes((prev) => {
      const defaults = ['10:00', '14:00', '18:00'];
      const updated = [...prev];
      while (updated.length < clamped) {
        updated.push(defaults[updated.length] || '12:00');
      }
      return updated.slice(0, clamped);
    });
  }

  function handleSpecificTimeChange(index: number, value: string) {
    setScheduleSpecificTimes((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  }

  async function handleToggleScheduleStatus(jobId: string, currentStatus: string) {
    setActionScheduleId(jobId);
    setError(null);
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const res = await updateScheduleStatusAction(jobId, nextStatus);
    setActionScheduleId(null);
    if (!res.success) {
      setError(res.error || 'Failed to update schedule status.');
    } else {
      setSuccessMsg(`Schedule marked as ${nextStatus}.`);
      loadSchedules();
    }
  }

  async function handleDeleteSchedule(jobId: string) {
    if (!confirm('Are you sure you want to cancel and delete this scheduled communication?')) return;
    setActionScheduleId(jobId);
    setError(null);
    const res = await deleteScheduledCommunicationAction(jobId);
    setActionScheduleId(null);
    if (!res.success) {
      setError(res.error || 'Failed to delete schedule.');
    } else {
      setSuccessMsg('Scheduled communication removed.');
      loadSchedules();
    }
  }

  async function handleTestRunImmediate(jobId: string) {
    setActionScheduleId(jobId);
    setError(null);
    const res = await triggerScheduledEmailImmediateAction(jobId);
    setActionScheduleId(null);
    if (!res.success) {
      setError(res.error || 'Immediate dispatch failed.');
    } else {
      setSuccessMsg(res.message || 'Immediate test email successfully sent.');
      loadSchedules();
      const hist = await getCommunicationHistoryAction();
      setHistory(hist);
    }
  }

  async function handleProcessDueNow() {
    setIsProcessingDue(true);
    setError(null);
    const res = await processDueScheduledCommunicationsAction();
    setIsProcessingDue(false);
    if (!res.success) {
      setError(res.error || 'Failed to process due communications.');
    } else {
      setSuccessMsg(res.message || `Processed due schedules. Dispatched ${res.dispatchedCount} email(s).`);
      loadSchedules();
      const hist = await getCommunicationHistoryAction();
      setHistory(hist);
    }
  }

  function getEstimatedOccurrencesCount(start: string, end: string, freq: number): number {
    if (!start || !end) return 0;
    const d1 = new Date(start);
    const d2 = new Date(end);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d1 > d2) return 0;
    const days = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return days * Math.max(1, Math.min(3, freq));
  }

  useEffect(() => {
    loadData(selectedBatch);
  }, [selectedBatch]);

  // Load Inbox Emails on Tab Switch, Search, or Manual Refresh
  async function loadInbox(search = inboxSearch) {
    setInboxLoading(true);
    setInboxPage(1);
    setHasMoreInbox(true);
    const res = await getInboxEmailsAction(1, 30, search);
    if (res.error) {
      setError(res.error);
    } else if (res.messages) {
      setInboxMessages(res.messages);
      const total = res.totalCount !== undefined ? res.totalCount : res.messages.length;
      setInboxTotal(total);
      setHasMoreInbox(res.messages.length < total && res.messages.length >= 30);
      // Auto-select first email if none selected
      if (res.messages.length > 0 && !selectedEmailUid) {
        handleSelectEmail(res.messages[0].uid);
      }
    }
    setInboxLoading(false);
  }

  // Load Older Emails When Reaching Scroll End
  async function loadMoreInbox() {
    if (isLoadingMore || inboxLoading || !hasMoreInbox) return;
    setIsLoadingMore(true);
    const nextPage = inboxPage + 1;
    const res = await getInboxEmailsAction(nextPage, 30, inboxSearch);
    if (res.error) {
      setError(res.error);
    } else if (res.messages) {
      if (res.messages.length === 0) {
        setHasMoreInbox(false);
      } else {
        setInboxMessages((prev) => {
          const existingUids = new Set(prev.map((m) => m.uid));
          const uniqueNew = res.messages!.filter((m) => !existingUids.has(m.uid));
          return [...prev, ...uniqueNew];
        });
        setInboxPage(nextPage);
        const total = res.totalCount !== undefined ? res.totalCount : inboxTotal;
        setInboxTotal(total);
        if (inboxMessages.length + res.messages.length >= total || res.messages.length < 30) {
          setHasMoreInbox(false);
        }
      }
    }
    setIsLoadingMore(false);
  }

  function handleInboxScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMoreInbox();
    }
  }

  useEffect(() => {
    if (activeTab === 'INBOX' && inboxMessages.length === 0) {
      loadInbox();
    }
  }, [activeTab]);

  async function handleSelectEmail(uid: number) {
    setSelectedEmailUid(uid);
    setDetailLoading(true);
    setShowQuickReply(false);
    setQuickReplyText('');
    const res = await getEmailDetailAction(uid);
    if (res.error) {
      setError(res.error);
    } else if (res.message) {
      setSelectedEmailDetail(res.message);
    }
    setDetailLoading(false);
  }

  async function handleSendReply() {
    if (!selectedEmailDetail) return;
    if (!quickReplyText.trim()) {
      setError('Reply message cannot be empty.');
      return;
    }
    setIsSendingQuickReply(true);
    setError(null);
    const res = await quickReplyAction({
      toEmail: selectedEmailDetail.from.address,
      toName: selectedEmailDetail.from.name,
      subject: selectedEmailDetail.subject,
      replyText: quickReplyText.trim(),
      originalSnippet: selectedEmailDetail.snippet,
    });
    setIsSendingQuickReply(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Reply successfully dispatched to ${selectedEmailDetail.from.address}!`);
      setShowQuickReply(false);
      setQuickReplyText('');
      const hist = await getCommunicationHistoryAction();
      setHistory(hist);
    }
  }

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
      if (type === 'FACULTY') {
        setFacultyList((prev) =>
          prev.map((f) => (f.id === id ? { ...f, email: editingEmailValue } : f))
        );
      }
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

  // Faculty Supervisor Selection Helpers
  function toggleFaculty(id: string) {
    setSelectedFacultyIds((prev) =>
      prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]
    );
  }

  function selectAllFaculty() {
    setSelectedFacultyIds(facultyList.map((f) => f.id));
  }

  function deselectAllFaculty() {
    setSelectedFacultyIds([]);
  }

  // Group Selection Helpers
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

  // Custom Recipients Helpers
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

  // Quick Message Templates
  function applyTemplate(type: 'faculty' | 'viva' | 'deadline' | 'report') {
    if (type === 'faculty') {
      setSubject('Notice: Project Committee Meeting & Evaluation Schedule for Faculty Supervisors');
      setMessageBody(
        `Dear Colleagues & Supervisors,\n\nThis is an official notice regarding the upcoming Capstone Project evaluation cycle for B.Tech ECE.\n\nAll faculty supervisors are requested to review project topic allocations and ensure continuous assessment rubrics are up to date on the departmental portal.\n\nPlease feel free to reach out to the Project Committee for any queries.\n\nWarm regards,\nECE Project Committee\nDepartment of ECE\nHeritage Institute of Technology`
      );
    } else if (type === 'viva') {
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

  // Attachment Handlers
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxTotalBytes = 15 * 1024 * 1024; // 15MB total limit
    let currentTotal = attachments.reduce((acc, a) => acc + a.size, 0);

    const filesToRead: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (currentTotal + file.size > maxTotalBytes) {
        setError(`Cannot attach "${file.name}": Total attachment size exceeds 15MB limit.`);
        continue;
      }
      currentTotal += file.size;
      filesToRead.push(file);
    }

    filesToRead.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = reader.result as string;
        const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
        setAttachments((prev) => [
          ...prev,
          {
            filename: file.name,
            content: base64,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleRemoveAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const activeIndividualFaculty = facultyList.filter((f) => selectedFacultyIds.includes(f.id));

  const totalCalculatedRecipients =
    (sendToFacultyGoogleGroup ? 1 : 0) +
    activeIndividualFaculty.length +
    activeStudentRecipients.length +
    activeSupervisorRecipients.length +
    customRecipients.length;

  const filteredFaculty = facultyList.filter((f) => {
    if (!facultySearch) return true;
    const q = facultySearch.toLowerCase();
    return f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q);
  });

  // Handle Dispatch Message (Immediate or Scheduled)
  async function handleSendMessage() {
    if (!subject.trim()) {
      setError('Please enter a subject line for your message.');
      return;
    }
    if (!messageBody.trim()) {
      setError('Please write message content before sending.');
      return;
    }

    const hasAnyTarget =
      sendToFacultyGoogleGroup ||
      selectedFacultyIds.length > 0 ||
      selectedGroupIds.length > 0 ||
      customRecipients.length > 0;

    if (!hasAnyTarget) {
      setError('Please select at least one recipient (Faculty Google Group, Faculty Supervisors, Project Groups, or Custom Recipients).');
      return;
    }

    setIsSending(true);
    setError(null);

    // If Delivery Mode is SCHEDULE
    if (deliveryMode === 'SCHEDULE') {
      const recipientList: { name: string; email: string; role: string }[] = [];
      const seen = new Set<string>();

      if (sendToFacultyGoogleGroup) {
        recipientList.push({
          name: 'ECE Faculty Google Group',
          email: FACULTY_GOOGLE_GROUP_EMAIL,
          role: 'Faculty Google Group',
        });
        seen.add(FACULTY_GOOGLE_GROUP_EMAIL.toLowerCase());
      }

      activeIndividualFaculty.forEach((f) => {
        const em = f.email?.trim().toLowerCase();
        if (em && !seen.has(em)) {
          seen.add(em);
          recipientList.push({
            name: f.name,
            email: em,
            role: f.role === 'ADMIN' ? 'Committee Admin' : 'Faculty Supervisor',
          });
        }
      });

      activeStudentRecipients.forEach((s) => {
        const em = s.student.email?.trim().toLowerCase();
        if (em && !seen.has(em)) {
          seen.add(em);
          recipientList.push({
            name: s.student.name,
            email: em,
            role: `Student (Group ${s.groupNum})`,
          });
        }
      });

      activeSupervisorRecipients.forEach((s) => {
        const em = s.supervisor.email?.trim().toLowerCase();
        if (em && !seen.has(em)) {
          seen.add(em);
          recipientList.push({
            name: s.supervisor.name,
            email: em,
            role: `Supervisor (Group ${s.groupNum})`,
          });
        }
      });

      customRecipients.forEach((c) => {
        const em = c.email?.trim().toLowerCase();
        if (em && !seen.has(em)) {
          seen.add(em);
          recipientList.push({
            name: c.name,
            email: em,
            role: 'Ad-hoc Recipient',
          });
        }
      });

      const audienceSummary = `${recipientList.length} recipient(s) [${[
        sendToFacultyGoogleGroup ? 'Google Group' : '',
        activeIndividualFaculty.length > 0 ? `${activeIndividualFaculty.length} Faculty/Admin` : '',
        activeStudentRecipients.length > 0 ? `${activeStudentRecipients.length} Students` : '',
        customRecipients.length > 0 ? `${customRecipients.length} Custom` : '',
      ]
        .filter(Boolean)
        .join(', ')}]`;

      const schedRes = await createScheduledCommunicationAction({
        subject: subject.trim(),
        messageBody: messageBody.trim(),
        attachments,
        audienceSummary,
        recipients: recipientList,
        startDate: scheduleStartDate,
        endDate: scheduleEndDate,
        frequencyPerDay: scheduleFrequency,
        timeMode: scheduleTimeMode,
        specificTimes: scheduleTimeMode === 'SPECIFIC' ? scheduleSpecificTimes : undefined,
        randomWindow: scheduleTimeMode === 'RANDOM_WINDOW' ? scheduleRandomWindow : undefined,
      });

      setIsSending(false);

      if (!schedRes.success) {
        setError(schedRes.error || 'Failed to schedule communication.');
      } else {
        setSuccessMsg(
          `Official email successfully scheduled! Total ${schedRes.job?.totalOccurrencesCount || 0} automated run(s) planned between ${scheduleStartDate} and ${scheduleEndDate}.`
        );
        setSubject('');
        setMessageBody('');
        setCustomRecipients([]);
        setAttachments([]);
        setDeliveryMode('NOW');
        loadSchedules();
        setActiveTab('SCHEDULED');
        setTimeout(() => setSuccessMsg(null), 6000);
      }
      return;
    }

    // Default Immediate Dispatch
    const res = await sendGroupCommunicationAction({
      batchId: selectedBatch,
      selectedGroupIds,
      includeStudents,
      includeFaculty,
      sendToFacultyGoogleGroup,
      selectedFacultyUserIds: selectedFacultyIds,
      customRecipients,
      subject,
      messageBody,
      attachments,
    });

    setIsSending(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Communication dispatched successfully.');
      setSubject('');
      setMessageBody('');
      setCustomRecipients([]);
      setAttachments([]);
      // Reload history
      const hist = await getCommunicationHistoryAction();
      setHistory(hist);
      setTimeout(() => setSuccessMsg(null), 5000);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              Project Committee Admin
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
              Department Communication Hub
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Communication &amp; Official Messaging Portal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dispatch announcements, meeting notices, and evaluation deadlines directly to individual supervisors, the faculty Google Group, or student project groups.
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
                All communications sent to faculty and students will use this email address as the verified sender.
              </p>
            </div>
            <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold border border-blue-200">
              Default: ece.project.committee@heritageit.edu
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
                placeholder="ece.project.committee@heritageit.edu"
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
                placeholder="ECE Project Committee"
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
                placeholder="ece.project.committee@heritageit.edu"
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

      {/* Primary Tab Navigation */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('COMPOSE')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'COMPOSE'
              ? 'border-[#1985A1] text-[#1985A1]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>Compose Announcement</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('INBOX');
            if (inboxMessages.length === 0) loadInbox();
          }}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'INBOX'
              ? 'border-[#1985A1] text-[#1985A1]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <span>Inbox / Received Emails</span>
          {inboxMessages.some((m) => !m.seen) && (
            <span className="w-2 h-2 rounded-full bg-[#1985A1]"></span>
          )}
          {inboxTotal > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#e5f1f5] text-[#1985A1] font-semibold border border-[#cce3eb]">
              {inboxTotal}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('SCHEDULED');
            loadSchedules();
          }}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'SCHEDULED'
              ? 'border-[#1985A1] text-[#1985A1]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Scheduled Emails</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#eef8fa] text-[#1985A1] font-semibold border border-[#cce3eb]">
            {scheduledJobs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('HISTORY')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'HISTORY'
              ? 'border-[#1985A1] text-[#1985A1]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Dispatch History &amp; Logs</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-semibold border border-slate-200">
            {history.length}
          </span>
        </button>
      </div>

      {/* Main Grid: Targets Selection & Composer */}
      {activeTab === 'COMPOSE' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Target Channels (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Channel A: Department Faculty & Google Group */}
          <div className="bg-white border-2 border-purple-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  Faculty Supervisors, Admins &amp; Google Group
                </h3>
                <p className="text-xs text-slate-500">Target individual supervisor/admin login accounts and/or the Google Group.</p>
              </div>
              <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                {facultyList.length} Faculty &amp; Admins
              </span>
            </div>

            {/* 1-Click Faculty Google Group Toggle */}
            <div className={`p-3.5 rounded-xl border transition ${
              sendToFacultyGoogleGroup
                ? 'bg-purple-50/70 border-purple-400 shadow-xs'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
            }`}>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendToFacultyGoogleGroup}
                  onChange={(e) => setSendToFacultyGoogleGroup(e.target.checked)}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <div>
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    Send to Faculty Google Group
                    <span className="text-[10px] bg-purple-200 text-purple-900 font-mono px-1.5 py-0.2 rounded font-semibold">
                      Broadcast
                    </span>
                  </div>
                  <div className="font-mono text-xs text-purple-800 font-semibold mt-0.5">
                    {FACULTY_GOOGLE_GROUP_EMAIL}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Broadcasts message to all department faculty members in one email.
                  </div>
                </div>
              </label>
            </div>

            {/* Individual Faculty Supervisors Directory */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Faculty &amp; Admin Accounts ({selectedFacultyIds.length} of {facultyList.length} selected)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllFaculty}
                    className="text-[11px] font-semibold text-purple-700 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAllFaculty}
                    className="text-[11px] font-semibold text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Faculty & Admin Search Filter */}
              <input
                type="text"
                placeholder="Search faculty or admin name or email..."
                value={facultySearch}
                onChange={(e) => setFacultySearch(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />

              {/* Scrollable Faculty & Admin Checkbox List */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {filteredFaculty.map((f) => {
                  const isChecked = selectedFacultyIds.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'border-purple-300 bg-purple-50/50'
                          : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleFaculty(f.id)}
                          className="rounded text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {f.name}
                            {f.role === 'ADMIN' ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Admin
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                Faculty
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">{f.email}</div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Channel B: Student Project Groups & Batches */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Student Project Groups
                </h3>
                <p className="text-xs text-slate-500">Pick which student groups receive this notice.</p>
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

            {/* Recipient Options */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStudents}
                  onChange={(e) => setIncludeStudents(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-900">
                  Deliver to Individual Student Member Emails
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFaculty}
                  onChange={(e) => setIncludeFaculty(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Include Faculty Guides of Selected Groups</span>
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
                  Clear
                </button>
              </div>
            </div>

            {/* Groups Grid / List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {groups.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No project groups formed in this batch yet.
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
                          onChange={() => {}}
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
                          <div className="text-[10px] text-slate-400 mt-0.5">
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

          {/* Channel C: Ad-hoc Custom Recipients */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Additional / Ad-hoc Recipients</h3>
            <p className="text-xs text-slate-500">
              Optionally enter any other specific email address.
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

        {/* Right Column: Message Composer & Recipient Inboxes (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Message Composer Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Compose Official Communication</h3>
                <p className="text-xs text-slate-500">
                  Delivered from <strong className="font-mono text-blue-700">{senderEmail}</strong> directly to all chosen inboxes.
                </p>
              </div>

              {/* Quick Templates */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Templates:</span>
                <button
                  type="button"
                  onClick={() => applyTemplate('faculty')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                >
                  Faculty Notice
                </button>
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
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
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
                placeholder="e.g. Notice: Capstone Project Evaluation Meeting & Guidelines"
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
                placeholder="Write your announcement, guidelines, or instructions here. It will be delivered cleanly formatted to all individual supervisor and student email addresses..."
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed text-slate-800"
              />
            </div>

            {/* File Attachments Provision */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C5C3C6] bg-slate-50 hover:bg-[#1985A1]/10 text-xs font-semibold text-[#46494C] hover:text-[#1985A1] transition shadow-sm"
                  >
                    <svg className="w-4 h-4 text-[#1985A1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span>Attach Files</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="text-[11px] text-slate-500">
                    PDF, Word, Excel, ZIP, images (up to 15MB total)
                  </span>
                </div>

                {attachments.length > 0 && (
                  <span className="text-xs font-semibold text-[#1985A1]">
                    {attachments.length} file(s) attached ({formatBytes(attachments.reduce((sum, a) => sum + a.size, 0))})
                  </span>
                )}
              </div>

              {/* Attached Files List */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#eef8fa] border border-[#1985A1]/30 text-xs text-[#46494C]"
                    >
                      <svg className="w-3.5 h-3.5 text-[#1985A1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-medium truncate max-w-[200px]" title={att.filename}>{att.filename}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({formatBytes(att.size)})</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="text-slate-400 hover:text-red-600 transition ml-1 font-bold text-xs"
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delivery Schedule & Mode Selector */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-[#1985A1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Delivery Option &amp; Automated Scheduler
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Send now or schedule recurring dispatches across date boundaries (up to 3 times/day).
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('NOW')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      deliveryMode === 'NOW'
                        ? 'bg-[#1985A1] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>⚡ Send Immediately</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('SCHEDULE')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      deliveryMode === 'SCHEDULE'
                        ? 'bg-[#1985A1] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>⏱️ Schedule Email</span>
                  </button>
                </div>
              </div>

              {/* Schedule Configuration Card (Active when deliveryMode === 'SCHEDULE') */}
              {deliveryMode === 'SCHEDULE' && (
                <div className="bg-white border-2 border-[#1985A1]/30 rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Boundary: Start Date */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Start Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={scheduleStartDate}
                        onChange={(e) => setScheduleStartDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1985A1] bg-slate-50"
                      />
                      <span className="text-[10px] text-slate-400">First day emails will begin dispatching.</span>
                    </div>

                    {/* Boundary: End Date */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        End Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={scheduleEndDate}
                        onChange={(e) => setScheduleEndDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1985A1] bg-slate-50"
                      />
                      <span className="text-[10px] text-slate-400">Final day of the scheduled boundary period.</span>
                    </div>
                  </div>

                  {/* Frequency per day: 1, 2, or 3 times (Max 3) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Daily Frequency (How many times per day, max 3 times) <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleFrequencyChange(num)}
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition flex flex-col items-center justify-center ${
                            scheduleFrequency === num
                              ? 'bg-[#eef8fa] border-[#1985A1] text-[#1985A1] ring-1 ring-[#1985A1]'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{num} {num === 1 ? 'Time / Day' : 'Times / Day'}</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            {num === 1 ? 'Once daily' : num === 2 ? 'Twice daily' : 'Max 3 dispatches'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timing Mode: Specific Times vs Random Window */}
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-700">
                      When (Time) Will The Email Be Sent?
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleTimeMode('SPECIFIC')}
                        className={`p-3 rounded-xl border text-left transition ${
                          scheduleTimeMode === 'SPECIFIC'
                            ? 'bg-[#eef8fa] border-[#1985A1] ring-1 ring-[#1985A1]'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-xs font-bold text-[#46494C] flex items-center gap-1.5">
                          <span>⏰ Specific Times</span>
                          {scheduleTimeMode === 'SPECIFIC' && (
                            <span className="text-[10px] bg-[#1985A1] text-white px-1.5 py-0.2 rounded font-semibold">Active</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Pick exact times from the time interface.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setScheduleTimeMode('RANDOM_WINDOW')}
                        className={`p-3 rounded-xl border text-left transition ${
                          scheduleTimeMode === 'RANDOM_WINDOW'
                            ? 'bg-[#eef8fa] border-[#1985A1] ring-1 ring-[#1985A1]'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-xs font-bold text-[#46494C] flex items-center gap-1.5">
                          <span>🎲 Random Within Window</span>
                          {scheduleTimeMode === 'RANDOM_WINDOW' && (
                            <span className="text-[10px] bg-[#1985A1] text-white px-1.5 py-0.2 rounded font-semibold">Active</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Randomly anytime between start &amp; end time.
                        </div>
                      </button>
                    </div>

                    {/* Mode Specific Times Controls */}
                    {scheduleTimeMode === 'SPECIFIC' && (
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="text-xs font-semibold text-slate-700">
                          Select Specific Time(s) from Interface ({scheduleFrequency} slot{scheduleFrequency > 1 ? 's' : ''}):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {Array.from({ length: scheduleFrequency }).map((_, idx) => (
                            <div key={idx}>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Time #{idx + 1}
                              </label>
                              <input
                                type="time"
                                required
                                value={scheduleSpecificTimes[idx] || '10:00'}
                                onChange={(e) => handleSpecificTimeChange(idx, e.target.value)}
                                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1985A1] bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mode Random Window Controls */}
                    {scheduleTimeMode === 'RANDOM_WINDOW' && (
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="text-xs font-semibold text-slate-700">
                          Set Daily Random Window (Start &amp; End Time):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Window Start Time
                            </label>
                            <input
                              type="time"
                              required
                              value={scheduleRandomWindow.startTime}
                              onChange={(e) =>
                                setScheduleRandomWindow((prev) => ({ ...prev, startTime: e.target.value }))
                              }
                              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1985A1] bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Window End Time
                            </label>
                            <input
                              type="time"
                              required
                              value={scheduleRandomWindow.endTime}
                              onChange={(e) =>
                                setScheduleRandomWindow((prev) => ({ ...prev, endTime: e.target.value }))
                              }
                              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1985A1] bg-white"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Between {scheduleStartDate || 'Start'} and {scheduleEndDate || 'End'}, {scheduleFrequency} randomized time(s) will be picked strictly between {scheduleRandomWindow.startTime} and {scheduleRandomWindow.endTime}.
                        </p>
                      </div>
                    )}

                    {/* Live Schedule Summary Banner */}
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📅</span>
                        <div>
                          <div className="font-bold">
                            Total Planned Dispatches: {getEstimatedOccurrencesCount(scheduleStartDate, scheduleEndDate, scheduleFrequency)} run(s)
                          </div>
                          <div className="text-[11px] text-blue-700">
                            Boundary: <span className="font-mono">{scheduleStartDate}</span> to <span className="font-mono">{scheduleEndDate}</span> • {scheduleFrequency} time(s)/day
                            {scheduleTimeMode === 'SPECIFIC'
                              ? ` at ${scheduleSpecificTimes.slice(0, scheduleFrequency).join(', ')}`
                              : ` (Randomized between ${scheduleRandomWindow.startTime} - ${scheduleRandomWindow.endTime})`}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-200 text-blue-900 rounded">
                        Active Schedule Mode
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dispatch Banner & Action Button */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900">
                  Ready to Deliver to {totalCalculatedRecipients} Recipient Inbox(es)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-1.5">
                  {sendToFacultyGoogleGroup && (
                    <span className="font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                      Google Group (Broadcast)
                    </span>
                  )}
                  {activeIndividualFaculty.length > 0 && (
                    <span className="font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                      {activeIndividualFaculty.length} Faculty &amp; Admins
                    </span>
                  )}
                  {activeStudentRecipients.length > 0 && (
                    <span className="font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      {activeStudentRecipients.length} Students
                    </span>
                  )}
                  {customRecipients.length > 0 && (
                    <span className="font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      {customRecipients.length} Custom
                    </span>
                  )}
                  {attachments.length > 0 && (
                    <span className="font-semibold text-[#1985A1] bg-[#eef8fa] px-1.5 py-0.5 rounded border border-[#1985A1]/30">
                      📎 {attachments.length} attachment(s)
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isSending || totalCalculatedRecipients === 0}
                onClick={handleSendMessage}
                className="px-6 py-2.5 bg-[#1985A1] hover:bg-[#146E85] text-white rounded-xl text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center gap-2 self-stretch sm:self-auto justify-center"
              >
                {isSending ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {deliveryMode === 'SCHEDULE' ? 'Creating Schedule Plan...' : 'Dispatching via Google Workspace...'}
                  </>
                ) : deliveryMode === 'SCHEDULE' ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Schedule Email ({getEstimatedOccurrencesCount(scheduleStartDate, scheduleEndDate, scheduleFrequency)} runs for {totalCalculatedRecipients} inboxes)
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

          {/* Interactive Recipients Roster Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Recipient Inboxes &amp; Email Verification ({totalCalculatedRecipients})
                </h3>
                <p className="text-xs text-slate-500">
                  Full list of destination inboxes for this communication.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Recipient Name</th>
                    <th className="px-4 py-2.5">Email Address</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {totalCalculatedRecipients === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        No recipients selected yet. Check Faculty Google Group, select supervisors, or choose project groups.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* 1. Faculty Google Group */}
                      {sendToFacultyGoogleGroup && (
                        <tr className="bg-purple-50/40 hover:bg-purple-50/70 transition">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                              Google Group
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-purple-900">
                            ECE Department Faculty Google Group
                          </td>
                          <td className="px-4 py-2.5 font-mono text-purple-800 font-bold">
                            {FACULTY_GOOGLE_GROUP_EMAIL}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setSendToFacultyGoogleGroup(false)}
                              className="text-red-500 hover:underline text-xs"
                            >
                              Exclude
                            </button>
                          </td>
                        </tr>
                      )}

                      {/* 2. Individual Faculty Supervisors & Admins */}
                      {activeIndividualFaculty.map((f) => {
                        const isEditing = editingEmailId === f.id;
                        return (
                          <tr key={`fac-${f.id}`} className="hover:bg-purple-50/30 transition">
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                f.role === 'ADMIN'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}>
                                {f.role === 'ADMIN' ? 'Committee Admin' : 'Faculty Supervisor'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <div className="font-semibold text-slate-900">{f.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {f.role === 'ADMIN' ? 'Admin Login Account' : 'Login ID Account'}
                              </div>
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
                              ) : (
                                <span className="font-mono text-purple-700 font-medium">{f.email}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isUpdatingEmail}
                                    onClick={() => handleSaveRecipientEmail('FACULTY', f.id)}
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
                                    setEditingEmailId(f.id);
                                    setEditingEmailValue(f.email || '');
                                  }}
                                  className="text-purple-600 hover:text-purple-800 text-xs font-semibold mr-2"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleFaculty(f.id)}
                                className="text-slate-400 hover:text-red-500 text-xs"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* 3. Students List */}
                      {activeStudentRecipients.map(({ groupNum, student }) => {
                        const isEditing = editingEmailId === student.id;
                        return (
                          <tr key={`st-${student.id}`} className="hover:bg-slate-50/70 transition">
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Group {groupNum} Student
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

                      {/* 4. Custom Recipients */}
                      {customRecipients.map((cr, idx) => (
                        <tr key={`cr-${idx}`} className="hover:bg-slate-50/70 transition bg-amber-50/20">
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
      )}

      {/* Tab Content: INBOX */}
      {activeTab === 'INBOX' && (
        <div className="space-y-4">
          {/* Inbox Header Bar */}
          <div className="bg-white border border-[#C5C3C6] rounded-xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#eef8fa] border border-[#1985A1]/30 flex items-center justify-center text-[#1985A1]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm text-[#46494C]">Google Workspace Incoming Mailbox</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    IMAP Active
                  </span>
                </div>
                <p className="text-xs text-[#4C5C68]">
                  Connected Account: <span className="font-mono font-semibold text-[#1985A1]">{senderEmail}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <div className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadInbox(inboxSearch);
                  }}
                  placeholder="Filter by sender or subject..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#C5C3C6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1985A1] text-[#46494C]"
                />
                <svg
                  className="w-4 h-4 text-slate-400 absolute left-2.5 top-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <button
                type="button"
                onClick={() => loadInbox(inboxSearch)}
                disabled={inboxLoading}
                className="px-3 py-1.5 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-semibold rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
              >
                {inboxLoading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Inbox Split View: Messages List + Reader */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[580px]">
            {/* Left Column: Email Message Cards (5 cols) */}
            <div className="lg:col-span-5 bg-white border border-[#C5C3C6] rounded-2xl shadow-sm flex flex-col overflow-hidden max-h-[700px]">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center text-xs font-semibold text-[#46494C]">
                <span>Recent Received Messages</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  {inboxMessages.length} of {inboxTotal}
                </span>
              </div>

              <div
                onScroll={handleInboxScroll}
                className="overflow-y-auto flex-1 divide-y divide-slate-100"
              >
                {inboxLoading && inboxMessages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                    <svg className="animate-spin w-5 h-5 text-[#1985A1] mx-auto" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <div>Connecting to Google Workspace IMAP...</div>
                  </div>
                ) : inboxMessages.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-xs">
                    No emails found in this mailbox.
                  </div>
                ) : (
                  <>
                    {inboxMessages.map((msg) => {
                      const isSelected = selectedEmailUid === msg.uid;
                      const dateFormatted = new Date(msg.date).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={msg.uid}
                          onClick={() => handleSelectEmail(msg.uid)}
                          className={`p-3.5 cursor-pointer transition text-left relative ${
                            isSelected
                              ? 'bg-[#eef8fa] border-l-4 border-[#1985A1]'
                              : !msg.seen
                              ? 'bg-blue-50/30 hover:bg-slate-50 font-medium'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 truncate">
                              {!msg.seen && (
                                <span
                                  className="w-2 h-2 rounded-full bg-[#1985A1] shrink-0"
                                  title="Unread"
                                />
                              )}
                              <span className="text-xs font-bold text-[#46494C] truncate">
                                {msg.from.name || msg.from.address}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                              {dateFormatted}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono text-[#4C5C68] truncate mb-1">
                            {msg.from.address}
                          </div>

                          <div className="text-xs text-[#46494C] font-semibold truncate">
                            {msg.subject || '(No Subject)'}
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-1">
                            <p className="text-[11px] text-slate-500 line-clamp-1">
                              {msg.snippet || msg.subject}
                            </p>
                            {msg.hasAttachments && (
                              <span className="text-slate-400 shrink-0" title="Has Attachment">
                                📎
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Older Emails Scroll Loader & Trigger */}
                    {hasMoreInbox && (
                      <div className="p-3 text-center bg-slate-50 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={loadMoreInbox}
                          disabled={isLoadingMore}
                          className="text-xs font-semibold text-[#1985A1] hover:text-[#146E85] transition inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1985A1]/30 hover:bg-[#1985A1]/10 disabled:opacity-50"
                        >
                          {isLoadingMore ? (
                            <>
                              <svg className="animate-spin w-3.5 h-3.5 text-[#1985A1]" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                              </svg>
                              <span>Loading older emails...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                              <span>Scroll or Click to Load Older Emails</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {!hasMoreInbox && (
                      <div className="py-3 px-4 text-center text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
                        Showing all {inboxMessages.length} received email(s) • Mailbox up to date
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right Column: Full Email Reader (7 cols) */}
            <div className="lg:col-span-7 bg-white border border-[#C5C3C6] rounded-2xl shadow-sm p-6 flex flex-col justify-between max-h-[700px] overflow-y-auto">
              {detailLoading ? (
                <div className="p-16 text-center text-xs text-slate-400 space-y-3">
                  <svg className="animate-spin w-6 h-6 text-[#1985A1] mx-auto" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <div>Fetching complete email body & attachments from server...</div>
                </div>
              ) : selectedEmailDetail ? (
                <div className="space-y-4">
                  {/* Email Header */}
                  <div className="border-b border-slate-100 pb-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-3">
                      <h2 className="text-lg font-bold text-[#46494C] leading-snug">
                        {selectedEmailDetail.subject}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuickReply(!showQuickReply);
                          setQuickReplyText('');
                        }}
                        className="px-3 py-1.5 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        <span>{showQuickReply ? 'Hide Reply' : 'Reply to Sender'}</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-xs text-[#4C5C68] gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#1985A1] text-white font-bold flex items-center justify-center text-xs uppercase">
                          {selectedEmailDetail.from.name ? selectedEmailDetail.from.name[0] : 'S'}
                        </div>
                        <div>
                          <div className="font-bold text-[#46494C]">
                            {selectedEmailDetail.from.name || 'Unknown'}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            &lt;{selectedEmailDetail.from.address}&gt;
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono">
                        {new Date(selectedEmailDetail.date).toLocaleString('en-IN', {
                          dateStyle: 'full',
                          timeStyle: 'medium',
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Attachments (if present) */}
                  {selectedEmailDetail.attachments && selectedEmailDetail.attachments.length > 0 && (
                    <div className="p-3 bg-slate-50 border border-[#C5C3C6]/60 rounded-xl">
                      <div className="text-[11px] font-bold text-[#46494C] uppercase tracking-wider mb-2">
                        Attachments ({selectedEmailDetail.attachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedEmailDetail.attachments.map((att: { filename: string; contentType: string; size: number }, idx: number) => (
                          <div
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#C5C3C6] text-xs font-medium text-[#46494C] flex items-center gap-1.5"
                          >
                            <span>📎</span>
                            <span className="truncate max-w-[200px]">{att.filename}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({Math.round(att.size / 1024)} KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Email Body Container */}
                  <div className="p-4 bg-slate-50/50 rounded-xl border border-[#C5C3C6]/60 overflow-y-auto max-h-[380px] leading-relaxed text-sm text-[#46494C]">
                    {selectedEmailDetail.html ? (
                      <div
                        className="email-content-view prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: selectedEmailDetail.html }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-sm">
                        {selectedEmailDetail.text}
                      </pre>
                    )}
                  </div>

                  {/* Inline Quick Reply Drawer */}
                  {showQuickReply && (
                    <div className="p-4 bg-[#f4f7f9] border-2 border-[#1985A1] rounded-xl space-y-3 animate-in fade-in-50">
                      <div className="flex items-center justify-between text-xs">
                        <div className="font-bold text-[#46494C]">
                          Replying to:{' '}
                          <span className="font-mono text-[#1985A1]">
                            {selectedEmailDetail.from.address}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          Subject: Re: {selectedEmailDetail.subject}
                        </span>
                      </div>

                      <textarea
                        rows={4}
                        value={quickReplyText}
                        onChange={(e) => setQuickReplyText(e.target.value)}
                        placeholder="Type your official response to supervisor/student here..."
                        className="w-full p-3 text-xs bg-white border border-[#C5C3C6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1985A1] text-[#46494C]"
                      />

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowQuickReply(false);
                            setQuickReplyText('');
                          }}
                          className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-100 text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSendReply}
                          disabled={isSendingQuickReply || !quickReplyText.trim()}
                          className="px-4 py-1.5 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-semibold rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isSendingQuickReply ? 'Dispatching Reply...' : 'Send Official Reply'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-3 text-2xl">
                    ✉️
                  </div>
                  <h3 className="font-bold text-sm text-[#46494C]">No Email Selected</h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Select any incoming message from the left list to read its complete content, inspect attachments, and send an official committee reply.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: SCHEDULED */}
      {activeTab === 'SCHEDULED' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#eef8fa] text-[#1985A1] border border-[#cce3eb]">
                  Automated Dispatch Hub
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {scheduledJobs.length} Scheduled Campaign(s)
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                Scheduled &amp; Recurring Email Campaigns
              </h2>
              <p className="text-xs text-slate-500">
                Automated email dispatches configured within date boundaries and daily frequency limits (max 3 times/day).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={loadSchedules}
                disabled={scheduledLoading}
                className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                {scheduledLoading ? 'Refreshing...' : '↻ Refresh'}
              </button>
              <button
                type="button"
                onClick={handleProcessDueNow}
                disabled={isProcessingDue}
                className="px-4 py-2 bg-[#1985A1] hover:bg-[#146E85] text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isProcessingDue ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Processing Runs...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Process Due Runs Now
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeliveryMode('SCHEDULE');
                  setActiveTab('COMPOSE');
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
              >
                <span>+ Schedule New Email</span>
              </button>
            </div>
          </div>

          {/* List of Scheduled Jobs */}
          {scheduledJobs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto mb-3 text-2xl">
                ⏱️
              </div>
              <h3 className="font-bold text-slate-800 text-base">No Scheduled Emails Configured</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                You have not scheduled any automated communications yet. Switch to &quot;Compose Announcement&quot;, select your recipients, choose &quot;Schedule Email&quot;, and set the date boundary &amp; frequency.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeliveryMode('SCHEDULE');
                  setActiveTab('COMPOSE');
                }}
                className="px-5 py-2.5 bg-[#1985A1] hover:bg-[#146E85] text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Schedule Your First Email
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {scheduledJobs.map((job) => {
                const isExpanded = expandedScheduleId === job.id;
                const progressPct =
                  job.totalOccurrencesCount > 0
                    ? Math.round((job.sentOccurrencesCount / job.totalOccurrencesCount) * 100)
                    : 0;

                const statusColor =
                  job.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : job.status === 'PAUSED'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : job.status === 'COMPLETED'
                    ? 'bg-blue-50 text-blue-800 border-blue-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300';

                return (
                  <div
                    key={job.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-[#1985A1]/40 transition space-y-4"
                  >
                    {/* Top Row: Status, Date Boundary, Frequency & Action Buttons */}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusColor}`}>
                          ● {job.status}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                          📅 {job.startDate} → {job.endDate}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eef8fa] text-[#1985A1] border border-[#cce3eb]">
                          {job.frequencyPerDay} {job.frequencyPerDay === 1 ? 'time/day' : 'times/day'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          {job.timeMode === 'SPECIFIC'
                            ? `Specific: ${job.specificTimes.join(', ')}`
                            : `Window: ${job.randomWindow.startTime} - ${job.randomWindow.endTime}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Pause / Resume Button */}
                        {(job.status === 'ACTIVE' || job.status === 'PAUSED') && (
                          <button
                            type="button"
                            disabled={actionScheduleId === job.id}
                            onClick={() => handleToggleScheduleStatus(job.id, job.status)}
                            className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 transition"
                          >
                            {job.status === 'ACTIVE' ? '⏸ Pause' : '▶ Resume'}
                          </button>
                        )}

                        {/* Test Run Now Button */}
                        <button
                          type="button"
                          disabled={actionScheduleId === job.id}
                          onClick={() => handleTestRunImmediate(job.id)}
                          className="px-3 py-1 text-xs font-semibold rounded-lg border border-[#1985A1] text-[#1985A1] hover:bg-[#eef8fa] transition"
                          title="Immediately send one test occurrence to verify delivery"
                        >
                          ⚡ Test Run Now
                        </button>

                        {/* Delete / Cancel Button */}
                        <button
                          type="button"
                          disabled={actionScheduleId === job.id}
                          onClick={() => handleDeleteSchedule(job.id)}
                          className="px-3 py-1 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition"
                        >
                          ✕ Delete
                        </button>
                      </div>
                    </div>

                    {/* Middle: Subject, Audience, Progress, Next Run */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-7">
                        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <span>{job.subject}</span>
                          {job.attachments && job.attachments.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#eef8fa] text-[#1985A1] border border-[#1985A1]/30">
                              📎 {job.attachments.length}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{job.messageBody}</p>
                        <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-2">
                          <span>Audience: <strong className="text-slate-700">{job.audienceSummary}</strong></span>
                          <span>•</span>
                          <span>Created by {job.createdByName}</span>
                        </div>
                      </div>

                      <div className="md:col-span-5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                        {/* Progress Bar */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">Dispatch Progress</span>
                          <span className="font-bold text-[#1985A1]">
                            {job.sentOccurrencesCount} / {job.totalOccurrencesCount} sent ({progressPct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#1985A1] h-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        {/* Next Run Info */}
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <span className="text-slate-500">Next Scheduled Run:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {job.nextRunAt
                              ? new Date(job.nextRunAt).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : job.status === 'COMPLETED'
                              ? 'All Runs Completed'
                              : 'None Pending'}
                          </span>
                        </div>
                        {job.lastSentAt && (
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Last Dispatched:</span>
                            <span className="font-mono">
                              {new Date(job.lastSentAt).toLocaleString('en-IN', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Occurrences Accordion Toggle */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setExpandedScheduleId(isExpanded ? null : job.id)}
                        className="text-xs font-semibold text-[#1985A1] hover:underline flex items-center gap-1"
                      >
                        <span>{isExpanded ? 'Hide Run Timeline' : 'View Run Timeline'}</span>
                        <span>({job.occurrences.length} occurrences planned)</span>
                      </button>
                      <span className="text-[11px] text-slate-400 font-mono">Job ID: {job.id}</span>
                    </div>

                    {/* Expanded Occurrences List */}
                    {isExpanded && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="text-xs font-bold text-slate-800">
                          Complete Planned Schedule Occurrences ({job.occurrences.length})
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                          {job.occurrences.map((occ, occIdx) => {
                            const occDateStr = new Date(occ.scheduledAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            });
                            return (
                              <div
                                key={occ.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-slate-400">#{occIdx + 1}</span>
                                  <span className="font-mono font-semibold text-slate-800">{occDateStr}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      occ.status === 'SENT'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : occ.status === 'FAILED'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {occ.status}
                                  </span>
                                  {occ.sentAt && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      Dispatched {new Date(occ.sentAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })}
                                    </span>
                                  )}
                                  {occ.error && (
                                    <span className="text-[10px] text-red-500 font-mono" title={occ.error}>
                                      ⚠️ Failed
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: HISTORY */}
      {activeTab === 'HISTORY' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Dispatched Communications Audit Log</h3>
            <p className="text-xs text-slate-500">
              Complete history of all official notices and communications sent from this portal.
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
                <th className="px-4 py-3 text-center">Batch &amp; Target</th>
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
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <span>{item.subject}</span>
                          {item.attachments && item.attachments.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#eef8fa] text-[#1985A1] border border-[#1985A1]/30">
                              📎 {item.attachments.length}
                            </span>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 whitespace-pre-wrap font-sans text-xs">
                            {item.messageBody}
                            {item.attachments && item.attachments.length > 0 && (
                              <div className="mt-3 pt-2 border-t border-slate-200">
                                <div className="text-[11px] font-bold text-slate-600 mb-1">Attached Files ({item.attachments.length}):</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.attachments.map((att, aIdx) => (
                                    <span key={aIdx} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-white border border-[#C5C3C6] text-[#46494C]">
                                      📄 {att.filename} {att.size ? `(${formatBytes(att.size)})` : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                              <strong>Destination Inboxes ({item.recipients.length}):</strong>{' '}
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
      )}
    </div>
  );
}
