"use client";

import { useEffect, useState } from "react";
import {
  deleteFacultyProductAction,
  getFacultyProductsAction,
  saveFacultyProductAction,
} from "@/app/actions/showcase";
import { CheckCircle2, Cpu, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type FacultyProjectOption = {
  id: string;
  code: string;
  title: string;
  status: string;
  groupId: string | null;
  batchId: string | null;
  groupLabel: string | null;
  studentNames: string;
};

type FacultyProductItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  trlLevel: number;
  demoUrl: string | null;
  patentStatus: string | null;
  supervisorName: string | null;
  studentNames: string | null;
  taggedTopicIds: string[];
  taggedTopics: Array<{ id: string; code: string; title: string }>;
  createdAt: string;
};

const EMPTY_FORM = {
  id: "",
  title: "",
  description: "",
  category: "Hardware Prototype",
  trlLevel: 7,
  demoUrl: "",
  patentStatus: "",
  taggedTopicIds: [] as string[],
};

export default function FacultyProductPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<FacultyProjectOption[]>([]);
  const [products, setProducts] = useState<FacultyProductItem[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getFacultyProductsAction();
    if (res.error) {
      setError(res.error);
    } else {
      setProjects(res.projects ?? []);
      setProducts(res.products ?? []);
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

  function startEdit(p: FacultyProductItem) {
    setForm({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      trlLevel: p.trlLevel,
      demoUrl: p.demoUrl || "",
      patentStatus: p.patentStatus || "",
      taggedTopicIds: p.taggedTopicIds || [],
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

    const res = await saveFacultyProductAction({
      id: form.id || undefined,
      title: form.title,
      description: form.description,
      category: form.category,
      trlLevel: Number(form.trlLevel),
      demoUrl: form.demoUrl || undefined,
      patentStatus: form.patentStatus || undefined,
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
    if (!confirm("Remove this Product Ready entry?")) return;
    const res = await deleteFacultyProductAction(id);
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <Cpu className="h-3.5 w-3.5" />
          Faculty Workspace &bull; Product Ready
        </span>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Product Ready Projects
        </h1>
        <p className="text-sm text-slate-600">
          Tag projects under your supervision that have matured into working products and describe the resulting product for the Department Showcase.
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

      {/* Describe Your Product & Tag Projects Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {form.id ? "Edit Product Ready Entry" : "Describe Your Product"}
            </h2>
            <p className="text-xs text-slate-500">
              Provide product details and select the project(s) under you that led to this product.
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
              Product Name / Title *
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Portable Edge-AI Arrhythmia Monitor"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Product Category
            </label>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Hardware Prototype / IoT / VLSI / AI Software"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Technology Readiness Level (TRL 1–9)
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
              Patent / IP Status (Optional)
            </label>
            <input
              value={form.patentStatus}
              onChange={(e) => setForm({ ...form, patentStatus: e.target.value })}
              placeholder="e.g., Patent Filed / Copyright / Open-Source"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Demo Video / Prototype Link / Repository URL (Optional)
            </label>
            <input
              value={form.demoUrl}
              onChange={(e) => setForm({ ...form, demoUrl: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Describe Your Product *
          </label>
          <textarea
            required
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe the final product architecture, real-world functionality, hardware/software specifications, testing results, and deployment readiness..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-slate-700">
              Tag Projects Leading to This Product (Product Ready) *
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
                      checked ? "bg-emerald-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProjectTag(proj.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600"
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
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {form.id ? "Update Product Ready Entry" : "Tag as Product Ready & Save"}
          </button>
        </div>
      </form>

      {/* Saved Product Ready List */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">
          Your Product Ready Showcase ({products.length})
        </h2>

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            No products tagged yet. Use &ldquo;Describe Your Product&rdquo; above to mark a project as Product Ready.
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
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Product Ready
                      </span>
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        {p.category}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        TRL {p.trlLevel}
                      </span>
                      {p.patentStatus && (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                          IP: {p.patentStatus}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="mt-2.5 text-lg font-bold text-slate-900">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap">{p.description}</p>

                  {p.taggedTopics && p.taggedTopics.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Projects Leading to This Product
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.taggedTopics.map((t) => (
                          <span
                            key={t.id}
                            className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
                          >
                            <span className="font-mono font-bold text-indigo-700">{t.code}</span>{" "}
                            &mdash; {t.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 flex items-center justify-between">
                  <span className="truncate">{p.studentNames || "Supervisor Product"}</span>
                  {p.demoUrl && (
                    <a
                      href={p.demoUrl}
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
