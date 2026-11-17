"use client";

import { useState } from "react";
import { BookOpen, Cpu, Building2 } from "lucide-react";
import AdminShowcasePublicationsPage from "./publications/page";
import AdminShowcaseProductsPage from "./products/page";
import AdminShowcaseIndustryPage from "./industry/page";

type ShowcaseTab = "publications" | "products" | "industry";

export default function AdminShowcasePage() {
  const [activeTab, setActiveTab] = useState<ShowcaseTab>("publications");

  const tabs: Array<{
    id: ShowcaseTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "publications", label: "Publications", icon: BookOpen },
    { id: "products", label: "Products", icon: Cpu },
    { id: "industry", label: "Industry Collaborations", icon: Building2 },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 bg-white rounded-xl px-4 pt-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "publications" && <AdminShowcasePublicationsPage />}
      {activeTab === "products" && <AdminShowcaseProductsPage />}
      {activeTab === "industry" && <AdminShowcaseIndustryPage />}
    </div>
  );
}
