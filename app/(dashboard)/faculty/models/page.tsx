"use client";

import { useEffect, useState } from "react";
import {
  deleteFacultyModelAction,
  getFacultyModelsAction,
  saveFacultyModelAction,
} from "@/app/actions/showcase";
import { CircuitBoard, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type FacultyProjectOption = {
  id: string;
  code: string;
  title: string;
  status: string;
  groupLabel: string | null;
  studentNames: string;
};

type WorkingModelItem = {
  id: string;
  title: string;
  platform: string;
  objective: string;
  functionality: string;
  componentsUsed: string;
  simulationResults: string | null;
  demoUrl: string | null;
  supervisorName: string | null;
  studentNames: string | null;
  taggedTopicIds: string[];
  taggedTopics: Array<{
    id: string;
    code: string;
    title: string;
    groupLabel?: string | null;
  }>;
  createdAt: string;
};

const PLATFORMS = [
  "FPGA",
  "ATMEL / AVR",
  "Raspberry Pi",
  "RISC-V",
  "ESP32 / Arduino",
  "STM32 / ARM",
  "VLSI / ASIC",
  "Other",
];

const EMPTY_FORM = {
  id: "",
  title: "",
  platform: "FPGA",
  objective: "",
  functionality: "",
  componentsUsed: "",
  simulationResults: "",
  demoUrl: "",
  taggedTopicIds: [] as string[],
};

export default function FacultyModelsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<FacultyProjectOption[]>([]);
  const [models, setModels] = useState<WorkingModelItem[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getFacultyModelsAction();
    if (res.error) {
      setError(res.error);
    } else {
      setProjects(res.projects ?? []);
      setModels(res.models ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleProjectTag(topicId: string) {
    setForm((prev) => {
      const exists = prev.taggedTopicIds.includes(topicId);
      return {
        ...prev,
        taggedTopicIds: exists
          ? prev.taggedTopicIds.filter((id) => id !== topicId)
          : [...prev.taggedTopicIds, topicId],
      };
    });
  }

  function startEdit(m: WorkingModelItem) {
    setForm({
      id: m.id,
      title: m.title,
      platform: m.platform,
      objective: m.objective,
      functionality: m.functionality,
      componentsUsed: m.componentsUsed,
      simulationResults: m.simulationResults || "",
      demoUrl: m.demoUrl || "",
      taggedTopicIds: m.taggedTopicIds || [],
    });
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const res = await saveFacultyModelAction({
      id: form.id || undefined,
      title: form.title,
      platform: form.platform,
      objective: form.objective,
      functionality: form.functionality,
      componentsUsed: form.componentsUsed,
      simulationResults: form.simulationResults || undefined,
      demoUrl: form.demoUrl || undefined,
      taggedTopicIds: form.taggedTopicIds,
    });

    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }

    setMessage(res.message || "Saved.");
    setForm(EMPTY_FORM);
    await loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this Working Model entry?")) return;
    const res = await deleteFacultyModelAction(id);
    if (res.error) {
      setError(res.error);
    } else {
      setMessage(res.message || "Deleted.");
      await loadData();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
          <CircuitBoard className="h-3.5 w-3.5" />
          Faculty Workspace &bull; Working Models
        </span>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Hardware &amp; Demonstration Working Models
        </h1>
        <p className="text-sm text-slate-600">
          Document working demonstration models (FPGA, ATMEL, Raspberry Pi, RISC-V, microcontrollers, etc.) implemented by your project groups along with their objective, functionality, components, and simulation results.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {form.id ? "Edit Working Model" : "Add & Tag Working Model"}
            </h2>
            <p className="text-xs text-slate-500">
              Enter technical details of the demonstration model and tag the project(s) that implemented it.
            </p>
          </div>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Working Model Name / Title *
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., FPGA Real-Time Sobel Edge Detection Pipeline"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Platform / Architecture *
            </label>
            <select
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Objective *
            </label>
            <textarea
              required
              rows={3}
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              placeholder="What problem does this working model demonstrate or solve?"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Functionality / Working Principle *
            </label>
            <textarea
              required
              rows={3}
              value={form.functionality}
              onChange={(e) => setForm({ ...form, functionality: e.target.value })}
              placeholder="Explain how the model operates, signal flow, interfaces, and live demo behavior..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Main Components Used (Microcontrollers, Peripherals, ICs) *
            </label>
            <textarea
              required
              rows={3}
              value={form.componentsUsed}
              onChange={(e) => setForm({ ...form, componentsUsed: e.target.value })}
              placeholder="e.g., Xilinx Artix-7 FPGA / ATmega328P / Raspberry Pi 4 / RISC-V RV32I core, L298N driver, OV7670 camera, ADC0804, OLED display..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Simulation Results (If Any)
            </label>
            <textarea
              rows={3}
              value={form.simulationResults}
              onChange={(e) => setForm({ ...form, simulationResults: e.target.value })}
              placeholder="e.g., Vivado timing closure at 100 MHz, LUT utilization 18%, Proteus / LTspice / ModelSim waveform metrics..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Demo Video / Schematic / Repository URL (Optional)
          </label>
          <input
            value={form.demoUrl}
            onChange={(e) => setForm({ ...form, demoUrl: e.target.value })}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-slate-700">
              Tag Project(s) Implementing This Model *
            </label>
            <span className="text-xs font-semibold text-indigo-700">
              {form.taggedTopicIds.length} project(s) selected
            </span>
          </div>
          {loading ? (
            <div className="text-xs text-slate-500">Loading your projects...</div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              No proposed or supervised projects found under your account yet.
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {projects.map((proj) => {
                const checked = form.taggedTopicIds.includes(proj.id);
                return (
                  <label
                    key={proj.id}
                    className={`flex items-start gap-3 p-3 cursor-pointer text-xs ${
                      checked ? "bg-indigo-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProjectTag(proj.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-bold text-indigo-700">
                          {proj.code}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {proj.status}
                        </span>
                        {proj.groupLabel && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            {proj.groupLabel}
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {proj.title}
                      </div>
                      {proj.studentNames && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Team: {proj.studentNames}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {form.id ? "Update Working Model" : "Save Working Model & Tag Project"}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">
          Tagged Working Models ({models.length})
        </h2>

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
            Loading working models...
          </div>
        ) : models.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            No working models documented yet. Use the form above to tag a project with a working demonstration model.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                      {m.platform}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900">{m.title}</h3>

                  <div className="text-xs text-slate-700 space-y-1.5">
                    <div>
                      <span className="font-bold text-slate-900">Objective:</span>{" "}
                      {m.objective}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">Functionality:</span>{" "}
                      {m.functionality}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">Components Used:</span>{" "}
                      {m.componentsUsed}
                    </div>
                    {m.simulationResults && (
                      <div>
                        <span className="font-bold text-slate-900">Simulation Results:</span>{" "}
                        {m.simulationResults}
                      </div>
                    )}
                  </div>

                  {m.taggedTopics && m.taggedTopics.length > 0 && (
                    <div className="pt-2 space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Tagged Project(s) &amp; Group
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.taggedTopics.map((t) => (
                          <span
                            key={t.id}
                            className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
                          >
                            <span className="font-mono font-bold text-indigo-700">{t.code}</span>{" "}
                            {t.groupLabel ? `(${t.groupLabel}) ` : ""}&mdash; {t.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 flex items-center justify-between">
                  <span className="truncate">{m.studentNames || "Demonstration Model"}</span>
                  {m.demoUrl && (
                    <a
                      href={m.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 shrink-0 ml-2"
                    >
                      Demo / Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
