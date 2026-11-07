'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  GroupForumData,
  ForumPostItem,
  ForumAttachment,
  createForumPostAction,
  createForumReplyAction,
  toggleForumReactionAction,
  castSupervisorMarkupAction,
} from '@/app/actions/forum';
import {
  getGoogleDriveStatusAction,
  saveGoogleDriveWebhookAction,
  testGoogleDriveConnectionAction,
} from '@/app/actions/google-drive';

interface ForumViewProps {
  initialData: GroupForumData;
  onGroupChange?: (groupId: string) => void;
}

export default function ForumView({ initialData, onGroupChange }: ForumViewProps) {
  const router = useRouter();
  const [data, setData] = useState<GroupForumData>(initialData);
  const [selectedGroupId, setSelectedGroupId] = useState(initialData.group?.id || '');

  useEffect(() => {
    setData(initialData);
    setSelectedGroupId(initialData.group?.id || '');
  }, [initialData]);

  const isCommittee = data.channel === 'COMMITTEE';
  const isSupervisorOfGroup = !isCommittee && data.isSupervisor;

  // Google Drive Storage Modal State
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveConfig, setDriveConfig] = useState<{
    isConfigured: boolean;
    targetEmail: string;
    maskedWebhookUrl: string | null;
    scriptTemplate: string;
    manifestTemplate: string;
  } | null>(null);
  const [driveWebhookInput, setDriveWebhookInput] = useState('');
  const [isSavingDrive, setIsSavingDrive] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);

  async function loadDriveStatus() {
    setDriveError(null);
    setDriveMessage(null);
    const res = await getGoogleDriveStatusAction();
    if (res.success) {
      setDriveConfig({
        isConfigured: res.isConfigured,
        targetEmail: res.targetEmail,
        maskedWebhookUrl: res.maskedWebhookUrl,
        scriptTemplate: res.scriptTemplate,
        manifestTemplate: res.manifestTemplate,
      });
    }
  }

  async function handleSaveDriveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingDrive(true);
    setDriveError(null);
    setDriveMessage(null);
    const res = await saveGoogleDriveWebhookAction(driveWebhookInput);
    setIsSavingDrive(false);
    if (res.success) {
      setDriveMessage(res.message || 'Saved successfully.');
      setDriveWebhookInput('');
      await loadDriveStatus();
    } else {
      setDriveError(res.error || 'Failed to save webhook URL.');
    }
  }

  async function handleTestDriveConnection() {
    setIsTestingDrive(true);
    setDriveError(null);
    setDriveMessage(null);
    const res = await testGoogleDriveConnectionAction();
    setIsTestingDrive(false);
    if (res.success) {
      setDriveMessage(res.message || 'Connection verified!');
    } else {
      setDriveError(res.error || 'Connection failed.');
    }
  }

  // New Post State
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostAttachments, setNewPostAttachments] = useState<ForumAttachment[]>([]);
  const [newPostTargetScope, setNewPostTargetScope] = useState<'SINGLE_GROUP' | 'ALL_SUPERVISED_GROUPS'>('SINGLE_GROUP');
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Reply States (keyed by postId)
  const [activeReplyBoxPostId, setActiveReplyBoxPostId] = useState<string | null>(null);
  const [replyContents, setReplyContents] = useState<Record<string, string>>({});
  const [replyAttachments, setReplyAttachments] = useState<Record<string, ForumAttachment[]>>({});
  const [isReplyingMap, setIsReplyingMap] = useState<Record<string, boolean>>({});

  // File input refs
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  // Gamification Explainer Modal
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Group Switcher (Faculty only)
  function handleSelectGroup(newId: string) {
    setSelectedGroupId(newId);
    if (onGroupChange) {
      onGroupChange(newId);
    } else {
      router.push(`?channel=GROUP&groupId=${newId}`);
      router.refresh();
    }
  }

  // Handle Post Attachment Selection
  function handlePostFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 5MB size limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setNewPostAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            url,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  // Handle Reply Attachment Selection
  function handleReplyFileSelect(postId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds 5MB limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setReplyAttachments((prev) => ({
          ...prev,
          [postId]: [
            ...(prev[postId] || []),
            {
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              url,
            },
          ],
        }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  // Submit New Post
  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!newPostTitle.trim() || !newPostContent.trim()) {
      setPostError('Please enter both a title and description.');
      return;
    }

    setIsPosting(true);
    setPostError(null);

    const res = await createForumPostAction({
      channel: data.channel,
      groupId: isCommittee ? undefined : selectedGroupId,
      targetScope: isCommittee ? 'COMMITTEE' : newPostTargetScope,
      title: newPostTitle.trim(),
      content: newPostContent.trim(),
      attachments: newPostAttachments,
    });

    setIsPosting(false);
    if (!res.success) {
      setPostError(res.error || 'Failed to submit post.');
    } else {
      setNewPostTitle('');
      setNewPostContent('');
      setNewPostAttachments([]);
      setShowNewPostModal(false);
      if (onGroupChange && data.group) onGroupChange(data.group.id);
      router.refresh();
    }
  }

  // Submit Reply
  async function handleCreateReply(postId: string) {
    const content = replyContents[postId]?.trim();
    if (!content) return;

    setIsReplyingMap((prev) => ({ ...prev, [postId]: true }));

    const res = await createForumReplyAction({
      postId,
      content,
      attachments: replyAttachments[postId] || [],
    });

    setIsReplyingMap((prev) => ({ ...prev, [postId]: false }));

    if (res.success) {
      setReplyContents((prev) => ({ ...prev, [postId]: '' }));
      setReplyAttachments((prev) => ({ ...prev, [postId]: [] }));
      setActiveReplyBoxPostId(null);
      if (onGroupChange && data.group) onGroupChange(data.group.id);
      router.refresh();
    } else {
      alert(res.error || 'Failed to post reply.');
    }
  }

  // Toggle Reaction (Like / Dislike)
  async function handleToggleReaction(opts: { postId?: string; replyId?: string; type: 'LIKE' | 'DISLIKE' }) {
    await toggleForumReactionAction(opts);
    if (onGroupChange && data.group) onGroupChange(data.group.id);
    router.refresh();
  }

  // Cast Supervisor Markup (+1 / -1)
  async function handleSupervisorMarkup(opts: {
    postId?: string;
    replyId?: string;
    targetUserId: string;
    value: 1 | -1;
  }) {
    if (!isSupervisorOfGroup) return;
    const res = await castSupervisorMarkupAction(opts);
    if (!res.success) {
      alert(res.error || 'Could not register supervisor evaluation.');
    } else {
      if (onGroupChange && data.group) onGroupChange(data.group.id);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 text-slate-800">
      {/* Faculty Channel Switcher Tab (Only on Faculty account) */}
      {data.currentUserRole === 'FACULTY' && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              router.push('/faculty/forum?channel=GROUP');
              router.refresh();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              !isCommittee
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <span>👥 My Supervised Groups</span>
            {data.supervisedGroups.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${!isCommittee ? 'bg-blue-500 text-white' : 'bg-slate-300 text-slate-700'}`}>
                {data.supervisedGroups.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              router.push('/faculty/forum?channel=COMMITTEE');
              router.refresh();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              isCommittee
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <span>🏛️ Admin Committee Discussion</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isCommittee ? 'bg-indigo-500 text-white' : 'bg-slate-300 text-slate-700'}`}>
              Faculty &amp; Admin
            </span>
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-blue-800/60 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isCommittee ? (
                <>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                    🏛️ Committee Channel
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/25 text-emerald-300 border border-emerald-400/30">
                    Faculty &amp; Admin Hub
                  </span>
                </>
              ) : (
                <>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/30 text-blue-200 border border-blue-400/40 font-mono">
                    Batch {data.group?.batchId} • Group #{data.group?.number}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/25 text-emerald-300 border border-emerald-400/30">
                    Group Forum
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRulesModal(true)}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/25 text-amber-300 border border-amber-400/30 hover:bg-amber-500/40 transition inline-flex items-center gap-1"
                  >
                    <span>🏆 Badges &amp; Marks</span>
                  </button>
                </>
              )}

              {/* Google Drive Storage Modal Trigger */}
              {(data.currentUserRole === 'ADMIN' || data.currentUserRole === 'FACULTY') && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDriveModal(true);
                    loadDriveStatus();
                  }}
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/40 transition inline-flex items-center gap-1.5"
                  title="Official Google Drive space of ece.project.committee@heritageit.edu"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                  </svg>
                  <span>Google Drive Storage</span>
                </button>
              )}
            </div>

            <h1 className="text-xl font-bold tracking-tight text-white mt-1">
              {isCommittee
                ? 'Supervisor & Project Committee Discussion Forum'
                : data.group?.topic?.title
                ? `${data.group.topic.title}`
                : 'Capstone Project Discussion Forum'}
            </h1>

            {data.group?.topic?.code && (
              <p className="text-xs text-blue-300 font-mono">Topic Code: {data.group.topic.code}</p>
            )}

            <p className="text-xs text-blue-200 max-w-2xl leading-relaxed">
              {isCommittee
                ? 'Official two-way communication channel between Faculty Supervisors and Project Committee Administrators. Deliberate academic issues, project approvals, schedules, and policy directives.'
                : `Collaborative technical forum for Group #${data.group?.number} and Supervisor ${data.group?.supervisor.name}. Share queries, progress updates, documentation, and peer answers.`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Faculty Group Selector (Only in Group mode) */}
            {!isCommittee && data.currentUserRole === 'FACULTY' && data.supervisedGroups.length > 1 && (
              <select
                value={selectedGroupId}
                onChange={(e) => handleSelectGroup(e.target.value)}
                className="px-3 py-2 text-xs font-semibold bg-slate-800 text-white rounded-xl border border-blue-700/60 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {data.supervisedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Batch {g.batchId} • Group #{g.number} ({g.topicCode || 'No Code'})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setShowNewPostModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/40 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{isCommittee ? 'New Committee Topic' : 'Start Discussion'}</span>
            </button>
          </div>
        </div>

        {/* Member Badges & Leaderboard Bar (Only in Group discussions) */}
        {!isCommittee && data.members.length > 0 && (
          <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Group Roster ({data.members.length} Students):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {data.members.map((m) => (
                  <div
                    key={m.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px]"
                    title={`Net Markups: ${m.badges.effectiveScore} | Diamonds: ${m.badges.diamonds}, Gold: ${m.badges.gold}, Silver: ${m.badges.silver}, Copper: ${m.badges.copper}, Iron: ${m.badges.iron}`}
                  >
                    <span className="font-semibold text-white">{m.name.split(' ')[0]}</span>
                    <span className="text-slate-400 font-mono text-[10px]">({m.roll})</span>
                    <div className="inline-flex items-center gap-1 ml-1">
                      {m.badges.diamonds > 0 && <span title={`${m.badges.diamonds} Diamonds`}>💎{m.badges.diamonds}</span>}
                      {m.badges.gold > 0 && <span title={`${m.badges.gold} Gold`}>🥇{m.badges.gold}</span>}
                      {m.badges.silver > 0 && <span title={`${m.badges.silver} Silver`}>🥈{m.badges.silver}</span>}
                      {m.badges.copper > 0 && <span title={`${m.badges.copper} Copper`}>🥉{m.badges.copper}</span>}
                      {m.badges.iron > 0 && <span title={`${m.badges.iron} Iron`}>⚙️{m.badges.iron}</span>}
                      {m.badges.badges.length === 0 && (
                        <span className="text-[10px] text-slate-400 font-mono">{m.badges.effectiveScore} pts</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {data.group?.supervisor?.name && (
              <div className="text-[11px] text-blue-300">
                Supervisor: <span className="font-semibold text-white">{data.group.supervisor.name}</span>
              </div>
            )}
          </div>
        )}

        {isCommittee && (
          <div className="pt-2 border-t border-white/10 text-[11px] text-indigo-200 flex items-center justify-between">
            <span>🔒 Confidential Channel: Accessible solely to Faculty Supervisors and Project Committee Admins. Students cannot view or post here.</span>
            <span className="text-slate-400">Badge Gamification: Not Applicable</span>
          </div>
        )}
      </div>

      {/* Gamification Explainer Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-base">
                  🏆
                </span>
                <h3 className="font-bold text-slate-900 text-base">Supervisor Mark Up &amp; Badge System</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
                <span className="font-bold">Purpose:</span> Only the group supervisor can cast a <strong>Mark Up (+1)</strong> for a high-quality, technically rigorous post or query, and a <strong>Mark Down (-1)</strong> for irrelevant or substandard posts.
                These marks act as an indicator of academic regularity, curiosity, and technical depth.
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Badge Progression Scale:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2">
                    <span className="text-base">⚙️</span>
                    <div>
                      <div className="font-bold text-slate-900">Iron Badge (10 pts)</div>
                      <div className="text-[10px] text-slate-500">Earned at 10 net markups</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
                    <span className="text-base">🥉</span>
                    <div>
                      <div className="font-bold text-amber-900">Copper Badge (20 pts)</div>
                      <div className="text-[10px] text-amber-700">Earned at 20 net markups</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 flex items-center gap-2">
                    <span className="text-base">🥈</span>
                    <div>
                      <div className="font-bold text-sky-900">Silver Badge (30 pts)</div>
                      <div className="text-[10px] text-sky-700">Earned at 30 net markups</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200 flex items-center gap-2">
                    <span className="text-base">🥇</span>
                    <div>
                      <div className="font-bold text-yellow-900">Gold Badge (40 pts)</div>
                      <div className="text-[10px] text-yellow-700">Earned at 40 net markups</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-teal-50 border border-teal-200 flex items-center gap-2 sm:col-span-2">
                    <span className="text-base">💎</span>
                    <div>
                      <div className="font-bold text-teal-900">Diamond Pioneer (50 pts)</div>
                      <div className="text-[10px] text-teal-700">One of each material completed (Iron, Copper, Silver, Gold, Diamond)</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-[11px] space-y-1">
                <span className="font-bold">60 to 100 Duplicate &amp; Triple Diamond Conversion:</span>
                <p>
                  From 60 to 90 points, students earn duplicates starting from Iron (60), Copper (70), Silver (80), and Gold (90).
                  Upon reaching <strong>100 Markups (Double Diamond)</strong>, the student receives <strong>3 Cumulative Diamonds</strong>, and all lower materials are compensated and cleared.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Storage Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Google Drive Cloud Storage (100% Free)</h3>
                  <p className="text-xs text-slate-500">Official storage space for all capstone forum attachments</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDriveModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Target Account Badge */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Target Google Workspace Account
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    driveConfig?.isConfigured
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {driveConfig?.isConfigured ? '● Live & Connected' : '○ Configuration Needed'}
                </span>
              </div>
              <p className="font-mono text-xs font-bold text-slate-900">
                ece.project.committee@heritageit.edu
              </p>
              <p className="text-[11px] text-slate-600">
                All PDFs, design documents, and images uploaded in the forum discussion are hosted in this Google Drive space under structured folders without any recurring cost.
              </p>
            </div>

            {driveMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between">
                <span>{driveMessage}</span>
                <button type="button" onClick={() => setDriveMessage(null)} className="text-emerald-700 font-bold ml-2">
                  ✕
                </button>
              </div>
            )}

            {driveError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Connection Notice:</span>
                  <button type="button" onClick={() => setDriveError(null)} className="text-red-700 font-bold ml-2">
                    ✕
                  </button>
                </div>
                <p className="whitespace-pre-wrap">{driveError}</p>
              </div>
            )}

            {/* Webhook Form */}
            <form onSubmit={handleSaveDriveWebhook} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Google Apps Script Webhook Endpoint
                  </label>
                  {driveConfig?.maskedWebhookUrl && (
                    <span className="text-[10px] font-mono text-slate-500">
                      Current: {driveConfig.maskedWebhookUrl}
                    </span>
                  )}
                </div>
                <input
                  type="url"
                  value={driveWebhookInput}
                  onChange={(e) => setDriveWebhookInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleTestDriveConnection}
                  disabled={isTestingDrive}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <span>{isTestingDrive ? 'Testing...' : '🔄 Test Connection'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isSavingDrive || !driveWebhookInput.trim()}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
                >
                  {isSavingDrive ? 'Saving...' : 'Save & Connect Webhook'}
                </button>
              </div>
            </form>

            {/* Step-by-Step Guide */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Fresh Setup in 60 seconds (100% Free):</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (driveConfig?.manifestTemplate) {
                        navigator.clipboard.writeText(driveConfig.manifestTemplate);
                        setCopiedManifest(true);
                        setTimeout(() => setCopiedManifest(false), 3000);
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-bold transition"
                  >
                    <span>{copiedManifest ? '✓ Copied appsscript.json!' : '📋 Copy appsscript.json'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (driveConfig?.scriptTemplate) {
                        navigator.clipboard.writeText(driveConfig.scriptTemplate);
                        setCopiedScript(true);
                        setTimeout(() => setCopiedScript(false), 3000);
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold transition"
                  >
                    <span>{copiedScript ? '✓ Copied Code.gs!' : '📋 Copy Code.gs'}</span>
                  </button>
                </div>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px] leading-relaxed">
                <li>Log in to <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-semibold">script.google.com</a> with <strong>ece.project.committee@heritageit.edu</strong>.</li>
                <li>Click <strong>New project</strong>. Paste the copied <strong>Code.gs</strong> and save (`Ctrl+S`).</li>
                <li>In ⚙️ <strong>Project Settings</strong>, check <em>&quot;Show &apos;appsscript.json&apos; manifest file in editor&quot;</em>. In editor, paste the copied <strong>appsscript.json</strong> and save.</li>
                <li>Select <strong>authorizeDrive</strong> in function dropdown at top and click <strong>Run (▶️)</strong>. Review permissions $\to$ Advanced $\to$ Allow.</li>
                <li>Click <strong>Deploy $\to$ New deployment</strong> $\to$ Web app $\to$ Execute as: <strong>Me (ece.project.committee@heritageit.edu)</strong>, Who has access: <strong>Anyone</strong> $\to$ Deploy.</li>
                <li>Copy the resulting Web App URL and paste it into the box above.</li>
              </ol>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDriveModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Discussion Post Modal */}
      {showNewPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  💬
                </span>
                <h3 className="font-bold text-slate-900 text-base">
                  {isCommittee ? 'Create New Committee Discussion Topic' : 'Create New Group Discussion Post'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewPostModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-4">
              {postError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                  {postError}
                </div>
              )}

              {/* Scope Selection for Faculty in Group Discussions */}
              {data.currentUserRole === 'FACULTY' && !isCommittee && data.supervisedGroups.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Distribution Audience:
                  </label>
                  <div className="flex flex-col sm:flex-row gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input
                        type="radio"
                        name="postTargetScope"
                        checked={newPostTargetScope === 'SINGLE_GROUP'}
                        onChange={() => setNewPostTargetScope('SINGLE_GROUP')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>This Group Only (Group #{data.group?.number})</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-medium text-indigo-800">
                      <input
                        type="radio"
                        name="postTargetScope"
                        checked={newPostTargetScope === 'ALL_SUPERVISED_GROUPS'}
                        onChange={() => setNewPostTargetScope('ALL_SUPERVISED_GROUPS')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Broadcast to All My Supervised Groups ({data.supervisedGroups.length})</span>
                    </label>
                  </div>
                </div>
              )}

              {isCommittee && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900">
                  <strong>Audience:</strong> Project Committee Admins &amp; Faculty Supervisors. (Not visible to students).
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Discussion Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPostTitle}
                  onChange={(e) => setNewPostTitle(e.target.value)}
                  placeholder={
                    isCommittee
                      ? 'e.g. Schedule clarification for Phase 2 interim evaluations...'
                      : 'e.g. Literature Survey queries on edge inference...'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Discussion Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={6}
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder={
                    isCommittee
                      ? 'Describe the administrative query, schedule question, or academic topic for the committee...'
                      : 'Provide technical context, questions, simulation results, or guidance...'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 leading-relaxed font-sans"
                />
              </div>

              {/* Attachments Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span>Attach Supporting Files (PDF, images, reports, code)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => postFileInputRef.current?.click()}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    + Add Files (Max 5MB)
                  </button>
                  <input
                    ref={postFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handlePostFileSelect}
                  />
                </div>

                {newPostAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {newPostAttachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700"
                      >
                        <span className="font-mono truncate max-w-xs">{att.name}</span>
                        <span className="text-[10px] text-slate-400">({Math.round(att.size / 1024)} KB)</span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewPostAttachments((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-red-600 font-bold ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewPostModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPosting}
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPosting ? 'Publishing...' : isCommittee ? 'Post Committee Topic' : 'Publish Discussion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discussion Posts Feed */}
      <div className="space-y-6">
        {data.posts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl">
              💬
            </div>
            <h3 className="font-bold text-slate-900 text-sm">
              {isCommittee ? 'No Committee Discussions Yet' : 'No Group Discussions Yet'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {isCommittee
                ? 'Supervisors and administrators can start a discussion thread to discuss project committee decisions, evaluations, and guidelines.'
                : 'Be the first to start a conversation! Share technical ideas, literature papers, or project doubts with your supervisor and peers.'}
            </p>
            <button
              type="button"
              onClick={() => setShowNewPostModal(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              <span>+ Start First Discussion</span>
            </button>
          </div>
        ) : (
          data.posts.map((post) => {
            const supervisorVote = post.markup.supervisorVote;
            const isAuthorStudent = post.author.role === 'STUDENT';

            return (
              <div
                key={post.id}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition hover:border-slate-300"
              >
                {/* Post Header */}
                <div className="p-6 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                        {post.author.name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">{post.author.name}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              post.author.role === 'ADMIN'
                                ? 'bg-purple-100 text-purple-800'
                                : post.author.role === 'FACULTY'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {post.author.role === 'ADMIN'
                              ? 'Admin'
                              : post.author.role === 'FACULTY'
                              ? 'Supervisor'
                              : 'Student'}
                          </span>
                          {!isCommittee && post.author.badges && (
                            <>
                              {post.author.badges.diamonds > 0 && <span title={`${post.author.badges.diamonds} Diamonds`}>💎{post.author.badges.diamonds}</span>}
                              {post.author.badges.gold > 0 && <span title={`${post.author.badges.gold} Gold`}>🥇{post.author.badges.gold}</span>}
                              {post.author.badges.silver > 0 && <span title={`${post.author.badges.silver} Silver`}>🥈{post.author.badges.silver}</span>}
                              {post.author.badges.copper > 0 && <span title={`${post.author.badges.copper} Copper`}>🥉{post.author.badges.copper}</span>}
                              {post.author.badges.iron > 0 && <span title={`${post.author.badges.iron} Iron`}>⚙️{post.author.badges.iron}</span>}
                            </>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(post.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}{' '}
                          at{' '}
                          {new Date(post.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Supervisor Markup Indicator on Post */}
                    {!isCommittee && supervisorVote !== null && (
                      <div className="inline-flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            supervisorVote === 1
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-red-50 text-red-800 border border-red-300'
                          }`}
                        >
                          {supervisorVote === 1 ? '⭐ Supervisor Marked Up (+1)' : '⚠️ Supervisor Marked Down (-1)'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Post Content */}
                  <div className="space-y-1.5">
                    <h2 className="text-base font-bold text-slate-900 leading-snug">{post.title}</h2>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">
                      {post.content}
                    </p>
                  </div>

                  {/* Attachments list */}
                  {post.attachments && post.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {post.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.driveViewLink || att.url}
                          target={att.driveViewLink ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          download={att.driveViewLink ? undefined : att.name}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-blue-700 font-semibold hover:bg-blue-50 transition"
                          title={att.driveViewLink ? "Open file in Google Drive of ece.project.committee@heritageit.edu" : att.name}
                        >
                          {att.driveViewLink ? (
                            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                            </svg>
                          ) : (
                            <span>📎</span>
                          )}
                          <span className="truncate max-w-[220px]">{att.name}</span>
                          <span className="text-[10px] text-slate-400">({Math.round(att.size / 1024)} KB)</span>
                          {att.driveViewLink && (
                            <span className="text-[10px] font-bold text-emerald-700">Drive ↗</span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Post Footer Action Bar */}
                  <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs gap-3">
                    <div className="flex items-center gap-3">
                      {/* Like / Dislike */}
                      <button
                        type="button"
                        onClick={() => handleToggleReaction({ postId: post.id, type: 'LIKE' })}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                          post.reactions.userReaction === 'LIKE'
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>👍</span>
                        <span>{post.reactions.likes}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleReaction({ postId: post.id, type: 'DISLIKE' })}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                          post.reactions.userReaction === 'DISLIKE'
                            ? 'bg-red-100 text-red-800 font-bold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>👎</span>
                        <span>{post.reactions.dislikes}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveReplyBoxPostId(activeReplyBoxPostId === post.id ? null : post.id)}
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 font-semibold text-xs ml-2"
                      >
                        <span>💬 {post.replies.length} Answers</span>
                      </button>
                    </div>

                    {/* Supervisor Mark Up / Down Action (Only for student authors in group discussions) */}
                    {isSupervisorOfGroup && isAuthorStudent && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-500 mr-1">Supervisor Marks:</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleSupervisorMarkup({
                              postId: post.id,
                              targetUserId: post.author.id,
                              value: 1,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition ${
                            supervisorVote === 1
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                          title="Award Mark Up (+1) for technical rigor"
                        >
                          <span>▲ Mark Up (+1)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleSupervisorMarkup({
                              postId: post.id,
                              targetUserId: post.author.id,
                              value: -1,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition ${
                            supervisorVote === -1
                              ? 'bg-red-600 text-white shadow-sm'
                              : 'bg-red-50 hover:bg-red-100 text-red-800 border border-red-300'
                          }`}
                          title="Award Mark Down (-1) for irrelevant content"
                        >
                          <span>▼ Mark Down (-1)</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Threaded Replies Section */}
                <div className="bg-slate-50/70 p-6 space-y-4">
                  {post.replies.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Discussion Answers &amp; Follow-ups ({post.replies.length})
                      </span>
                      {post.replies.map((reply) => {
                        const replySupervisorVote = reply.markup.supervisorVote;
                        const isReplyAuthorStudent = reply.author.role === 'STUDENT';

                        return (
                          <div
                            key={reply.id}
                            className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-2xs"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xs">
                                  {reply.author.name[0]}
                                </div>
                                <span className="font-bold text-slate-900 text-xs">{reply.author.name}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    reply.author.role === 'ADMIN'
                                      ? 'bg-purple-100 text-purple-800'
                                      : reply.author.role === 'FACULTY'
                                      ? 'bg-indigo-100 text-indigo-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {reply.author.role === 'ADMIN' ? 'Admin' : reply.author.role === 'FACULTY' ? 'Supervisor' : 'Student'}
                                </span>
                                {!isCommittee && reply.author.badges && (
                                  <>
                                    {reply.author.badges.diamonds > 0 && <span>💎{reply.author.badges.diamonds}</span>}
                                    {reply.author.badges.gold > 0 && <span>🥇{reply.author.badges.gold}</span>}
                                    {reply.author.badges.silver > 0 && <span>🥈{reply.author.badges.silver}</span>}
                                    {reply.author.badges.copper > 0 && <span>🥉{reply.author.badges.copper}</span>}
                                    {reply.author.badges.iron > 0 && <span>⚙️{reply.author.badges.iron}</span>}
                                  </>
                                )}
                                <span className="text-[10px] text-slate-400">
                                  {new Date(reply.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>

                              {!isCommittee && replySupervisorVote !== null && (
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    replySupervisorVote === 1
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-red-50 text-red-800 border border-red-200'
                                  }`}
                                >
                                  {replySupervisorVote === 1 ? '⭐ Mark Up (+1)' : '⚠️ Mark Down (-1)'}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {reply.content}
                            </p>

                            {/* Reply Attachments */}
                            {reply.attachments && reply.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {reply.attachments.map((att, idx) => (
                                  <a
                                    key={idx}
                                    href={att.driveViewLink || att.url}
                                    target={att.driveViewLink ? '_blank' : undefined}
                                    rel="noopener noreferrer"
                                    download={att.driveViewLink ? undefined : att.name}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-blue-700 font-semibold hover:bg-blue-50 transition"
                                  >
                                    {att.driveViewLink ? (
                                      <svg className="w-3 h-3 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                                      </svg>
                                    ) : (
                                      <span>📎</span>
                                    )}
                                    <span className="truncate max-w-[180px]">{att.name}</span>
                                    <span className="text-[9px] text-slate-400">({Math.round(att.size / 1024)} KB)</span>
                                    {att.driveViewLink && (
                                      <span className="text-[9px] font-bold text-emerald-700">Drive ↗</span>
                                    )}
                                  </a>
                                ))}
                              </div>
                            )}

                            {/* Reply Action footer */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleReaction({ replyId: reply.id, type: 'LIKE' })}
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    reply.reactions.userReaction === 'LIKE'
                                      ? 'bg-blue-100 text-blue-800 font-bold'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  👍 {reply.reactions.likes}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleReaction({ replyId: reply.id, type: 'DISLIKE' })}
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    reply.reactions.userReaction === 'DISLIKE'
                                      ? 'bg-red-100 text-red-800 font-bold'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  👎 {reply.reactions.dislikes}
                                </button>
                              </div>

                              {isSupervisorOfGroup && isReplyAuthorStudent && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSupervisorMarkup({
                                        replyId: reply.id,
                                        targetUserId: reply.author.id,
                                        value: 1,
                                      })
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      replySupervisorVote === 1
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                                    }`}
                                  >
                                    ▲ Mark Up
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSupervisorMarkup({
                                        replyId: reply.id,
                                        targetUserId: reply.author.id,
                                        value: -1,
                                      })
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      replySupervisorVote === -1
                                        ? 'bg-red-600 text-white'
                                        : 'bg-red-50 text-red-800 border border-red-300 hover:bg-red-100'
                                    }`}
                                  >
                                    ▼ Mark Down
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Inline Reply Composer */}
                  {activeReplyBoxPostId === post.id ? (
                    <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3 shadow-xs">
                      <span className="font-bold text-xs text-slate-800 block">
                        Write an answer or follow-up reply:
                      </span>
                      <textarea
                        rows={3}
                        value={replyContents[post.id] || ''}
                        onChange={(e) =>
                          setReplyContents((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        placeholder="Contribute your answer, technical explanation, or reference..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                      />

                      {/* Attachments for reply */}
                      {(replyAttachments[post.id] || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(replyAttachments[post.id] || []).map((att, idx) => (
                            <div
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]"
                            >
                              <span>{att.name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setReplyAttachments((prev) => ({
                                    ...prev,
                                    [post.id]: prev[post.id].filter((_, i) => i !== idx),
                                  }))
                                }
                                className="text-slate-400 hover:text-red-500 font-bold"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <button
                            type="button"
                            onClick={() => replyFileInputRef.current?.click()}
                            className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            <span>📎 Attach file</span>
                          </button>
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => handleReplyFileSelect(post.id, e)}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveReplyBoxPostId(null)}
                            className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isReplyingMap[post.id] || !replyContents[post.id]?.trim()}
                            onClick={() => handleCreateReply(post.id)}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                          >
                            {isReplyingMap[post.id] ? 'Posting...' : 'Post Reply'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveReplyBoxPostId(post.id)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5"
                    >
                      <span>💬 Write an answer to this discussion...</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
