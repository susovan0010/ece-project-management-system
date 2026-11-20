'use client';

import { useMemo } from 'react';
import katex from 'katex';
import { parseLatexSegments } from '@/lib/latex-parser';

interface LatexTextProps {
  text: string;
  className?: string;
}

/**
 * Renders plain text mixed with inline (`$...$`) and display (`$$...$$`) LaTeX equations
 * using KaTeX. Unclosed delimiters remain plain text until closed.
 */
export function LatexText({ text, className = '' }: LatexTextProps) {
  const segments = useMemo(() => parseLatexSegments(text), [text]);

  return (
    <div className={`whitespace-pre-line break-words ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <span key={idx}>{seg.content}</span>;
        }

        const displayMode = seg.type === 'block';
        const html = katex.renderToString(seg.content, {
          displayMode,
          throwOnError: false,
          strict: false,
          output: 'htmlAndMathml',
        });

        if (displayMode) {
          return (
            <div
              key={idx}
              className="my-2 overflow-x-auto py-1 text-center"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        return (
          <span
            key={idx}
            className="inline-block align-middle mx-0.5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}
