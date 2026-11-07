'use client';

import { useState, useEffect } from 'react';
import { getPrintableRubricsAction } from '@/app/actions/marks';

interface EvaluationRubricsViewProps {
  role?: 'STUDENT' | 'FACULTY' | 'ADMIN';
}

export default function EvaluationRubricsView({ role = 'STUDENT' }: EvaluationRubricsViewProps) {
  const [activeSemester, setActiveSemester] = useState<6 | 7 | 8>(7);

  useEffect(() => {
    // Trigger background DB sync of Rubrics A through F
    getPrintableRubricsAction().catch(() => {});
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 print:space-y-0 print:max-w-none print:pb-0">
      {/* Page Header (Hidden during print) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5 no-print print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Department Evaluation Scheme
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              B.Tech ECE • 6th, 7th &amp; 8th Semesters
            </span>
            {role === 'STUDENT' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                Student Transparency Portal
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            {role === 'STUDENT' ? 'Evaluation Rubrics & Marks Distribution' : 'Official Printable Evaluation Sheets'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {role === 'STUDENT'
              ? 'Comprehensive breakdown of how capstone project marks are distributed between your Faculty Supervisor and Evaluation Panellists / External Examiners.'
              : 'Printable project evaluation sheets for Supervisor, Co-examiner, Panellist, and External Examiner.'}
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          <span>Print Evaluation Sheet</span>
        </button>
      </div>

      {/* Semester Selector Tabs (Hidden during print) */}
      <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-xl no-print print:hidden">
        <button
          type="button"
          onClick={() => setActiveSemester(6)}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold transition text-center ${
            activeSemester === 6
              ? 'bg-white text-blue-800 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div>6th Semester (Project Stage I)</div>
          <div className="text-[10px] font-normal opacity-80 mt-0.5">
            Supervisor: 60 Marks (60%) • Co-examiner: 40 Marks (40%)
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveSemester(7)}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold transition text-center ${
            activeSemester === 7
              ? 'bg-white text-blue-800 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div>7th Semester (Project Stage II - Capstone)</div>
          <div className="text-[10px] font-normal opacity-80 mt-0.5">
            Supervisor: 50 Marks (50%) • Panellists: 50 Marks (50%)
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveSemester(8)}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold transition text-center ${
            activeSemester === 8
              ? 'bg-white text-blue-800 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div>8th Semester (Project Stage III - Final Defence)</div>
          <div className="text-[10px] font-normal opacity-80 mt-0.5">
            Supervisor: 40 Marks (40%) • External Examiner: 60 Marks (60%)
          </div>
        </button>
      </div>

      {/* Marks Distribution Visual Breakdown Card (Hidden during print) */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-blue-900/40 space-y-4 no-print print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
                Evaluation Blueprint • {activeSemester}th Semester
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                Total: 100 Marks
              </span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              How Your Marks Are Distributed
            </h3>
          </div>
          <div className="text-xs text-blue-200">
            {activeSemester === 6 && 'Stage I: Literature Survey & System Formulation'}
            {activeSemester === 7 && 'Stage II: Capstone Hardware/Software Implementation'}
            {activeSemester === 8 && 'Stage III: Final Prototype, Verification & Thesis Defence'}
          </div>
        </div>

        {/* 6th Semester Distribution */}
        {activeSemester === 6 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Supervisor (60m) */}
            <div className="bg-white/10 border border-white/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Form 6-S (Rubric A)</span>
                  <h4 className="text-base font-bold text-white">Supervisor Evaluation</h4>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-500 text-white shadow-sm font-mono">
                  60 Marks (60%)
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                Assessed continuously by your allocated faculty supervisor over the semester based on weekly laboratory progress and engagement:
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Regularity:</span>
                  <span className="font-bold text-white">12 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Task Completion:</span>
                  <span className="font-bold text-white">12 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Literature Survey:</span>
                  <span className="font-bold text-white">12 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Behaviour:</span>
                  <span className="font-bold text-white">12 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between col-span-2">
                  <span className="text-slate-300">Involvement &amp; Effort:</span>
                  <span className="font-bold text-white">12 Marks</span>
                </div>
              </div>
            </div>

            {/* Co-examiner (40m) */}
            <div className="bg-white/10 border border-white/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Form 6-C (Rubric B)</span>
                  <h4 className="text-base font-bold text-white">Co-examiner Evaluation</h4>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500 text-slate-950 shadow-sm font-mono">
                  40 Marks (40%)
                </span>
              </div>
              <p className="text-[11px] text-emerald-200">
                Assessed by the departmental co-examiner / evaluator during the mid-to-end semester project review:
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Presentation:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Knowledge of Work:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Literature Survey:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Viva Voce:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7th Semester Distribution */}
        {activeSemester === 7 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Supervisor (50m) */}
            <div className="bg-white/10 border border-white/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Form 7-S (Rubric C)</span>
                  <h4 className="text-base font-bold text-white">Supervisor Continuous Assessment</h4>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-500 text-white shadow-sm font-mono">
                  50 Marks (50%)
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                Assessed continuously by your supervisor across the 7th semester for consistency, work progress, and leadership:
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Regularity:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Task Completion:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Leadership:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Behaviour:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between col-span-2">
                  <span className="text-slate-300">Involvement:</span>
                  <span className="font-bold text-white">10 Marks</span>
                </div>
              </div>
            </div>

            {/* Panellists (50m) */}
            <div className="bg-white/10 border border-white/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Form 7-P (Rubric D)</span>
                  <h4 className="text-base font-bold text-white">Evaluation Panellists</h4>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500 text-slate-950 shadow-sm font-mono">
                  50 Marks (50%)
                </span>
              </div>
              <p className="text-[11px] text-emerald-200">
                Assessed by your assigned 7th Sem Panel members divided into Group Work and Individual Defense:
              </p>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="bg-black/25 p-2 rounded-lg space-y-1">
                  <div className="flex justify-between font-bold text-emerald-300">
                    <span>Project Sub-total (Group Level):</span>
                    <span>20 Marks</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300 pt-1 border-t border-white/10">
                    <div>• Novelty: <span className="font-bold text-white">7m</span></div>
                    <div>• Realistic Problem: <span className="font-bold text-white">7m</span></div>
                    <div>• Societal Impact: <span className="font-bold text-white">3m</span></div>
                    <div>• Publication Scope: <span className="font-bold text-white">3m</span></div>
                  </div>
                </div>

                <div className="bg-black/25 p-2 rounded-lg space-y-1">
                  <div className="flex justify-between font-bold text-cyan-300">
                    <span>Individual Sub-total (Student Level):</span>
                    <span>30 Marks</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300 pt-1 border-t border-white/10">
                    <div>• Presentation: <span className="font-bold text-white">15m</span></div>
                    <div>• Viva Voce: <span className="font-bold text-white">15m</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 8th Semester Distribution */}
        {activeSemester === 8 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Supervisor (40m) */}
            <div className="bg-white/10 border border-white/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Form 8-S (Rubric E)</span>
                  <h4 className="text-base font-bold text-white">Supervisor Evaluation</h4>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-500 text-white shadow-sm font-mono">
                  40 Marks (40%)
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                Assessed continuously by your supervisor during final thesis compilation, prototype validation, and verification:
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Regularity:</span>
                  <span className="font-bold text-white">8 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Task Completion:</span>
                  <span className="font-bold text-white">8 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Leadership:</span>
                  <span className="font-bold text-white">8 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between">
                  <span className="text-slate-300">Behaviour:</span>
                  <span className="font-bold text-white">8 Marks</span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg flex justify-between col-span-2">
                  <span className="text-slate-300">Involvement:</span>
                  <span className="font-bold text-white">8 Marks</span>
                </div>
              </div>
            </div>

            {/* External Examiner (60m) */}
            <div className="bg-white/10 border border-white/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Form 8-E (Rubric F)</span>
                  <h4 className="text-base font-bold text-white">External &amp; Board Examiner</h4>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500 text-slate-950 shadow-sm font-mono">
                  60 Marks (60%)
                </span>
              </div>
              <p className="text-[11px] text-emerald-200">
                Assessed during final university defence by the External Examiner and examination board:
              </p>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="bg-black/25 p-2 rounded-lg space-y-1">
                  <div className="flex justify-between font-bold text-emerald-300">
                    <span>Project Sub-total (Group Level):</span>
                    <span>24 Marks</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300 pt-1 border-t border-white/10">
                    <div>• Novelty: <span className="font-bold text-white">8m</span></div>
                    <div>• Realistic Problem: <span className="font-bold text-white">8m</span></div>
                    <div>• Societal Impact: <span className="font-bold text-white">3m</span></div>
                    <div>• Publication: <span className="font-bold text-white">5m</span></div>
                  </div>
                </div>

                <div className="bg-black/25 p-2 rounded-lg space-y-1">
                  <div className="flex justify-between font-bold text-cyan-300">
                    <span>Individual Sub-total (Student Level):</span>
                    <span>36 Marks</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300 pt-1 border-t border-white/10">
                    <div>• Presentation: <span className="font-bold text-white">18m</span></div>
                    <div>• Viva Voce: <span className="font-bold text-white">18m</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Printable Sheet Document */}
      <div className="bg-white border border-slate-300 rounded-sm p-10 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-0 print:space-y-4">
        {/* Top-right running header with thin rule */}
        <div className="text-right text-[11px] italic text-slate-500 border-b border-slate-300 pb-1">
          Dept. of ECE, Heritage Institute of Technology, Kolkata | Proposed Project Evaluation Scheme
        </div>

        {/* Centered Title & Subtitle */}
        <div className="text-center space-y-1.5 pt-1 print:pt-0">
          <h2 className="text-lg font-bold text-[#1F3864]">
            Evaluation Sheets for {activeSemester}th Semester
          </h2>
          <p className="text-xs text-slate-900">
            One sheet is to be filled in per project group by each evaluator. Maximum marks are shown in brackets.
          </p>
        </div>

        {activeSemester === 6 && (
          <>
            {/* Form 6-S: 6th Semester – Supervisor's Evaluation Sheet (Rubric A) */}
            <div className="space-y-2.5 pt-2 print:pt-1 break-inside-avoid">
              <h3 className="text-sm font-bold text-[#1F4E79]">
                Form 6-S: 6th Semester – Supervisor’s Evaluation Sheet (Rubric A)
              </h3>

              <div className="text-xs font-bold text-slate-900 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  Group No.: <span className="inline-block w-20 border-b border-slate-900"></span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  Project Title: <span className="inline-block w-[78%] border-b border-slate-900"></span>
                </div>
                <div>
                  Supervisor: <span className="inline-block w-40 border-b border-slate-900"></span>
                </div>
                <div>
                  Date: <span className="inline-block w-24 border-b border-slate-900"></span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-900 text-xs">
                  <thead>
                    <tr className="bg-[#1F3864] text-white font-bold text-center">
                      <th className="border border-slate-900 px-2 py-2 w-[11%]">Roll No.</th>
                      <th className="border border-slate-900 px-2 py-2 w-[21%]">Name of Student</th>
                      <th className="border border-slate-900 px-2 py-2 w-[11.5%]">Regularity (12)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[12.5%]">
                        Task Completion (12)
                      </th>
                      <th className="border border-slate-900 px-2 py-2 w-[12.5%]">
                        Literature Survey (12)
                      </th>
                      <th className="border border-slate-900 px-2 py-2 w-[10.5%]">Behaviour (12)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[11%]">Involvement (12)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[10%]">Total (60)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((rowNum) => (
                      <tr key={rowNum} className="h-9">
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-xs font-bold text-slate-900">
                Name &amp; Signature of Supervisor:{' '}
                <span className="inline-block w-64 border-b border-slate-900 ml-1"></span>
              </div>
            </div>

            {/* Form 6-C: 6th Semester – Co-examiner's Evaluation Sheet (Rubric B) */}
            <div className="space-y-2.5 pt-6 print:pt-3 break-inside-avoid">
              <h3 className="text-sm font-bold text-[#1F4E79]">
                Form 6-C: 6th Semester – Co-examiner’s Evaluation Sheet (Rubric B)
              </h3>

              <div className="text-xs font-bold text-slate-900 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  Group No.: <span className="inline-block w-20 border-b border-slate-900"></span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  Project Title: <span className="inline-block w-[78%] border-b border-slate-900"></span>
                </div>
                <div>
                  Supervisor: <span className="inline-block w-40 border-b border-slate-900"></span>
                </div>
                <div>
                  Date: <span className="inline-block w-24 border-b border-slate-900"></span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-900 text-xs">
                  <thead>
                    <tr className="bg-[#1F3864] text-white font-bold text-center">
                      <th className="border border-slate-900 px-2 py-2 w-[12%]">Roll No.</th>
                      <th className="border border-slate-900 px-2 py-2 w-[23%]">Name of Student</th>
                      <th className="border border-slate-900 px-2 py-2 w-[13.5%]">Presentation (10)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[15.5%]">
                        Knowledge of Work (10)
                      </th>
                      <th className="border border-slate-900 px-2 py-2 w-[14.5%]">
                        Literature Survey (10)
                      </th>
                      <th className="border border-slate-900 px-2 py-2 w-[11.5%]">Viva Voce (10)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[10%]">Total (40)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((rowNum) => (
                      <tr key={rowNum} className="h-9">
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-xs font-bold text-slate-900">
                Name &amp; Signature of Co-examiner:{' '}
                <span className="inline-block w-64 border-b border-slate-900 ml-1"></span>
              </div>
            </div>
          </>
        )}

        {activeSemester === 7 && (
          <>
            {/* Form 7-S: 7th Semester – Supervisor's Evaluation Sheet (Rubric C) */}
            <div className="space-y-2.5 pt-2 print:pt-1 break-inside-avoid">
              <h3 className="text-sm font-bold text-[#1F4E79]">
                Form 7-S: 7th Semester – Supervisor’s Evaluation Sheet (Rubric C)
              </h3>

              <div className="text-xs font-bold text-slate-900 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  Group No.: <span className="inline-block w-20 border-b border-slate-900"></span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  Project Title: <span className="inline-block w-[78%] border-b border-slate-900"></span>
                </div>
                <div>
                  Supervisor: <span className="inline-block w-40 border-b border-slate-900"></span>
                </div>
                <div>
                  Date: <span className="inline-block w-24 border-b border-slate-900"></span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-900 text-xs">
                  <thead>
                    <tr className="bg-[#1F3864] text-white font-bold text-center">
                      <th className="border border-slate-900 px-2 py-2 w-[11%]">Roll No.</th>
                      <th className="border border-slate-900 px-2 py-2 w-[21%]">Name of Student</th>
                      <th className="border border-slate-900 px-2 py-2 w-[11.5%]">Regularity (10)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[13%]">
                        Task Completion (10)
                      </th>
                      <th className="border border-slate-900 px-2 py-2 w-[12%]">Leadership (10)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[10.5%]">Behaviour (10)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[11%]">Involvement (10)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[10%]">Total (50)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((rowNum) => (
                      <tr key={rowNum} className="h-9">
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-xs font-bold text-slate-900">
                Name &amp; Signature of Supervisor:{' '}
                <span className="inline-block w-64 border-b border-slate-900 ml-1"></span>
              </div>
            </div>

            {/* Form 7-P: 7th Semester – Panellist's Evaluation Sheet (Rubric D) */}
            <div className="space-y-2.5 pt-6 print:pt-3 break-inside-avoid">
              <h3 className="text-sm font-bold text-[#1F4E79]">
                Form 7-P: 7th Semester – Panellist’s Evaluation Sheet (Rubric D) | Panel No.:{' '}
                <span className="inline-block w-16 border-b border-[#1F4E79]"></span>
              </h3>

              <div className="text-xs font-bold text-slate-900 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  Group No.: <span className="inline-block w-20 border-b border-slate-900"></span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  Project Title: <span className="inline-block w-[78%] border-b border-slate-900"></span>
                </div>
                <div>
                  Supervisor: <span className="inline-block w-40 border-b border-slate-900"></span>
                </div>
                <div>
                  Date: <span className="inline-block w-24 border-b border-slate-900"></span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-900 text-[11px]">
                  <thead>
                    <tr className="bg-[#1F3864] text-white font-bold text-center">
                      <th className="border border-slate-900 px-1.5 py-2 w-[9%]">Roll No.</th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[17%]">Name of Student</th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">Novelty (7)</th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[9%]">
                        Realistic Problem (7)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">
                        Societal Impact (3)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[8%]">
                        Publication (3)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[9.5%]">
                        Project Sub-total (20)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[8.5%]">
                        Presentation (15)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">
                        Viva Voce (15)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[9%]">
                        Individual Sub-total (30)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">Total (50)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((rowNum) => (
                      <tr key={rowNum} className="h-9">
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-xs font-bold text-slate-900">
                Name &amp; Signature of Panellist:{' '}
                <span className="inline-block w-64 border-b border-slate-900 ml-1"></span>
              </div>
            </div>
          </>
        )}

        {activeSemester === 8 && (
          <>
            {/* Form 8-S: 8th Semester – Supervisor's Evaluation Sheet (Rubric E) */}
            <div className="space-y-2.5 pt-2 print:pt-1 break-inside-avoid">
              <h3 className="text-sm font-bold text-[#1F4E79]">
                Form 8-S: 8th Semester – Supervisor’s Evaluation Sheet (Rubric E)
              </h3>

              <div className="text-xs font-bold text-slate-900 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  Group No.: <span className="inline-block w-20 border-b border-slate-900"></span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  Project Title: <span className="inline-block w-[78%] border-b border-slate-900"></span>
                </div>
                <div>
                  Supervisor: <span className="inline-block w-40 border-b border-slate-900"></span>
                </div>
                <div>
                  Date: <span className="inline-block w-24 border-b border-slate-900"></span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-900 text-xs">
                  <thead>
                    <tr className="bg-[#1F3864] text-white font-bold text-center">
                      <th className="border border-slate-900 px-2 py-2 w-[11%]">Roll No.</th>
                      <th className="border border-slate-900 px-2 py-2 w-[21%]">Name of Student</th>
                      <th className="border border-slate-900 px-2 py-2 w-[11.5%]">Regularity (8)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[13%]">
                        Task Completion (8)
                      </th>
                      <th className="border border-slate-900 px-2 py-2 w-[12%]">Leadership (8)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[10.5%]">Behaviour (8)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[11%]">Involvement (8)</th>
                      <th className="border border-slate-900 px-2 py-2 w-[10%]">Total (40)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((rowNum) => (
                      <tr key={rowNum} className="h-9">
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-xs font-bold text-slate-900">
                Name &amp; Signature of Supervisor:{' '}
                <span className="inline-block w-64 border-b border-slate-900 ml-1"></span>
              </div>
            </div>

            {/* Form 8-E: 8th Semester – External Examiner's Evaluation Sheet (Rubric F) */}
            <div className="space-y-2.5 pt-6 print:pt-3 break-inside-avoid">
              <h3 className="text-sm font-bold text-[#1F4E79]">
                Form 8-E: 8th Semester – External Examiner’s Evaluation Sheet (Rubric F)
              </h3>

              <div className="text-xs font-bold text-slate-900 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  Group No.: <span className="inline-block w-20 border-b border-slate-900"></span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  Project Title: <span className="inline-block w-[78%] border-b border-slate-900"></span>
                </div>
                <div>
                  Supervisor: <span className="inline-block w-40 border-b border-slate-900"></span>
                </div>
                <div>
                  Date: <span className="inline-block w-24 border-b border-slate-900"></span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-900 text-[11px]">
                  <thead>
                    <tr className="bg-[#1F3864] text-white font-bold text-center">
                      <th className="border border-slate-900 px-1.5 py-2 w-[9%]">Roll No.</th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[17%]">Name of Student</th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">Novelty (8)</th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[9%]">
                        Realistic Problem (8)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">
                        Societal Impact (3)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[8%]">
                        Publication (5)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[9.5%]">
                        Project Sub-total (24)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[8.5%]">
                        Presentation (18)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">
                        Viva Voce (18)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[9%]">
                        Individual Sub-total (36)
                      </th>
                      <th className="border border-slate-900 px-1.5 py-2 w-[7.5%]">Total (60)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((rowNum) => (
                      <tr key={rowNum} className="h-9">
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                        <td className="border border-slate-900 px-1.5 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-xs font-bold text-slate-900">
                Name &amp; Signature of External Examiner:{' '}
                <span className="inline-block w-64 border-b border-slate-900 ml-1"></span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
