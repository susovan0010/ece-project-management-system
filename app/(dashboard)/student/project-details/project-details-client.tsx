'use client';

import { useState } from 'react';
import { StudentProjectDetails } from '@/app/actions/student-project';

interface Props {
  initialData?: StudentProjectDetails | null;
  error?: string | null;
}

export default function StudentProjectDetailsClient({ initialData, error: initialError }: Props) {
  const [data] = useState<StudentProjectDetails | null>(initialData || null);
  const [error] = useState<string | null>(initialError || null);

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            ⚠️
          </div>
          <h2 className="text-lg font-bold text-slate-900">Student Profile Notice</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-2">
            {error || 'Unable to retrieve your allocated project details. Please ensure you are logged in with your official student email.'}
          </p>
          <div className="mt-6">
            <a
              href="mailto:ece.project.committee@heritageit.edu"
              className="px-4 py-2 bg-[#1985A1] hover:bg-[#146E85] text-white rounded-xl text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
            >
              Contact Project Committee Admin
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { student, group, topic, supervisor, members } = data;

  if (!group || !topic) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Student Profile Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
              Allocation In Progress
            </span>
            <h1 className="text-xl font-bold text-slate-900 mt-2">{student.name}</h1>
            <p className="text-xs font-mono text-slate-500">
              Roll: <strong>{student.roll}</strong> • {student.email || 'No email registered'}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto mb-3 text-2xl">
            📋
          </div>
          <h3 className="font-bold text-slate-800 text-base">Project Not Yet Allotted</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Your project group and supervisor allocation is currently being finalized by the Project Committee. Please check back shortly or reach out to the committee administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* 1. Header Banner & Student Profile Card */}
      <div className="bg-gradient-to-r from-[#4C5C68] via-[#1985A1] to-[#146E85] rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/25 text-emerald-100 border border-emerald-300/40">
                ● Allotted &amp; Active
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                Batch {group.batchId}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                Group #{group.number}
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-2 tracking-tight">{student.name}</h1>
            <p className="text-xs text-white/80 font-mono mt-0.5">
              Roll: <strong className="text-white">{student.roll}</strong> • {student.email}
              {student.phone ? ` • ${student.phone}` : ''}
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 text-xs self-start md:self-auto min-w-[200px]">
            <div className="text-[10px] uppercase font-bold text-white/70">Department</div>
            <div className="font-semibold text-white">Electronics &amp; Communication Engg.</div>
            <div className="text-[11px] text-white/80 mt-0.5">Heritage Institute of Technology</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Assigned Project Topic & Complexity Attributes (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Assigned Project Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  {topic.code}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {topic.category}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  Source: {topic.source}
                </span>
                {topic.domain && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Domain: {topic.domain}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-900 leading-snug">{topic.title}</h2>
              {topic.organization && (
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Associated Organization: <strong className="text-slate-700">{topic.organization}</strong>
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Project Synopsis &amp; Problem Statement
              </h3>
              <div className="text-xs leading-relaxed text-slate-700 bg-slate-50/70 p-4 rounded-xl border border-slate-200 whitespace-pre-wrap font-sans">
                {topic.description || 'No detailed description recorded.'}
              </div>
            </div>

            {/* Tags */}
            {topic.tags && topic.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Keywords &amp; Technologies</h3>
                <div className="flex flex-wrap gap-1.5">
                  {topic.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Washington Accord Complex Engineering Attributes */}
            {topic.attributes && topic.attributes.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  Washington Accord &amp; NBA Complex Engineering Attributes
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {topic.attributes.map((attr) => (
                    <div key={attr.code} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-blue-700">{attr.code}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          Level {attr.level}/3
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800">{attr.title}</div>
                      {attr.reason && <p className="text-[11px] text-slate-500 line-clamp-2">{attr.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sustainable Development Goals (SDGs) */}
            {topic.sdgs && topic.sdgs.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  UN Sustainable Development Goals (SDGs)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {topic.sdgs.map((sdg) => (
                    <div
                      key={sdg.sdgId}
                      className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-xs text-emerald-900 flex items-center gap-2"
                    >
                      <span className="font-bold">SDG {sdg.sdgId}:</span>
                      <span>{sdg.title}</span>
                      {sdg.target && (
                        <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-mono font-semibold">
                          Target {sdg.target}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Supervisor & Group Members (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Assigned Faculty Supervisor Card */}
          <div className="bg-white border-2 border-[#1985A1]/30 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1985A1]">
                Project Supervisor
              </span>
              <span className="text-[10px] font-bold bg-[#eef8fa] text-[#1985A1] px-2 py-0.5 rounded-full border border-[#cce3eb]">
                Faculty Advisor
              </span>
            </div>

            {supervisor ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#eef8fa] border border-[#1985A1]/20 text-[#1985A1] flex items-center justify-center font-bold text-lg shrink-0">
                    {supervisor.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{supervisor.name}</h3>
                    <p className="text-[11px] font-mono text-slate-500 break-all">{supervisor.email}</p>
                  </div>
                </div>

                {supervisor.domainExpertise && supervisor.domainExpertise.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-600 mb-1">Domain Expertise:</div>
                    <div className="flex flex-wrap gap-1">
                      {supervisor.domainExpertise.map((domain, dIdx) => (
                        <span
                          key={dIdx}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200"
                        >
                          {domain}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <a
                    href={`mailto:${supervisor.email}?subject=${encodeURIComponent(`[Capstone Group #${group.number}] Student Inquiry - ${topic.title}`)}`}
                    className="w-full py-2 px-3 bg-[#1985A1] hover:bg-[#146E85] text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Email Supervisor</span>
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No supervisor assigned yet.</p>
            )}
          </div>

          {/* Group Co-Members Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Group Members ({members.length})</h3>
                <p className="text-[11px] text-slate-500">Allotted team for Group #{group.number}</p>
              </div>
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                #{group.number}
              </span>
            </div>

            <div className="space-y-2.5">
              {members.map((member) => (
                <div
                  key={member.id}
                  className={`p-3 rounded-xl border transition ${
                    member.isCurrentUser
                      ? 'bg-[#eef8fa] border-[#1985A1] shadow-xs'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span>{member.name}</span>
                      {member.isCurrentUser && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#1985A1] text-white">
                          You
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] font-bold text-slate-700">{member.roll}</span>
                  </div>

                  <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-slate-500 font-mono">
                    {member.email && (
                      <a href={`mailto:${member.email}`} className="text-[#1985A1] hover:underline truncate">
                        {member.email}
                      </a>
                    )}
                    {member.phone && <span className="text-slate-400">{member.phone}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
