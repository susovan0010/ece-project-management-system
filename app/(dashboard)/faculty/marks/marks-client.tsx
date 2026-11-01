'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getMyFacultyGroupsAction } from '@/app/actions/faculty-groups';
import { getGroupMarksAction, saveMarksEntryAction, getRubricDefinitionAction } from '@/app/actions/marks';

interface StudentItem {
  id: string;
  name: string;
  roll: string;
}

interface CriterionItem {
  id: number;
  key: string;
  label: string;
  maxMarks: number;
  scope: 'GROUP' | 'STUDENT';
  maps: Array<{
    kind: string;
    code: string;
  }>;
}

interface ExistingMarkItem {
  criterionId: number;
  studentId: string | null;
  examinerSlot: number;
  marks: number;
  status: 'DRAFT' | 'SUBMITTED';
}

export default function MarksClient() {
  const searchParams = useSearchParams();
  const queryGroupId = searchParams.get('group');

  // Group selection state
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(queryGroupId || '');
  const [rubricCode, setRubricCode] = useState<string>('A');

  // Marks data state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [currentGroup, setCurrentGroup] = useState<any | null>(null);
  const [rubric, setRubric] = useState<any | null>(null);
  const [criteria, setCriteria] = useState<CriterionItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);

  // Panel Examiner Slot for Rubric D (Slot 1, 2, or 3)
  const [activeSlot, setActiveSlot] = useState<number>(1);

  // Input state: key is `${criterionId}_${studentId || 'GROUP'}_${examinerSlot}` -> number
  const [markInputs, setMarkInputs] = useState<Record<string, number>>({});

  // Helper: load rubric definition for preview when no group is selected
  async function loadRubricPreview(code: string) {
    setLoading(true);
    setError(null);
    setCurrentGroup(null);
    setStudents([]);
    setIsLocked(false);
    setDeadline(null);

    const res = await getRubricDefinitionAction(code);
    if (res.error) {
      setError(res.error);
    } else if (res.rubric) {
      setRubric(res.rubric);
      setCriteria((res.rubric.criteria || []) as CriterionItem[]);
    }
    setLoading(false);
  }

  // Load faculty groups on mount
  useEffect(() => {
    async function loadInitial() {
      const res = await getMyFacultyGroupsAction();
      if (!res.error && res.groups) {
        setGroups(res.groups);
        if (!selectedGroupId && res.groups.length > 0) {
          setSelectedGroupId(res.groups[0].id);
        } else if (res.groups.length === 0) {
          loadRubricPreview(rubricCode);
        }
      } else {
        loadRubricPreview(rubricCode);
      }
    }
    loadInitial();
  }, []);

  // Load marks whenever selectedGroupId or rubricCode changes
  useEffect(() => {
    if (!selectedGroupId) {
      loadRubricPreview(rubricCode);
      return;
    }

    async function loadMarks() {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);

      const res = await getGroupMarksAction(selectedGroupId, rubricCode);
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      setCurrentGroup(res.group);
      setRubric(res.rubric);
      setCriteria((res.rubric?.criteria || []) as CriterionItem[]);
      setStudents(res.students || []);
      setIsLocked(res.isLocked || false);
      setDeadline(res.deadline ? new Date(res.deadline) : null);

      // Populate existing marks into inputs map
      const inputMap: Record<string, number> = {};
      (res.existingMarks || []).forEach((m: ExistingMarkItem) => {
        const key = `${m.criterionId}_${m.studentId || 'GROUP'}_${m.examinerSlot}`;
        inputMap[key] = m.marks;
      });
      setMarkInputs(inputMap);

      setLoading(false);
    }

    loadMarks();
  }, [selectedGroupId, rubricCode]);

  // Handle Mark Change
  function handleMarkChange(
    criterionId: number,
    studentId: string | null,
    slot: number,
    valStr: string,
    maxMarks: number
  ) {
    const key = `${criterionId}_${studentId || 'GROUP'}_${slot}`;
    const num = parseFloat(valStr);

    if (valStr === '') {
      const copy = { ...markInputs };
      delete copy[key];
      setMarkInputs(copy);
      return;
    }

    if (isNaN(num)) return;

    // Enforce instant max bounds
    const bounded = Math.min(Math.max(0, num), maxMarks);
    setMarkInputs({
      ...markInputs,
      [key]: bounded,
    });
  }

  // Calculate live total score for a student (or average for Rubric D)
  function getStudentTotalMarks(studentId: string): number {
    let sum = 0;
    for (const c of criteria) {
      if (c.scope === 'GROUP') {
        if (rubricCode === 'D') {
          // Average across slots 1..3
          const s1 = markInputs[`${c.id}_GROUP_1`] || 0;
          const s2 = markInputs[`${c.id}_GROUP_2`] || 0;
          const s3 = markInputs[`${c.id}_GROUP_3`] || 0;
          const slotCount = [s1, s2, s3].filter((s) => s > 0).length || 1;
          sum += (s1 + s2 + s3) / slotCount;
        } else {
          sum += markInputs[`${c.id}_GROUP_1`] || 0;
        }
      } else {
        if (rubricCode === 'D') {
          const s1 = markInputs[`${c.id}_${studentId}_1`] || 0;
          const s2 = markInputs[`${c.id}_${studentId}_2`] || 0;
          const s3 = markInputs[`${c.id}_${studentId}_3`] || 0;
          const slotCount = [s1, s2, s3].filter((s) => s > 0).length || 1;
          sum += (s1 + s2 + s3) / slotCount;
        } else {
          sum += markInputs[`${c.id}_${studentId}_1`] || 0;
        }
      }
    }
    return Number(sum.toFixed(2));
  }

  // Save / Submit marks
  async function handleSave(status: 'DRAFT' | 'SUBMITTED') {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    // Transform markInputs into server payload
    const entriesPayload: Array<{
      criterionId: number;
      studentId?: string | null;
      examinerSlot: number;
      marks: number;
    }> = [];

    for (const [key, marks] of Object.entries(markInputs)) {
      const [critIdStr, stIdStr, slotStr] = key.split('_');
      entriesPayload.push({
        criterionId: Number(critIdStr),
        studentId: stIdStr === 'GROUP' ? null : stIdStr,
        examinerSlot: Number(slotStr),
        marks,
      });
    }

    const res = await saveMarksEntryAction({
      groupId: selectedGroupId,
      rubricCode,
      status,
      entries: entriesPayload,
    });

    setSaving(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        status === 'SUBMITTED'
          ? `Rubric ${rubricCode} marks submitted successfully!`
          : `Marks saved as draft.`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Evaluation Scoring Grid
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Decision 1: Supervisor Entry & Examiner Audit
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Rubric Marks Entry & Verification
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter continuous and panel examination marks (Rubrics A–F). System enforces criteria maximum bounds and audits your supervisor signature.
          </p>
        </div>

        <Link
          href="/faculty/rubrics"
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3.5 py-2 border border-blue-200 rounded-lg bg-blue-50/50 shadow-sm transition"
        >
          View Printable Rubrics →
        </Link>
      </div>

      {/* Selectors Bar: Group & Rubric */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Group Picker */}
          <div className="md:col-span-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Select Project Group:
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 font-semibold"
            >
              {groups.length === 0 ? (
                <option value="">No allotted project groups yet</option>
              ) : (
                <>
                  <option value="">-- Choose a Project Group --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      Group {g.number} ({g.batchId}) - {g.topic.code}: {g.topic.title.slice(0, 45)}...
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Rubric Tabs Picker (A through F) */}
          <div className="md:col-span-7">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Evaluation Rubric:
            </label>
            <div className="grid grid-cols-6 gap-1 bg-slate-100 p-1 rounded-xl">
              {[
                { code: 'A', sem: 6, max: 60, title: 'Sem 6 Sup' },
                { code: 'B', sem: 6, max: 40, title: 'Sem 6 Pan' },
                { code: 'C', sem: 7, max: 50, title: 'Sem 7 Sup' },
                { code: 'D', sem: 7, max: 50, title: 'Sem 7 Pan' },
                { code: 'E', sem: 8, max: 40, title: 'Sem 8 Sup' },
                { code: 'F', sem: 8, max: 60, title: 'Sem 8 Ext' },
              ].map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setRubricCode(r.code)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition text-center ${
                    rubricCode === r.code
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div>Rubric {r.code}</div>
                  <div className="text-[10px] font-normal opacity-75">Max {r.max}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Group Context Pill */}
        {currentGroup && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {currentGroup.topic.code}
              </span>
              <span className="font-bold text-slate-900">{currentGroup.topic.title}</span>
            </div>
            <div className="text-slate-500">
              Supervisor: <span className="font-semibold text-slate-800">{currentGroup.supervisor.name}</span>
            </div>
          </div>
        )}

        {/* Empty Groups Notice */}
        {groups.length === 0 && (
          <div className="pt-3 border-t border-slate-100 flex items-start gap-3 bg-blue-50/70 p-3.5 rounded-xl border border-blue-200 text-xs text-blue-900">
            <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1">
              <p className="font-bold text-blue-950">
                No Student Project Groups Allotted Yet
              </p>
              <p className="text-blue-800 leading-relaxed">
                Marks entry is group-specific. Once the Project Committee Admin allocates student groups to your confirmed topics (under <em>Student Allocation</em>), your groups and enrolled students will appear here for entering marks.
              </p>
              <p className="text-blue-700 font-medium">
                In the meantime, the evaluation criteria, maximum marks, and PO/WK alignments for Rubrics A through F are displayed below in preview mode.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Lock Banner */}
      {isLocked && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">🔒 Marking Window Locked:</span>
            <span>
              {deadline ? `Deadline was ${deadline.toLocaleDateString()}` : 'Locked by Project Committee Admin.'}{' '}
              Marks are in read-only mode.
            </span>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>{successMsg}</div>
        </div>
      )}

      {/* Examiner Slot Switcher for Rubric D (Internal Project Panel) */}
      {rubricCode === 'D' && (
        <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h4 className="font-bold text-xs text-indigo-950 uppercase tracking-wider">
              Rubric D Panel Evaluation (Average Across Examiners)
            </h4>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              Enter individual examiner scores from Form 7-P. The engine automatically averages marks across slots.
            </p>
          </div>
          <div className="flex gap-1.5 bg-white p-1 rounded-lg border border-indigo-200 self-start sm:self-auto">
            {[1, 2, 3].map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setActiveSlot(slot)}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  activeSlot === slot
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-indigo-900 hover:bg-indigo-50'
                }`}
              >
                Examiner {slot}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Marks Scoring Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading scoring criteria...</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-4">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm">
                  {rubric?.title} (Max: {rubric?.maxMarks} Marks)
                </h3>
                {!selectedGroupId && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    Preview Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {!selectedGroupId
                  ? 'Evaluation criteria & mark weights for this rubric. Select an allotted group above to enter and save marks.'
                  : rubricCode === 'D'
                  ? `Entering scores for Examiner Slot ${activeSlot}. Final score will average all slots.`
                  : 'Enter marks per criterion. Group criteria apply to all members.'}
              </p>
            </div>

            {/* Total Indicator */}
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Rubric Cap</span>
              <span className="font-bold text-base text-blue-700">{rubric?.maxMarks} pts</span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Criteria List */}
            {criteria.map((crit) => {
              const isGroupScope = crit.scope === 'GROUP';
              const groupKey = `${crit.id}_GROUP_${rubricCode === 'D' ? activeSlot : 1}`;
              const currentGroupMark = markInputs[groupKey] ?? '';

              return (
                <div
                  key={crit.id}
                  className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3"
                >
                  {/* Criterion Header */}
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isGroupScope ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {isGroupScope ? 'GROUP SCOPE' : 'STUDENT SCOPE'}
                        </span>
                        <h4 className="font-bold text-xs text-slate-900">{crit.label}</h4>
                      </div>

                      {/* PO / WK Mappings Badge */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {crit.maps.map((m, mi) => (
                          <span
                            key={mi}
                            className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-white text-slate-600 rounded border border-slate-200"
                          >
                            {m.code}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs font-bold text-slate-700">
                      Max: <span className="text-blue-700">{crit.maxMarks}</span> marks
                    </div>
                  </div>

                  {/* Input Rendering */}
                  {!selectedGroupId ? (
                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-500 italic flex items-center justify-between">
                      <span>{isGroupScope ? 'Group Scope (Applies to all members of the group)' : 'Student Scope (Individual student evaluation)'}</span>
                      <span className="font-semibold text-slate-600">Max Marks: {crit.maxMarks}</span>
                    </div>
                  ) : isGroupScope ? (
                    // Single input for entire group
                    <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-xs font-semibold text-slate-700 flex-1">
                        Group Score (Applies to all members):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={crit.maxMarks}
                          disabled={isLocked}
                          value={currentGroupMark}
                          onChange={(e) =>
                            handleMarkChange(
                              crit.id,
                              null,
                              rubricCode === 'D' ? activeSlot : 1,
                              e.target.value,
                              crit.maxMarks
                            )
                          }
                          placeholder={`0 - ${crit.maxMarks}`}
                          className="w-24 px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                        />
                        <span className="text-xs text-slate-400">/ {crit.maxMarks}</span>
                      </div>
                    </div>
                  ) : (
                    // Individual input per student
                    <div className="space-y-2">
                      {students.map((s) => {
                        const studentKey = `${crit.id}_${s.id}_${rubricCode === 'D' ? activeSlot : 1}`;
                        const currentMark = markInputs[studentKey] ?? '';

                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-blue-700">{s.roll}</span>
                              <span className="font-semibold text-slate-900">{s.name}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max={crit.maxMarks}
                                disabled={isLocked}
                                value={currentMark}
                                onChange={(e) =>
                                  handleMarkChange(
                                    crit.id,
                                    s.id,
                                    rubricCode === 'D' ? activeSlot : 1,
                                    e.target.value,
                                    crit.maxMarks
                                  )
                                }
                                placeholder={`0 - ${crit.maxMarks}`}
                                className="w-24 px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                              />
                              <span className="text-xs text-slate-400">/ {crit.maxMarks}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Total Summary Table per Student */}
            {selectedGroupId && students.length > 0 && (
              <div className="pt-4 border-t border-slate-200">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600 mb-2">
                  Computed Total Scores per Student ({rubric?.maxMarks} Max)
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2">Roll</th>
                        <th className="px-4 py-2">Student Name</th>
                        <th className="px-4 py-2 text-right">Computed Total</th>
                        <th className="px-4 py-2 text-right">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s) => {
                        const total = getStudentTotalMarks(s.id);
                        const pct = Math.round((total / (rubric?.maxMarks || 1)) * 100);

                        return (
                          <tr key={s.id} className="hover:bg-slate-50 font-semibold">
                            <td className="px-4 py-2 font-mono text-blue-700">{s.roll}</td>
                            <td className="px-4 py-2 text-slate-900">{s.name}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm font-bold text-slate-900">
                              {total} / {rubric?.maxMarks}
                            </td>
                            <td className="px-4 py-2 text-right font-mono">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  pct >= 65 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action Bar */}
            {!selectedGroupId ? (
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                <span>Select an allotted project group above to begin entering marks.</span>
                <Link
                  href="/faculty/rubrics"
                  className="font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                >
                  View &amp; Print Evaluation Sheets →
                </Link>
              </div>
            ) : !isLocked && (
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => handleSave('DRAFT')}
                  disabled={saving}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Draft Marks'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSave('SUBMITTED')}
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {saving ? 'Submitting...' : 'Submit Final Marks'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
