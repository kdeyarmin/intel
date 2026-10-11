/**
 * The campaign preview (client) must render exactly what the server sends.
 */
import { describe, it, expect } from 'vitest';
import * as client from '../src/components/outreach/mergeFields';
import * as server from '../server/functions/outreachHelpers';

const cases = [
  [{ entity_type: 'Individual', first_name: 'Ann', last_name: 'Cardio', credential: 'MD', npi: '1' }, { taxonomy_description: 'Cardiology' }, { city: 'Erie', state: 'PA' }],
  [{ entity_type: 'Individual', first_name: 'Bo', last_name: 'Nurse', credential: 'RN', npi: '2' }, null, null],
  [{ entity_type: 'Organization', organization_name: 'Mercy Clinic', npi: '3' }, { taxonomy_description: 'Clinic' }, { city: 'Pittsburgh' }],
];

describe('client/server merge fields', () => {
  it('offer the same fields', () => {
    expect(client.MERGE_FIELDS.map(f => f.key)).toEqual([...server.MERGE_FIELDS]);
  });

  it.each(cases)('build identical variables and output for %o', (provider, taxonomy, location) => {
    const c = client.buildMergeVars(provider, taxonomy, location);
    const s = server.buildMergeVars(provider, taxonomy, location);
    expect(c).toEqual(s);
    const tpl = 'Hi {{provider_name}} ({{ specialty }}) in {{location_city}}, {{location_state}} {{unknown}}';
    expect(client.renderTemplate(tpl, c)).toBe(server.renderTemplate(tpl, s));
  });
});
