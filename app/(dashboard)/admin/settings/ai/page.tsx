'use client';

import { useState, useEffect } from 'react';
import {
  getAiProvidersAction,
  saveAiProviderAction,
  testAiProviderAction,
  toggleAiProviderAction,
  updateAiProviderPriorityAction,
  deleteAiProviderAction,
  getAiLogsAction,
} from '@/app/actions/ai';

interface ProviderItem {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  maskedKey: string;
  priority: number;
  enabled: boolean;
  dailyLimit: number;
  createdAt: Date;
}

interface PresetItem {
  name: string;
  description: string;
  baseUrl: string;
  model: string;
}

interface LogItem {
  id: string;
  providerName: string;
  userId: string;
  promptType: string;
  tokensUsed: number | null;
  latencyMs: number;
  success: boolean;
  errorMessage: string | null;
  calledAt: Date;
}

interface ProviderStat {
  provider: string;
  calls: number;
  avgLatencyMs: number;
}

export default function AdminAiConsolePage() {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal / Form state for Add or Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    model: '',
    apiKey: '',
    priority: 1,
    enabled: true,
    dailyLimit: 500,
  });
  const [formSaving, setFormSaving] = useState(false);

  // Ping Testing state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Logs & Analytics state
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [providerStats, setProviderStats] = useState<ProviderStat[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [successfulCalls, setSuccessfulCalls] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);

  // Load providers on mount
  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getAiProvidersAction();
    if (res.error) {
      setError(res.error);
    } else {
      setProviders(res.providers || []);
      setPresets(res.presets || []);
    }
    setLoading(false);
  }

  // Load telemetry logs
  async function loadLogs() {
    setLogsLoading(true);
    const res = await getAiLogsAction(30);
    if (!res.error && res.logs) {
      setLogs(res.logs);
      setTotalCalls(res.totalCalls || 0);
      setSuccessfulCalls(res.successfulCalls || 0);
      setProviderStats(res.providerStats || []);
    }
    setLogsLoading(false);
  }

  useEffect(() => {
    loadData();
    loadLogs();
  }, []);

  // Quick fill from Preset
  function handleSelectPreset(preset: PresetItem) {
    setEditingProvider(null);
    setFormData({
      name: preset.name,
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiKey: '',
      priority: providers.length + 1,
      enabled: true,
      dailyLimit: 500,
    });
    setIsModalOpen(true);
  }

  function handleOpenEdit(p: ProviderItem) {
    setEditingProvider(p);
    setFormData({
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      apiKey: '', // Leave blank to retain existing encrypted key
      priority: p.priority,
      enabled: p.enabled,
      dailyLimit: p.dailyLimit,
    });
    setIsModalOpen(true);
  }

  async function handleSaveProvider(e: React.FormEvent) {
    e.preventDefault();
    setFormSaving(true);
    setError(null);
    setSuccessMsg(null);

    const payload = {
      ...(editingProvider ? { id: editingProvider.id } : {}),
      name: formData.name,
      baseUrl: formData.baseUrl,
      model: formData.model,
      ...(formData.apiKey ? { apiKey: formData.apiKey } : {}),
      priority: Number(formData.priority),
      enabled: formData.enabled,
      dailyLimit: Number(formData.dailyLimit),
    };

    const res = await saveAiProviderAction(payload);
    setFormSaving(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(editingProvider ? `Provider "${formData.name}" updated successfully.` : `Provider "${formData.name}" added and encrypted.`);
      setIsModalOpen(false);
      loadData();
    }
  }

  async function handleTestPing(id: string) {
    setTestingId(id);
    setTestResult(null);
    const res = await testAiProviderAction(id);
    setTestingId(null);
    if ('error' in res) {
      setTestResult({
        id,
        success: false,
        message: res.error || 'Connection failed',
      });
    } else {
      setTestResult({
        id,
        success: res.success,
        message: res.message,
      });
    }
    // refresh logs after test ping
    loadLogs();
  }

  async function handleToggle(id: string, currentEnabled: boolean) {
    await toggleAiProviderAction(id, !currentEnabled);
    loadData();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to remove the provider "${name}"?`)) return;
    await deleteAiProviderAction(id);
    loadData();
  }

  async function handlePriorityChange(id: string, newPriority: number) {
    if (newPriority < 1) return;
    await updateAiProviderPriorityAction(id, newPriority);
    loadData();
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
              NBA Accreditation Module
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              AES-256-GCM Encrypted
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">AI Configuration & Telemetry Console</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure free-tier AI adapters (Google Gemini, Groq, ChatGPT). Supervisors can pick their preferred AI during topic refinement.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingProvider(null);
            setFormData({
              name: '',
              baseUrl: '',
              model: '',
              apiKey: '',
              priority: providers.length + 1,
              enabled: true,
              dailyLimit: 500,
            });
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Custom Provider
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>{successMsg}</div>
        </div>
      )}

      {/* Preset Quick Setup Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Recommended Free-Tier AI Providers
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {presets.map((preset) => {
            const isConfigured = providers.some((p) => p.name.toLowerCase() === preset.name.toLowerCase());
            return (
              <div
                key={preset.name}
                className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{preset.name}</h3>
                    {isConfigured ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                        Configured
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Available
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{preset.description}</p>
                  <div className="mt-3 text-[11px] text-slate-400 font-mono bg-slate-50 p-2 rounded">
                    <div>Model: {preset.model}</div>
                    <div className="truncate">URL: {preset.baseUrl}</div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => handleSelectPreset(preset)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {isConfigured ? 'Configure Another / Edit' : '+ Setup Provider'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Configured Providers Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="font-semibold text-slate-900">Configured AI Providers ({providers.length})</h2>
            <p className="text-xs text-slate-500">
              Providers are ordered by priority for fallback. All keys are encrypted at rest with AES-256-GCM.
            </p>
          </div>
          <button
            onClick={loadData}
            className="text-xs text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg bg-white"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading AI providers...</div>
        ) : providers.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-sm font-medium text-slate-700">No AI Providers Configured Yet</p>
            <p className="text-xs text-slate-500 mt-1">Select one of the free-tier presets above to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Priority</th>
                  <th className="px-6 py-3">Provider & Model</th>
                  <th className="px-6 py-3">API Key (Masked)</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Daily Limit</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((p) => {
                  const isTesting = testingId === p.id;
                  const result = testResult?.id === p.id ? testResult : null;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            value={p.priority}
                            onChange={(e) => handlePriorityChange(p.id, Number(e.target.value))}
                            className="w-14 px-2 py-1 text-xs border border-slate-300 rounded font-semibold text-center"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-xs font-mono text-slate-500">{p.model}</div>
                        <div className="text-[11px] text-slate-400 font-mono truncate max-w-xs">{p.baseUrl}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-700">
                        {p.maskedKey}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggle(p.id, p.enabled)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition ${
                            p.enabled
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {p.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-700">
                        {p.dailyLimit} calls/day
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {/* Live Ping Test */}
                        <button
                          onClick={() => handleTestPing(p.id)}
                          disabled={isTesting}
                          className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {isTesting ? (
                            <>
                              <svg className="animate-spin h-3 w-3 text-blue-600" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              Pinging...
                            </>
                          ) : (
                            'Test Connection'
                          )}
                        </button>

                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 bg-white hover:bg-slate-50 text-blue-600 transition"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="px-3 py-1.5 text-xs font-semibold rounded border border-red-200 bg-white hover:bg-red-50 text-red-600 transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Test Result Banner */}
        {testResult && (
          <div
            className={`p-4 border-t ${
              testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
            } text-xs flex items-center justify-between`}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">{testResult.success ? 'Ping Success:' : 'Ping Failed:'}</span>
              <span>{testResult.message}</span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="font-bold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Telemetry & Call Logs Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-semibold text-slate-900">AI Telemetry & Usage Summary</h2>
            <p className="text-xs text-slate-500">Live call logs with latency metrics and provider distribution</p>
          </div>
          <button
            onClick={loadLogs}
            disabled={logsLoading}
            className="text-xs text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg bg-white"
          >
            {logsLoading ? 'Refreshing...' : 'Refresh Logs'}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-xs text-slate-500 font-semibold uppercase">Total AI Calls</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{totalCalls}</div>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-xs text-slate-500 font-semibold uppercase">Success Rate</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {totalCalls > 0 ? `${Math.round((successfulCalls / totalCalls) * 100)}%` : '100%'}
            </div>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-xs text-slate-500 font-semibold uppercase">Active Providers</span>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {providers.filter((p) => p.enabled).length} / {providers.length}
            </div>
          </div>
        </div>

        {/* Provider Breakdown */}
        {providerStats.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-600 uppercase">Latency & Volume by Provider</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {providerStats.map((stat) => (
                <div key={stat.provider} className="p-3 bg-white border border-slate-200 rounded-md text-xs">
                  <div className="font-semibold text-slate-800">{stat.provider}</div>
                  <div className="text-slate-500 mt-1">
                    Calls: <span className="font-semibold text-slate-700">{stat.calls}</span> | Avg Latency:{' '}
                    <span className="font-semibold text-slate-700">{stat.avgLatencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent 10 Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2">Timestamp</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Latency</th>
                <th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-slate-400">
                    No AI calls recorded yet.
                  </td>
                </tr>
              ) : (
                logs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-[11px]">
                      {new Date(log.calledAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2 font-semibold text-slate-800">{log.providerName}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-semibold">
                        {log.promptType}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          log.success ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono">{log.latencyMs}ms</td>
                    <td className="px-4 py-2 text-slate-500 truncate max-w-xs">
                      {log.errorMessage || 'Completed successfully'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Provider Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-lg">
                {editingProvider ? `Edit Provider: ${editingProvider.name}` : 'Add AI Provider'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Provider Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Google Gemini, Groq, ChatGPT"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base URL (OpenAI-compatible)
                </label>
                <input
                  type="url"
                  required
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model Identifier
                </label>
                <input
                  type="text"
                  required
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g. gemini-1.5-flash, llama-3.3-70b-versatile, gpt-4o-mini"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  API Key {editingProvider && <span className="text-slate-400 font-normal">(Leave blank to keep existing encrypted key)</span>}
                </label>
                <input
                  type="password"
                  required={!editingProvider}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={editingProvider ? '••••••••••••••••' : 'Paste plaintext API key here'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Encrypted immediately with AES-256-GCM before storage. Never logged or returned to client.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority (1 = Highest)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Daily Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.dailyLimit}
                    onChange={(e) => setFormData({ ...formData, dailyLimit: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="enabledCheck"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="enabledCheck" className="text-xs font-medium text-slate-700">
                  Enable this provider for supervisor queries and auto-failover
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : editingProvider ? 'Update Provider' : 'Save & Encrypt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
