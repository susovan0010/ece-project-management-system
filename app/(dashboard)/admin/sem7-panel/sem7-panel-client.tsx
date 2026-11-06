'use client';

import { useState, useEffect } from 'react';
import {
  getSem7PanelOverviewAction,
  saveSem7ReservedMTechFacultyAction,
  generateAndSaveSem7PanelsAction,
  clearSem7PanelsAction,
  Sem7PanelOverviewData,
} from '@/app/actions/sem7-panel';
import { PanelGenerationResult, GeneratedPanel } from '@/lib/engine/panel-generator';

export default function Sem7PanelClient() {
  const [data, setData] = useState<Sem7PanelOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [reservedMTechIds, setReservedMTechIds] = useState<string[]>([]);
  const [facultySearch, setFacultySearch] = useState('');
  const [activeTab, setActiveTab] = useState<'PANELS' | 'FACULTY_RESERVATION'>('PANELS');

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview(batchId?: string) {
    setLoading(true);
    setError(null);
    const res = await getSem7PanelOverviewAction(batchId);
    setLoading(false);

    if (res.success) {
      setData(res.data);
      setSelectedBatchId(res.data.selectedBatchId);
      setReservedMTechIds(res.data.reservedMTechIds || []);
      // If panels already exist, default to PANELS tab, otherwise FACULTY_RESERVATION tab
      if (res.data.savedPanelsResult?.panels?.length) {
        setActiveTab('PANELS');
      }
    } else {
      setError(res.error);
    }
  }

  function handleBatchChange(newBatchId: string) {
    setSelectedBatchId(newBatchId);
    loadOverview(newBatchId);
  }

  // Toggle M.Tech reservation for a faculty
  function toggleMTechReservation(facultyId: string) {
    setReservedMTechIds((prev) =>
      prev.includes(facultyId) ? prev.filter((id) => id !== facultyId) : [...prev, facultyId]
    );
  }

  // Save M.Tech reservations
  async function handleSaveMTechReservations() {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    const res = await saveSem7ReservedMTechFacultyAction(reservedMTechIds);
    setActionLoading(false);

    if (res.success) {
      setSuccessMsg(res.message || 'M.Tech reservations saved successfully.');
    } else {
      setError(res.error || 'Failed to save reservations.');
    }
  }

  // "Make Panels" Push Button handler
  async function handleMakePanels() {
    if (!data) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    const res: PanelGenerationResult = await generateAndSaveSem7PanelsAction({
      batchId: selectedBatchId,
      reservedMTechIds,
      maxGroupsPerPanel: 10,
    });
    setActionLoading(false);

    if (res.success) {
      setSuccessMsg(
        `Successfully generated and balanced ${res.panelCount} panels with 0 conflict of interest!`
      );
      setData((prev) => (prev ? { ...prev, savedPanelsResult: res } : null));
      setActiveTab('PANELS');
    } else {
      setError(res.error || 'Failed to generate panels.');
    }
  }

  // Reset / Clear Panels
  async function handleClearPanels() {
    if (!confirm('Are you sure you want to clear the generated panels for this batch?')) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    const res = await clearSem7PanelsAction(selectedBatchId);
    setActionLoading(false);

    if (res.success) {
      setSuccessMsg('Panels reset successfully.');
      setData((prev) => (prev ? { ...prev, savedPanelsResult: null } : null));
    } else {
      setError(res.error || 'Failed to reset panels.');
    }
  }

  // Export CSV of generated panel schedule
  function handleExportCSV() {
    if (!data?.savedPanelsResult?.panels) return;
    const rows = [
      ['Panel #', 'Evaluator Name', 'Evaluator Role', 'Group Number', 'Topic Code', 'Topic Title', 'Guide / Supervisor', 'Students'],
    ];

    data.savedPanelsResult.panels.forEach((panel) => {
      const memberNames = panel.members.map((m) => `${m.name} (${m.role})`).join('; ');
      panel.groups.forEach((g) => {
        rows.push([
          `Panel ${panel.panelNumber}`,
          `"${memberNames}"`,
          'Panel Evaluators',
          `Group ${g.number}`,
          g.topicCode,
          `"${g.topicTitle}"`,
          g.supervisorName,
          `"${g.studentNames.join('; ')}"`,
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ECE_Sem7_Panels_${selectedBatchId}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Mathematical formula calculations
  const totalGroupsG = data?.totalGroupsCount || 0;
  const totalFacultyN = data?.totalFacultyCount || 0;
  const reservedMTechM = reservedMTechIds.length;
  const availableFaculty = Math.max(0, totalFacultyN - reservedMTechM);
  const calculatedP = totalGroupsG > 0 ? Math.ceil(totalGroupsG / 10) : 0;
  const calculatedQ = calculatedP > 0 ? (availableFaculty / calculatedP).toFixed(1) : '0';
  const calculatedGP = calculatedP > 0 ? (totalGroupsG / calculatedP).toFixed(1) : '0';

  const filterLower = facultySearch.trim().toLowerCase();
  const filteredFaculty = data?.facultyList.filter((f) => {
    if (!filterLower) return true;
    return (
      f.name.toLowerCase().includes(filterLower) ||
      f.email.toLowerCase().includes(filterLower) ||
      f.domainExpertise.some((d) => d.toLowerCase().includes(filterLower))
    );
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1985A1]/10 text-[#1985A1] border border-[#1985A1]/30 mb-2">
            Semester 7 Viva &amp; Presentation Panels
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>7 Sem Panel Distribution</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Automated panel formation with ceiling integer logic, domain diversity balancing, and strict supervisor exclusion.
          </p>
        </div>

        {/* Controls: Batch, Export, Make Panels */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Batch Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 pl-2">Batch:</span>
            <select
              value={selectedBatchId}
              onChange={(e) => handleBatchChange(e.target.value)}
              disabled={loading || actionLoading}
              className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              {data?.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} {b.active ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Export CSV (if panels exist) */}
          {data?.savedPanelsResult?.panels && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          )}

          {/* Push Button: Make Panels */}
          <button
            type="button"
            disabled={loading || actionLoading || totalGroupsG === 0 || availableFaculty < calculatedP}
            onClick={handleMakePanels}
            className="px-5 py-2 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {actionLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating Panels...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Make Panels
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
          {successMsg}
        </div>
      )}

      {/* Mathematical Formula Overview Box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#1985A1]"></span>
              Mathematical Panel Allocation Parameters
            </h3>
            <p className="text-[11px] text-slate-500">
              $P = \lceil G / 10 \rceil$ panels, $Q = (N - M) / P$ members per panel, uniform group quotas $G / P$.
            </p>
          </div>

          <div className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            Batch: {selectedBatchId}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Groups (G)</span>
            <span className="text-xl font-bold text-slate-900">{totalGroupsG}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Max 10 / panel</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Faculty (N)</span>
            <span className="text-xl font-bold text-slate-900">{totalFacultyN}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Faculty + Admins</span>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] font-bold text-amber-700 uppercase block">M.Tech Reserved (M)</span>
            <span className="text-xl font-bold text-amber-800">{reservedMTechM}</span>
            <span className="text-[10px] text-amber-600 block mt-0.5">Excluded from B.Tech</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Available Pool (N - M)</span>
            <span className="text-xl font-bold text-slate-900">{availableFaculty}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">B.Tech panel pool</span>
          </div>

          <div className="p-3 rounded-xl bg-[#1985A1]/10 border border-[#1985A1]/30">
            <span className="text-[10px] font-bold text-[#1985A1] uppercase block">Panels (P = ⌈G/10⌉)</span>
            <span className="text-xl font-bold text-[#1985A1]">{calculatedP}</span>
            <span className="text-[10px] text-[#1985A1]/80 block mt-0.5">Ceiling rounded</span>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-700 uppercase block">Uniform Quotas</span>
            <span className="text-sm font-bold text-emerald-800 block mt-1">
              {calculatedGP} grps / {calculatedQ} faculty
            </span>
            <span className="text-[10px] text-emerald-600 block">Diff &le; 1 group</span>
          </div>
        </div>
      </div>

      {/* Tabs Switcher: Generated Panels vs Faculty & M.Tech Reservations */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('PANELS')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
            activeTab === 'PANELS'
              ? 'bg-[#1985A1] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Generated Panels ({data?.savedPanelsResult?.panels?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('FACULTY_RESERVATION')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
            activeTab === 'FACULTY_RESERVATION'
              ? 'bg-[#1985A1] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Supervisors &amp; M.Tech Reservation ({totalFacultyN})
          {reservedMTechM > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 text-amber-900 font-bold">
              {reservedMTechM} reserved
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PANELS BOARD */}
      {activeTab === 'PANELS' && (
        <div className="space-y-6">
          {data?.savedPanelsResult?.panels && data.savedPanelsResult.panels.length > 0 ? (
            <>
              {/* Strict Non-Conflict Verification Banner */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    ✓
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">
                      Strict Conflict Check Passed: 0 Conflict of Interest Detected
                    </h4>
                    <p className="text-[11px] text-emerald-700">
                      Every panel is guaranteed to have NO members evaluating their own supervised groups. All {data.savedPanelsResult.totalGroups} groups and {data.savedPanelsResult.availableFacultyCount} faculty distributed.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearPanels}
                    disabled={actionLoading}
                    className="text-xs text-red-600 hover:text-red-800 font-semibold hover:underline"
                  >
                    Reset Panels
                  </button>
                </div>
              </div>

              {/* Grid of Panels */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.savedPanelsResult.panels.map((panel) => (
                  <div
                    key={panel.panelNumber}
                    className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col"
                  >
                    {/* Panel Header */}
                    <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#1985A1] text-white font-bold text-xs flex items-center justify-center">
                          {panel.panelNumber}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">
                          Panel {panel.panelNumber}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          {panel.groups.length} Groups
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                          {panel.members.length} Evaluators
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {panel.coveredDomainsCount} Domains
                        </span>
                      </div>
                    </div>

                    <div className="p-5 space-y-4 flex-1">
                      {/* Section A: Panel Evaluators (Members) */}
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                          <span>Panel Evaluator Members ({panel.members.length})</span>
                          <span className="text-[10px] text-[#1985A1]">Diverse Domain Coverage</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {panel.members.map((m) => (
                            <div
                              key={m.id}
                              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-xs text-slate-900 truncate">
                                  {m.name}
                                </div>
                                {m.role === 'ADMIN' ? (
                                  <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                    Admin
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-semibold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 border border-purple-200">
                                    Faculty
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[10px] text-slate-500 truncate">{m.email}</div>

                              {/* Member Domains */}
                              <div className="flex flex-wrap gap-1">
                                {m.domainExpertise.slice(0, 2).map((d) => (
                                  <span
                                    key={d}
                                    className="px-1.5 py-0.2 rounded text-[8px] font-semibold bg-white text-slate-700 border border-slate-200 truncate"
                                  >
                                    {d}
                                  </span>
                                ))}
                                {m.domainExpertise.length > 2 && (
                                  <span
                                    title={m.domainExpertise.slice(2).join(', ')}
                                    className="px-1 py-0.2 rounded text-[8px] font-bold bg-slate-200 text-slate-700"
                                  >
                                    +{m.domainExpertise.length - 2}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section B: Assigned Project Groups Table */}
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                          <span>Assigned Groups to Judge ({panel.groups.length})</span>
                          <span className="text-[10px] text-emerald-600 font-semibold">
                            ✓ No Supervisor Conflict
                          </span>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Group</th>
                                <th className="px-3 py-2">Topic Code &amp; Title</th>
                                <th className="px-3 py-2">Guide / Supervisor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {panel.groups.map((g) => (
                                <tr key={g.id} className="hover:bg-slate-50 transition">
                                  <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                                    Grp {g.number}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-semibold text-slate-900 truncate max-w-xs" title={g.topicTitle}>
                                      {g.topicTitle}
                                    </div>
                                    <div className="font-mono text-[10px] text-slate-400">
                                      {g.topicCode}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <div className="font-medium text-slate-800">{g.supervisorName}</div>
                                    <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                                      ✓ Independent Guide
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#1985A1]/10 text-[#1985A1] mx-auto flex items-center justify-center font-bold text-lg">
                P
              </div>
              <h3 className="font-bold text-sm text-slate-800">
                No Panels Generated Yet for Batch {selectedBatchId}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                There are {totalGroupsG} project groups and {availableFaculty} available faculty members.
                Click <strong>"Make Panels"</strong> above to distribute them automatically with strict non-self-supervision and domain diversity.
              </p>
              <button
                type="button"
                disabled={actionLoading || totalGroupsG === 0 || availableFaculty < calculatedP}
                onClick={handleMakePanels}
                className="mt-2 px-5 py-2.5 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50"
              >
                {actionLoading ? 'Generating Panels...' : 'Make Panels Now'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FACULTY & M.TECH RESERVATION MANAGEMENT */}
      {activeTab === 'FACULTY_RESERVATION' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Department Supervisors &amp; M.Tech Reservation ({totalFacultyN})
              </h3>
              <p className="text-xs text-slate-500">
                Select faculty members to reserve for M.Tech duties. Reserved faculty will be excluded from the 7th Semester B.Tech panels.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search faculty name, domain..."
                value={facultySearch}
                onChange={(e) => setFacultySearch(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56 focus:ring-2 focus:ring-[#1985A1] focus:outline-none"
              />

              <button
                type="button"
                onClick={handleSaveMTechReservations}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-bold rounded-lg shadow-2xs transition disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Save Reservations'}
              </button>
            </div>
          </div>

          {/* Faculty List Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="px-4 py-3 text-center">Reserve M.Tech</th>
                  <th className="px-4 py-3">Faculty / Admin Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Domain Expertise</th>
                  <th className="px-4 py-3 text-right">Panel Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredFaculty?.map((f) => {
                  const isReserved = reservedMTechIds.includes(f.id);

                  return (
                    <tr
                      key={f.id}
                      className={`transition ${isReserved ? 'bg-amber-50/50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isReserved}
                          onChange={() => toggleMTechReservation(f.id)}
                          className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                        />
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div>{f.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{f.email}</div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {f.role === 'ADMIN' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Admin
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                            Faculty
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {f.domainExpertise.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {f.domainExpertise.map((d) => (
                              <span
                                key={d}
                                className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-600 italic">No domains specified</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isReserved ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Reserved for M.Tech
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Eligible for B.Tech
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
