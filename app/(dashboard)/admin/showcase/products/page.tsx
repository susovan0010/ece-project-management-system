"use client";

import { useEffect, useState } from "react";
import {
  deleteShowcaseProductAction,
  getShowcaseProductsAction,
  saveShowcaseProductAction,
} from "@/app/actions/showcase";
import { Cpu, ExternalLink, Loader2, Plus, Star, Trash2, Pencil } from "lucide-react";

type ShowcaseProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  trlLevel: number;
  demoUrl: string | null;
  patentStatus: string | null;
  groupId: string | null;
  batchId: string | null;
  supervisorName: string | null;
  studentNames: string | null;
  featured: boolean;
  createdAt: string;
};

type GroupOption = {
  id: string;
  number: number;
  batchId: string;
  topicCode: string;
  topicTitle: string;
  supervisorName: string;
  studentNames: string;
};

const EMPTY_FORM = {
  id: "",
  title: "",
  description: "",
  category: "Hardware Prototype",
  trlLevel: 4,
  demoUrl: "",
  patentStatus: "",
  groupId: "",
  batchId: "",
  supervisorName: "",
  studentNames: "",
  featured: false,
};

export default function AdminShowcaseProductsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<ShowcaseProduct[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getShowcaseProductsAction();
    if (res.error) {
      setError(res.error);
    } else {
      setProducts(res.products ?? []);
      setGroups(res.groups ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleGroupSelect(groupId: string) {
    const g = groups.find((item) => item.id === groupId);
    if (!g) {
      setForm((prev) => ({ ...prev, groupId: "" }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      groupId: g.id,
      batchId: g.batchId,
      supervisorName: g.supervisorName,
      studentNames: g.studentNames,
      title: prev.title || g.topicTitle,
    }));
  }

  function startEdit(p: ShowcaseProduct) {
    setForm({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      trlLevel: p.trlLevel,
      demoUrl: p.demoUrl || "",
      patentStatus: p.patentStatus || "",
      groupId: p.groupId || "",
      batchId: p.batchId || "",
      supervisorName: p.supervisorName || "",
      studentNames: p.studentNames || "",
      featured: p.featured,
    });
    setShowForm(true);
    setMessage(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await saveShowcaseProductAction({
      id: form.id || undefined,
      title: form.title,
      description: form.description,
      category: form.category,
      trlLevel: Number(form.trlLevel),
      demoUrl: form.demoUrl || undefined,
      patentStatus: form.patentStatus || undefined,
      groupId: form.groupId || undefined,
      batchId: form.batchId || undefined,
      supervisorName: form.supervisorName || undefined,
      studentNames: form.studentNames || undefined,
      featured: form.featured,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessage(res.message || "Saved.");
    setForm(EMPTY_FORM);
    setShowForm(false);
    await loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this showcase product?")) return;
    const res = await deleteShowcaseProductAction(id);
    if (res.error) {
      setError(res.error);
    } else {
      setMessage(res.message || "Deleted.");
      await loadData();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <Cpu className="h-3.5 w-3.5" />
            Admin Showcase &bull; Products
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Capstone Products &amp; Prototypes
          </h1>
          <p className="text-sm text-slate-600">
            Curate hardware prototypes, embedded systems, and software products developed by ECE capstone teams.
          </p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setShowForm((s) => !s);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Close Form" : "Add Product"}
        </button>
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

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-base font-semibold text-slate-900">
            {form.id ? "Edit Showcase Product" : "New Showcase Product"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link Capstone Group (Optional)
              </label>
              <select
                value={form.groupId}
                onChange={(e) => handleGroupSelect(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">-- Select Group to Auto-Fill --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Batch {g.batchId} &bull; Group {g.number} ({g.topicCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product / Prototype Title *
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g., Smart Edge-AI ECG Monitor"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Hardware Prototype / IoT / VLSI / AI Software"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                TRL Level (1-9)
              </label>
              <input
                type="number"
                min={1}
                max={9}
                value={form.trlLevel}
                onChange={(e) => setForm({ ...form, trlLevel: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supervisor Name
              </label>
              <input
                value={form.supervisorName}
                onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Student Team Members
              </label>
              <input
                value={form.studentNames}
                onChange={(e) => setForm({ ...form, studentNames: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Demo / Repository URL
              </label>
              <input
                value={form.demoUrl}
                onChange={(e) => setForm({ ...form, demoUrl: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Patent / IP Status
              </label>
              <input
                value={form.patentStatus}
                onChange={(e) => setForm({ ...form, patentStatus: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g., Filed / Published / Open-Source"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Technical Description *
            </label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Describe the prototype capabilities, hardware/software stack, and impact..."
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              className="rounded border-slate-300"
            />
            Feature on department showcase
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? "Update Product" : "Save Product"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
          Loading showcase products...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-sm text-slate-500">
          No showcase products added yet. Click &ldquo;Add Product&rdquo; to create one.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {p.category}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      TRL {p.trlLevel}
                    </span>
                    {p.featured && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                        Featured
                      </span>
                    )}
                    {p.patentStatus && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        IP: {p.patentStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(p)}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="mt-2.5 text-lg font-bold text-slate-900">{p.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{p.description}</p>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 space-y-1">
                {p.supervisorName && (
                  <div>
                    <span className="font-semibold text-slate-700">Supervisor:</span>{" "}
                    {p.supervisorName}
                  </div>
                )}
                {p.studentNames && (
                  <div>
                    <span className="font-semibold text-slate-700">Team:</span>{" "}
                    {p.studentNames}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">
                    {p.batchId ? `Batch ${p.batchId}` : "Department Showcase"}
                  </span>
                  {p.demoUrl && (
                    <a
                      href={p.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      Demo / Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
