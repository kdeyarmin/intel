import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../scripts/generate-help-inventory.mjs';

const sourceUrl = new URL('../src/pages/Help.jsx', import.meta.url);
const manifestUrl = new URL('../artifacts/help/caremetric-intel-guide-sections.json', import.meta.url);

describe('CareMetric Intel static help inventory', () => {
  it('is a deterministic, privacy-scoped rendering of GUIDE_SECTIONS', async () => {
    const [source, manifestText] = await Promise.all([
      readFile(sourceUrl, 'utf8'),
      readFile(manifestUrl, 'utf8'),
    ]);
    const manifest = JSON.parse(manifestText);

    expect(manifest).toEqual(buildManifest(source, manifest.source.ref));
    expect(manifest.product.slug).toBe('caremetric-intel');
    expect(manifest.summary.section_count).toBe(9);
    expect(manifest.summary.topic_count).toBe(30);
    expect(manifest.privacy.runtime_or_entity_data_included).toBe(false);
    expect(manifest.summary.canonical_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
