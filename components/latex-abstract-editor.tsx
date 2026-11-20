'use client';

import { useMemo, useRef, useState } from 'react';
import { hasClosedLatexEquations } from '@/lib/latex-parser';
import { LatexText } from '@/components/latex-text';

interface LatexAbstractEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  rows?: number;
  isOverWordLimit?: boolean;
  disabled?: boolean;
}

type EditorViewMode = 'auto' | 'edit' | 'preview';

const QUICK_SNIPPETS: Array<{ label: string; snippet: string; title: string }> = [
  { label: '$…$', snippet: '$  $', title: 'Insert inline LaTeX ($...$)' },
  { label: '$$…$$', snippet: '\n$$\n\n$$\n', title: 'Insert display block LaTeX ($$...$$)' },
  { label: 'a/b', snippet: '\\frac{a}{b}', title: 'Fraction' },
  { label: '∑', snippet: '\\sum_{i=1}^{N}', title: 'Summation' },
  { label: '∫', snippet: '\\int_{a}^{b}', title: 'Integral' },
  { label: '∇×', snippet: '\\nabla \\times \\mathbf{E}', title: 'Curl operator' },
];

export function LatexAbstractEditor({
  value,
  onChange,
  placeholder,
  rows = 9,
  isOverWordLimit = false,
  disabled = false,
}: LatexAbstractEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>('auto');

  const hasEquations = useMemo(() => hasClosedLatexEquations(value), [value]);
  const showEditor = viewMode === 'auto' || viewMode === 'edit';
  const showPreview =
    viewMode === 'preview' || (viewMode === 'auto' && hasEquations);

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);

    requestAnimationFrame(() => {
      el.focus();
      let cursorOffset = start + snippet.length;
      if (snippet === '$  $') {
        cursorOffset = start + 2;
      } else if (snippet === '\n$$\n\n$$\n') {
        cursorOffset = start + 4;
      }
      el.setSelectionRange(cursorOffset, cursorOffset);
    });
  };

  return (
    <div className="space-y-2.5">
      {/* Compact LaTeX Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-semibold text-slate-600 mr-1">
            LaTeX Math:
          </span>
          {QUICK_SNIPPETS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={disabled}
              title={item.title}
              onClick={() => insertAtCursor(item.snippet)}
              className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 rounded transition disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
          <span className="hidden md:inline text-[10px] text-slate-400 ml-1.5">
            Wrap equations in <code className="text-slate-600">$...$</code> or{' '}
            <code className="text-slate-600">$$...$$</code> — renders automatically on closing{' '}
            <code className="text-slate-600">$</code>
          </span>
        </div>

        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('auto')}
            className={`px-2 py-0.5 rounded transition ${
              viewMode === 'auto'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Auto Live
          </button>
          <button
            type="button"
            onClick={() => setViewMode('edit')}
            className={`px-2 py-0.5 rounded transition ${
              viewMode === 'edit'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`px-2 py-0.5 rounded transition ${
              viewMode === 'preview'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Textarea Editor */}
      {showEditor && (
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full p-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans ${
            isOverWordLimit
              ? 'border-red-400 focus:border-red-500 bg-red-50/20 text-red-900'
              : 'border-slate-300 text-slate-900'
          }`}
        />
      )}

      {/* Automatic Live KaTeX Preview (appears automatically once a $...$ or $$...$$ equation is closed) */}
      {showPreview && (
        <div className="p-4 rounded-xl bg-slate-50 border border-indigo-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Live Rendered Abstract Preview (LaTeX)
            </span>
            {hasEquations && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Equations Rendered
              </span>
            )}
          </div>
          {value.trim() ? (
            <LatexText
              text={value}
              className="text-sm leading-relaxed text-slate-800 pt-1"
            />
          ) : (
            <p className="text-xs text-slate-400 italic">
              Nothing to preview yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
