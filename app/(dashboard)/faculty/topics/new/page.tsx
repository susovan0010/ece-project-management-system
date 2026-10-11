export default function ProposeTopicPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Propose Capstone Project Topic
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Define an original engineering challenge, draft abstract with AI assistance, and evaluate Washington Accord complexity.
        </p>
      </div>

      <div className="p-8 bg-white border border-slate-200/80 rounded-xl shadow-sm text-center">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Topic Proposal Editor</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mb-2">
          Strict Faculty-only area. Administrators cannot access or propose topics from this interface.
        </p>
        <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          Full AI-assisted 500-word editor arriving in Phase 6
        </span>
      </div>
    </div>
  );
}
