/**
 * Source-level accessibility guards for controls that jsx-a11y can't see
 * through: Radix Select triggers and Progress bars are components, so the lint
 * rules don't know they render a combobox / progressbar that needs a name.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.jsx$/.test(e.name) ? [p] : [];
  });
}

// An opening JSX tag, allowing quoted strings and up to two levels of {...}.
const tag = (name: string) =>
  new RegExp(`<${name}\\b((?:[^>"'{}]|"[^"]*"|'[^']*'|\\{(?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*\\})*)>`, 'g');

function unnamed(name: string, ok: RegExp) {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (file.includes(`${path.sep}ui${path.sep}`)) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(tag(name))) {
      if (!ok.test(m[1])) {
        const line = src.slice(0, m.index).split('\n').length;
        found.push(`${path.relative(SRC, file)}:${line}`);
      }
    }
  }
  return found;
}

describe('accessible names in source', () => {
  it('every SelectTrigger has a label (aria-label, aria-labelledby, or an id a <Label htmlFor> points at)', () => {
    expect(unnamed('SelectTrigger', /aria-label|aria-labelledby|\bid=/)).toEqual([]);
  });

  it('every Progress bar has a name', () => {
    expect(unnamed('Progress', /aria-label|aria-labelledby/)).toEqual([]);
  });

  it('every native select has a label', () => {
    expect(unnamed('select', /aria-label|aria-labelledby|\bid=/)).toEqual([]);
  });

  it('size="icon" buttons have a name', () => {
    const found: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(tag('Button'))) {
        if (/size="icon"/.test(m[1]) && !/aria-label|aria-labelledby|title=|asChild/.test(m[1])) {
          found.push(`${path.relative(SRC, file)}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
