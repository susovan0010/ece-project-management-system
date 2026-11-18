"use client";

import { useEffect, useState } from "react";
import { getAdminShowcaseModelsAction } from "@/app/actions/showcase";
import { CircuitBoard, ExternalLink, Loader2 } from "lucide-react";

type AdminModelItem = {
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
  taggedTopics: Array<{
    id: string;
    code: string;
    title: string;
    groupLabel: string | null;
  }>;
  createdAt: string;
};

export default function AdminShowcaseModelsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<AdminModelItem[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await getAdminShowcaseModelsAction();
      if (res.error) setError(res.error);
      else setModels(res.models ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
          <CircuitBoard className="h-3.5 w-3.5" />
          Admin Showcase &bull; Working Models
        </span>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Demonstration Working Models (FPGA, Embedded, RISC-V, Pi)
        </h1>
        <p className="text-sm text-slate-600">
          Hardware and embedded demonstration models documented by supervisors and linked to student project groups.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
          Loading working models...
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-sm text-slate-500">
          No working models documented by supervisors yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {models.map((m) => (
            <div
              key={m.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    {m.platform}
                  </span>
                  {m.supervisorName && (
                    <span className="text-xs font-medium text-slate-600">
                      Supervisor: {m.supervisorName}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-slate-900">{m.title}</h3>

                <div className="text-xs text-slate-700 space-y-1.5">
                  <div>
                    <span className="font-bold text-slate-900">Objective:</span> {m.objective}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Functionality:</span> {m.functionality}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Components:</span> {m.componentsUsed}
                  </div>
                  {m.simulationResults && (
                    <div>
                      <span className="font-bold text-slate-900">Simulation Results:</span>{" "}
                      {m.simulationResults}
                    </div>
                  )}
                </div>

                {m.taggedTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
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
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 flex items-center justify-between">
                <span className="truncate">{m.studentNames || "Department Working Model"}</span>
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
  );
}
