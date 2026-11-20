export type LatexSegment =
  | { type: 'text'; content: string }
  | { type: 'inline'; content: string }
  | { type: 'block'; content: string };

/**
 * Parses text containing LaTeX math delimited by `$$...$$` (block) and `$...$` (inline).
 * Unclosed delimiters remain plain text until the closing `$` / `$$` is entered.
 * Escaped `\$` is preserved as literal text.
 */
export function parseLatexSegments(input: string): LatexSegment[] {
  if (!input) return [];

  const segments: LatexSegment[] = [];
  let textBuffer = '';
  let i = 0;

  const flushText = () => {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', content: textBuffer });
      textBuffer = '';
    }
  };

  while (i < input.length) {
    // Handle escaped dollar sign `\$`
    if (input[i] === '\\' && input[i + 1] === '$') {
      textBuffer += '$';
      i += 2;
      continue;
    }

    // Handle block math `$$...$$`
    if (input[i] === '$' && input[i + 1] === '$') {
      const closeIdx = findClosingDoubleDollar(input, i + 2);
      if (closeIdx !== -1) {
        const inner = input.slice(i + 2, closeIdx).trim();
        if (inner.length > 0) {
          flushText();
          segments.push({ type: 'block', content: inner });
          i = closeIdx + 2;
          continue;
        }
      }
      // Unclosed or empty `$$`: keep as literal text
      textBuffer += '$$';
      i += 2;
      continue;
    }

    // Handle inline math `$...$`
    if (input[i] === '$') {
      const closeIdx = findClosingSingleDollar(input, i + 1);
      if (closeIdx !== -1) {
        const inner = input.slice(i + 1, closeIdx).trim();
        if (inner.length > 0) {
          flushText();
          segments.push({ type: 'inline', content: inner });
          i = closeIdx + 1;
          continue;
        }
      }
      // Unclosed `$`: keep as literal text until user types closing `$`
      textBuffer += '$';
      i += 1;
      continue;
    }

    textBuffer += input[i];
    i += 1;
  }

  flushText();
  return segments;
}

function findClosingDoubleDollar(input: string, start: number): number {
  let i = start;
  while (i < input.length - 1) {
    if (input[i] === '\\' && input[i + 1] === '$') {
      i += 2;
      continue;
    }
    if (input[i] === '$' && input[i + 1] === '$') {
      return i;
    }
    i += 1;
  }
  return -1;
}

function findClosingSingleDollar(input: string, start: number): number {
  let i = start;
  while (i < input.length) {
    if (input[i] === '\\' && input[i + 1] === '$') {
      i += 2;
      continue;
    }
    // Do not span inline math across newlines
    if (input[i] === '\n') {
      return -1;
    }
    // If we hit `$$`, stop searching for single `$`
    if (input[i] === '$' && input[i + 1] === '$') {
      return -1;
    }
    if (input[i] === '$') {
      return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Returns true if the input contains at least one closed `$...$` or `$$...$$` equation.
 */
export function hasClosedLatexEquations(input: string): boolean {
  return parseLatexSegments(input).some(
    (seg) => seg.type === 'inline' || seg.type === 'block'
  );
}
