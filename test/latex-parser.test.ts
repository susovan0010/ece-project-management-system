import { describe, it, expect } from 'vitest';
import { parseLatexSegments, hasClosedLatexEquations } from '@/lib/latex-parser';

describe('LaTeX Abstract Parser', () => {
  it('keeps unclosed $ equations as plain text until the closing $ is typed', () => {
    const typing = 'Signal bandwidth $B = 2 f_m';
    expect(hasClosedLatexEquations(typing)).toBe(false);
    expect(parseLatexSegments(typing)).toEqual([
      { type: 'text', content: 'Signal bandwidth $B = 2 f_m' },
    ]);

    const closed = 'Signal bandwidth $B = 2 f_m$ is required.';
    expect(hasClosedLatexEquations(closed)).toBe(true);
    expect(parseLatexSegments(closed)).toEqual([
      { type: 'text', content: 'Signal bandwidth ' },
      { type: 'inline', content: 'B = 2 f_m' },
      { type: 'text', content: ' is required.' },
    ]);
  });

  it('parses block $$...$$ equations including multiline formulas', () => {
    const text = 'Transfer function:\n$$\nH(s) = \\frac{1}{s + \\omega_0}\n$$\nfor low-pass filtering.';
    expect(hasClosedLatexEquations(text)).toBe(true);
    expect(parseLatexSegments(text)).toEqual([
      { type: 'text', content: 'Transfer function:\n' },
      { type: 'block', content: 'H(s) = \\frac{1}{s + \\omega_0}' },
      { type: 'text', content: '\nfor low-pass filtering.' },
    ]);
  });

  it('preserves escaped dollar signs and mixed inline/block equations', () => {
    const text = 'Budget is \\$500 with gain $G = 10$ and $$P = I^2 R$$.';
    expect(parseLatexSegments(text)).toEqual([
      { type: 'text', content: 'Budget is $500 with gain ' },
      { type: 'inline', content: 'G = 10' },
      { type: 'text', content: ' and ' },
      { type: 'block', content: 'P = I^2 R' },
      { type: 'text', content: '.' },
    ]);
  });
});
