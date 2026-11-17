"use client";

import { useEffect, useState } from "react";
import {
  deleteIndustryCollaborationAction,
  getIndustryCollaborationsAction,
  saveIndustryCollaborationAction,
} from "@/app/actions/showcase";
import { Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type IndustryCollaboration = {
  id: string;
  companyName: string;
  collaborationType: string;
  projectTitle: string;
  description: string | null;
  contactPerson: string | null;
  status: string;
  startYear: number;
  groupId: string | null;
  supervisorName: string | null;
  createdAt: string;
};

type GroupOption = {
  id: string;
  number: number;
  batchId: string;
  topicCode: string;
  topicTitle: string;
  supervisorName: string;
};

const EMPTY_FORM = {
  id: "",
  companyName: "",
  collaborationType: "Sponsored Project",
  projectTitle: "",
  description: "",
  contactPerson: "",
  status: "ACTIVE" as "ACTIVE" | "COMPLETED",
  startYear: new Date().getFullYear(),
  groupId: "",
  supervisorName: "",
};

export default function AdminShowcaseIndustryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [collaborations, setCollaborations] = useState<IndustryCollaboration[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getIndustryCollaborationsAction();
    if (res.error) {
      setError(res.error);
    } else {
      setCollaborations(res.collaborations ?? []);
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
      supervisorName: g.supervisorName,
      projectTitle: prev.projectTitle || g.topicTitle,
    }));
  }

  function startEdit(c: IndustryCollaboration) {
    setForm({
      id: c.id,
      companyName: c.companyName,
      collaborationType: c.collaborationType,
      projectTitle: c.projectTitle,
      description: c.description || "",
      contactPerson: c.contactPerson || "",
      status: c.status === "COMPLETED" ? "COMPLETED" : "ACTIVE",
      startYear: c.startYear,
      groupId: c.groupId || "",
      supervisorName: c.supervisorName || "",
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
    const res = await saveIndustryCollaborationAction({
      id: form.id || undefined,
      companyName: form.companyName,
      collaborationType: form.collaborationType,
      projectTitle: form.projectTitle,
      description: form.description || undefined,
      contactPerson: form.contactPerson || undefined,
      status: form.status,
      startYear: Number(form.startYear),
      groupId: form.groupId || undefined,
      supervisorName: form.supervisorName || undefined,
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
    if (!confirm("Delete this industry collaboration record?")) return;
    const res = await deleteIndustryCollaborationAction(id);
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            <Building2 className="h-3.5 w-3.5" />
            Admin Showcase &bull; Industry Collaborations
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Industry Collaborations &amp; Sponsored Projects
          </h1>
          <p className="text-sm text-slate-600">
            Track industry MoUs, sponsored capstone projects, consultancy engagements, and joint research partners.
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
          {showForm ? "Close Form" : "Add Collaboration"}
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
            {form.id ? "Edit Industry Collaboration" : "New Industry Collaboration"}
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
                Company / Organization Name *
              </label>
              <input
                required
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g., Texas Instruments / TCS Research"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Collaboration Type
              </label>
              <select
                value={form.collaborationType}
                onChange={(e) => setForm({ ...form, collaborationType: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Sponsored Project">Sponsored Project</option>
                <option value="MoU">MoU</option>
                <option value="Consultancy">Consultancy</option>
                <option value="Internship / Co-Supervision">Internship / Co-Supervision</option>
                <option value="Lab Grant / Equipment">Lab Grant / Equipment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Project / Engagement Title *
              </label>
              <input
                required
                value={form.projectTitle}
                onChange={(e) => setForm({ ...form, projectTitle: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Faculty Supervisor
              </label>
              <input
                value={form.supervisorName}
                onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Industry Contact / Mentor
              </label>
              <input
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Year *
              </label>
              <input
                type="number"
                required
                value={form.startYear}
                onChange={(e) => setForm({ ...form, startYear: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as "ACTIVE" | "COMPLETED" })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Scope &amp; Outcomes
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Deliverables, funding/equipment details, student outcomes..."
            />
          </div>
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
              {form.id ? "Update Collaboration" : "Save Collaboration"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
          Loading industry collaborations...
        </div>
      ) : collaborations.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-sm text-slate-500">
          No industry collaborations recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3">Company &amp; Type</th>
                <th className="px-4 py-3">Project / Scope</th>
                <th className="px-4 py-3">Supervisor &amp; Contact</th>
                <th className="px-4 py-3">Year / Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {collaborations.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70 align-top">
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-slate-900">{c.companyName}</div>
                    <span className="mt-1 inline-block rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {c.collaborationType}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 max-w-md">
                    <div className="font-medium text-slate-900">{c.projectTitle}</div>
                    {c.description && (
                      <div className="mt-1 text-xs text-slate-600">{c.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-700 space-y-1">
                    {c.supervisorName && (
                      <div>
                        <span className="font-semibold">Faculty:</span> {c.supervisorName}
                      </div>
                    )}
                    {c.contactPerson && (
                      <div>
                        <span className="font-semibold">Partner:</span> {c.contactPerson}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{c.startYear}</div>
                    <span
                      className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
                        c.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => startEdit(c)}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="ml-1 rounded p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
