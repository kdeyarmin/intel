import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';

const root = new URL('../', import.meta.url);

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      if (entry.name === 'data') return [];
      return sourceFiles(new URL(`${entry.name}/`, directory));
    }
    return /\.(?:[jt]sx?|jsonc?|html)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

describe('CareMetric Intel branding', () => {
  it('uses the product title and company logo in browser metadata', async () => {
    const html = await readFile(new URL('index.html', root), 'utf8');
    expect(html).toContain('<title>CareMetric Intel</title>');
    expect(html).toContain(`type="image/png" href="${CAREMETRIC_LOGO_URL}"`);
    expect(html).toContain('CareMetric Healthcare Advisors');
    expect(html).not.toContain('base44.com/logo');
  });

  it('has no obsolete product names or domains in shipped code or documentation', async () => {
    const files = (await Promise.all(
      ['src/', 'server/', 'base44/', 'artifacts/'].map((path) => sourceFiles(new URL(path, root))),
    )).flat();
    files.push(...['index.html', 'README.md', 'CLAUDE.md', '.env.example'].map((path) => new URL(path, root)));
    const stale = /CareMetric\s+AI|(?:www\.)?caremetric\.ai\b|CareMetric[_]AI|CareMetric[A]I/i;
    const failures = [];
    for (const file of files) {
      if (stale.test(await readFile(file, 'utf8'))) failures.push(file.pathname);
    }
    expect(failures).toEqual([]);
  });
});
