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
  const [activeSemester, setActiveSemester] = useState<6 | 7 | 8>(6);
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

  function handlePrint() {
    window.print();
  }

  const semRubrics = rubrics.filter((r) => r.semester === activeSemester);

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
              Annexure I – Evaluation Sheets
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Official Printable Evaluation Sheets
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Printable project evaluation sheets for Supervisor, Co-examiner, Panel, and External Examiner.
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
          Print Evaluation Sheet
        </button>
      </div>

      {/* Semester Selector Tabs (Hidden during print) */}
      <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-xl no-print">
        <button
          type="button"
          onClick={() => setActiveSemester(6)}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold transition text-center ${
            activeSemester === 6
              ? 'bg-white text-blue-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div>6th Semester (Stage I)</div>
          <div className="text-[10px] font-normal opacity-80">
            Form 6-S (Rubric A: 60m) &amp; Form 6-C (Rubric B: 40m)
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveSemester(7)}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold transition text-center ${
            activeSemester === 7
              ? 'bg-white text-blue-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div>7th Semester (Stage I)</div>
          <div className="text-[10px] font-normal opacity-80">
            Form 7-S (Rubric C: 50m) &amp; Form 7-P (Rubric D: 50m)
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveSemester(8)}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold transition text-center ${
            activeSemester === 8
              ? 'bg-white text-blue-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div>8th Semester (Stage II)</div>
          <div className="text-[10px] font-normal opacity-80">
            Form 8-S (Rubric E: 40m) &amp; Form 8-E (Rubric F: 60m)
          </div>
        </button>
      </div>

      {/* Printable Sheet Document */}
      {activeSemester === 6 ? (
        /* ==================================================================
           EXACT 6TH SEMESTER EVALUATION SHEET (Annexure I – Form 6-S & 6-C)
           ================================================================== */
        <div className="bg-white border border-slate-300 rounded-sm p-10 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-2">
          {/* Top-right running header with thin rule */}
          <div className="text-right text-[11px] italic text-slate-500 border-b border-slate-300 pb-1">
            Dept. of ECE, Heritage Institute of Technology, Kolkata | Proposed Project Evaluation Scheme
          </div>

          {/* Centered Title & Subtitle */}
          <div className="text-center space-y-1.5 pt-1">
            <h2 className="text-lg font-bold text-[#1F3864]">
              Annexure I – Evaluation Sheets
            </h2>
            <p className="text-xs text-slate-900">
              One sheet is to be filled in per project group by each evaluator. Maximum marks are shown in brackets.
            </p>
          </div>

          {/* --------------------------------------------------------------
              Form 6-S: 6th Semester – Supervisor's Evaluation Sheet (Rubric A)
              -------------------------------------------------------------- */}
          <div className="space-y-2.5 pt-2">
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

          {/* --------------------------------------------------------------
              Form 6-C: 6th Semester – Co-examiner's Evaluation Sheet (Rubric B)
              -------------------------------------------------------------- */}
          <div className="space-y-2.5 pt-6">
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
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading evaluation sheet...</div>
      ) : (
        /* 7th and 8th Semester Evaluation Sheets */
        <div className="bg-white border border-slate-300 rounded-sm p-10 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-2">
          <div className="text-right text-[11px] italic text-slate-500 border-b border-slate-300 pb-1">
            Dept. of ECE, Heritage Institute of Technology, Kolkata | Proposed Project Evaluation Scheme
          </div>

          <div className="text-center space-y-1.5 pt-1">
            <h2 className="text-lg font-bold text-[#1F3864]">
              Annexure I – Evaluation Sheets ({activeSemester}th Semester)
            </h2>
            <p className="text-xs text-slate-900">
              One sheet is to be filled in per project group by each evaluator. Maximum marks are shown in brackets.
            </p>
          </div>

          {semRubrics.map((r) => (
            <div key={r.code} className="space-y-2.5 pt-4">
              <h3 className="text-sm font-bold text-[#1F4E79]">
                Form {r.semester}-{r.code === 'D' ? 'P' : r.code === 'F' ? 'E' : 'S'}: {r.semester}th Semester – {r.title} (Rubric {r.code})
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
                      <th className="border border-slate-900 px-2 py-2">Roll No.</th>
                      <th className="border border-slate-900 px-2 py-2">Name of Student</th>
                      {r.criteria.map((c) => (
                        <th key={c.key} className="border border-slate-900 px-2 py-2">
                          {c.label} ({c.maxMarks})
                        </th>
                      ))}
                      <th className="border border-slate-900 px-2 py-2">Total ({r.maxMarks})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((rowNum) => (
                      <tr key={rowNum} className="h-9">
                        <td className="border border-slate-900 px-2 py-2"></td>
                        <td className="border border-slate-900 px-2 py-2"></td>
                        {r.criteria.map((c) => (
                          <td key={c.key} className="border border-slate-900 px-2 py-2"></td>
                        ))}
                        <td className="border border-slate-900 px-2 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-xs font-bold text-slate-900">
                Name &amp; Signature of Evaluator:{' '}
                <span className="inline-block w-64 border-b border-slate-900 ml-1"></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
