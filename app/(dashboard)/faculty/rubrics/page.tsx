'use client';

import { useState, useEffect } from 'react';
import { getPrintableRubricsAction } from '@/app/actions/marks';

interface PrintableCriterion {
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

interface PrintableRubric {
  code: string;
  semester: number;
  title: string;
  maxMarks: number;
  criteria: PrintableCriterion[];
}

export default function PrintableRubricsPage() {
  const [rubrics, setRubrics] = useState<PrintableRubric[]>([]);
  const [activeCode, setActiveCode] = useState<string>('A');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await getPrintableRubricsAction();
      if (!res.error && res.rubrics) {
        setRubrics(res.rubrics as unknown as PrintableRubric[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const currentRubric = rubrics.find((r) => r.code === activeCode) || rubrics[0];

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Page Header (Hidden during print) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Department Evaluation Scheme
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              NBA Accreditation Legend
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Official Capstone Rubrics & Examiner Score Sheets
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Printable continuous and end-semester evaluation schemes (Rubrics A through F) with PO, WP, and WK alignments.
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Score Sheet
        </button>
      </div>

      {/* Rubric Tab Selector (Hidden during print) */}
      <div className="grid grid-cols-6 gap-2 bg-slate-100 p-1.5 rounded-xl no-print">
        {rubrics.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => setActiveCode(r.code)}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition text-center ${
              activeCode === r.code
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div>Rubric {r.code}</div>
            <div className="text-[10px] font-normal opacity-75">Sem {r.semester} ({r.maxMarks}m)</div>
          </button>
        ))}
      </div>

      {/* Printable Sheet Card */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading rubric template...</div>
      ) : currentRubric ? (
        <div className="bg-white border border-slate-300 rounded-xl p-8 shadow-sm space-y-6 print:border-none print:shadow-none print:p-0">
          {/* Institutional Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4">
            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-tight">
              Heritage Institute of Technology, Kolkata (HITK)
            </h2>
            <h3 className="text-sm font-semibold text-blue-800">
              Department of Electronics and Communication Engineering
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              B.Tech Project Evaluation Scheme — Semester {currentRubric.semester} ({currentRubric.title})
            </p>
          </div>

          {/* Form Context Info */}
          <div className="grid grid-cols-2 gap-4 text-xs border border-slate-200 p-4 rounded-lg bg-slate-50/50 print:bg-white">
            <div>
              <span className="font-semibold text-slate-600">Form Reference:</span>{' '}
              <span className="font-bold text-slate-900">
                Form {currentRubric.code === 'D' ? '7-P (Internal Panel)' : currentRubric.code === 'F' ? '8-E (External Defense)' : `${currentRubric.semester}-S`}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">Maximum Marks:</span>{' '}
              <span className="font-bold text-blue-700">{currentRubric.maxMarks} Marks</span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">Group Number:</span>{' '}
              <span className="font-mono text-slate-400">________________________</span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">Topic Code & Title:</span>{' '}
              <span className="font-mono text-slate-400">________________________</span>
            </div>
          </div>

          {/* Criteria Evaluation Table */}
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-[11px] uppercase font-bold text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3">Performance Evaluation Criterion</th>
                  <th className="px-4 py-3">NBA PO & WK Mappings</th>
                  <th className="px-4 py-3 text-center w-24">Scope</th>
                  <th className="px-4 py-3 text-center w-24">Max Marks</th>
                  <th className="px-4 py-3 text-center w-28">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {currentRubric.criteria.map((crit, idx) => (
                  <tr key={crit.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-center font-bold text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{crit.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {crit.maps.map((m, mi) => (
                          <span
                            key={mi}
                            className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-bold text-slate-700"
                          >
                            {m.code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-600 text-[10px]">
                      {crit.scope}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-blue-700 text-sm">
                      {crit.maxMarks}
                    </td>
                    <td className="px-4 py-3 text-center border-l border-slate-200">
                      <div className="h-6 w-16 mx-auto border-b border-slate-400"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right uppercase text-slate-700">
                    Total Rubric Score:
                  </td>
                  <td className="px-4 py-3 text-center text-blue-800 text-sm">
                    {currentRubric.maxMarks}
                  </td>
                  <td className="px-4 py-3 text-center border-l border-slate-200">
                    <div className="h-6 w-16 mx-auto border-b-2 border-slate-800"></div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Sign-off Blocks */}
          <div className="grid grid-cols-2 gap-12 pt-8 text-xs">
            <div className="text-center space-y-2">
              <div className="h-10 border-b border-slate-400"></div>
              <p className="font-bold text-slate-800">Evaluator / Examiner Signature</p>
              <p className="text-[11px] text-slate-500">Name & Designation</p>
            </div>
            <div className="text-center space-y-2">
              <div className="h-10 border-b border-slate-400"></div>
              <p className="font-bold text-slate-800">Project Coordinator Signature</p>
              <p className="text-[11px] text-slate-500">Department of ECE, HITK</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
