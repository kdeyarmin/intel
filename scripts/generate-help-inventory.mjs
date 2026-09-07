import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const SOURCE_PATH = new URL('../src/pages/Help.jsx', import.meta.url);
const OUTPUT_PATH = new URL('../artifacts/help/caremetric-intel-guide-sections.json', import.meta.url);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function extractGuideSections(source) {
  const marker = 'const GUIDE_SECTIONS = ';
  const start = source.indexOf(marker);
  const end = source.indexOf('\n];', start);
  if (start === -1 || end === -1) throw new Error('GUIDE_SECTIONS was not found');

  const expression = source
    .slice(start + marker.length, end + 2)
    .replace(/icon:\s*([A-Za-z][A-Za-z0-9_]*),/g, "icon: '$1',");
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  });
  const script = new vm.Script(`(${expression})`);
  const sections = script.runInContext(context, { timeout: 1_000 });

  if (!Array.isArray(sections)) throw new Error('GUIDE_SECTIONS must be an array');
  return sections.map((section) => {
    if (
      typeof section?.id !== 'string'
      || typeof section?.title !== 'string'
      || !Array.isArray(section?.content)
    ) throw new Error('Invalid guide section');

    return {
      id: section.id,
      title: section.title,
      topics: section.content.map((topic) => {
        if (typeof topic?.heading !== 'string' || typeof topic?.text !== 'string') {
          throw new Error(`Invalid topic in ${section.id}`);
        }
        const content = { heading: topic.heading, text: topic.text };
        return { ...content, sha256: sha256(JSON.stringify(content)) };
      }),
    };
  });
}

export function requireSourceCommit(environment = process.env) {
  const sourceCommit = environment.SOURCE_COMMIT;
  if (typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommit)) {
    throw new Error('SOURCE_COMMIT must be the full 40-character commit containing GUIDE_SECTIONS');
  }
  return sourceCommit;
}

export function buildManifest(source, sourceCommit) {
  const sections = extractGuideSections(source);
  const canonicalSections = sections.map(({ id, title, topics }) => ({
    id,
    title,
    topics: topics.map(({ heading, text }) => ({ heading, text })),
  }));

  return {
    schema_version: 1,
    product: { slug: 'caremetric-intel', name: 'CareMetric Intel' },
    source: {
      repository: 'kdeyarmin/intel',
      ref: sourceCommit,
      path: 'src/pages/Help.jsx',
      constant: 'GUIDE_SECTIONS',
    },
    privacy: {
      classification: 'static_product_documentation',
      runtime_or_entity_data_included: false,
      excluded_context: ['user', 'tenant', 'provider', 'patient', 'record', 'query', 'fragment', 'token', 'free_text'],
    },
    summary: {
      section_count: sections.length,
      topic_count: sections.reduce((sum, section) => sum + section.topics.length, 0),
      text_character_count: sections.reduce(
        (sum, section) => sum + section.topics.reduce((topicSum, topic) => topicSum + topic.text.length, 0),
        0,
      ),
      canonical_sha256: sha256(JSON.stringify(canonicalSections)),
    },
    sections,
  };
}

async function main() {
  const source = await readFile(SOURCE_PATH, 'utf8');
  const sourceCommit = requireSourceCommit();
  const manifest = buildManifest(source, sourceCommit);
  await mkdir(new URL('../artifacts/help/', import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await main();
}
