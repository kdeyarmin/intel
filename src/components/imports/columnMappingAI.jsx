import { base44 } from '@/api/base44Client';

// Optional columns per import type that the AI should try to map
const OPTIONAL_COLUMNS = {
  nppes_monthly: [
    'Provider Middle Name',
    'Provider Credential Text',
    'Provider Gender Code',
    'Provider Organization Name (Legal Business Name)',
    'Provider Enumeration Date',
    'Last Update Date',
    'NPI Deactivation Date',
    'Provider Business Mailing Address Street 1',
    'Provider Business Mailing Address City Name',
    'Provider Business Mailing Address State Name',
    'Provider Business Mailing Address Postal Code',
    'Provider Business Practice Location Telephone Number',
    'Provider Business Practice Location Fax Number',
    'Healthcare Provider Taxonomy Code_1',
  ],
  cms_utilization: [
    'Total Submitted Charges',
    'Total Medicare Allowed Amount',
    'Drug Services',
    'Provider Type',
    'Provider State',
  ],
  cms_part_d: [
    'Provider Last Name',
    'Provider First Name',
    'Provider State',
    'Specialty Description',
    'Total 30-Day Fill Count',
    'Total Day Supply',
    'Brand Drug Cost',
    'Generic Drug Cost',
  ],
  cms_order_referring: [
    'LAST_NAME',
    'FIRST_NAME',
    'Year',
    'SNF',
    'PMD',
    'Total Referrals',
  ],
  pa_home_health: [
    'Address',
    'Zip',
    'Phone',
    'County',
  ],
  hospice_providers: [
    'Address',
    'Zip',
    'Phone',
    'County',
  ],
  nursing_home_chains: [
    'Number of states',
    'Average health inspection rating',
    'Average staffing rating',
    'Average quality rating',
    'Total fines amount',
  ],
  hospice_enrollments: [
    'DOING BUSINESS AS',
    'CITY',
    'STATE',
    'ZIP',
    'INCORPORATION STATE',
    'PROPRIETARY NONPROFIT',
  ],
  home_health_enrollments: [
    'DOING BUSINESS AS',
    'CITY',
    'STATE',
    'ZIP',
    'INCORPORATION STATE',
    'PROPRIETARY NONPROFIT',
    'PRACTICE LOCATION TYPE',
  ],
  home_health_cost_reports: [
    'City',
    'State',
    'Zip Code',
    'Total Revenue',
    'Total Visits',
    'Net Income',
  ],
  cms_service_utilization: [
    'Tot_Srvcs',
    'Tot_Sbmtd_Chrgs',
    'Tot_Mdcr_Alowd_Amt',
    'Tot_Mdcr_Pymt_Amt',
  ],
  provider_service_utilization: [
    'Tot_Srvcs',
    'Avg_Sbmtd_Chrg',
    'Avg_Mdcr_Alowd_Amt',
    'Avg_Mdcr_Pymt_Amt',
    'Rndrng_Prvdr_Last_Org_Name',
    'Rndrng_Prvdr_State_Abrvtn',
  ],
  home_health_pdgm: [
    'PRVDR_NAME',
    'PRVDR_STATE',
    'TOT_EPSD_CNT',
    'AVG_HH_CHRG_AMT',
    'AVG_HH_MDCR_PYMT_AMT',
  ],
  inpatient_drg: [
    'Rndrng_Prvdr_Org_Name',
    'Rndrng_Prvdr_State_Abrvtn',
    'Avg_Submtd_Cvrd_Chrg',
    'Avg_Tot_Pymt_Amt',
    'Avg_Mdcr_Pymt_Amt',
  ],
  provider_ownership: [
    'ORGANIZATION TYPE',
    'STATE',
    'ROLE TEXT',
    'ASSOCIATE NAME',
  ],
};

// Storage key for learned corrections
const LEARNED_MAPPINGS_KEY = 'caremetric_learned_column_mappings';

// Load learned corrections from localStorage
function getLearnedMappings() {
  try {
    const stored = localStorage.getItem(LEARNED_MAPPINGS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save a correction to localStorage
// Format: { [importType]: { [targetField]: csvColumnName } }
export function saveLearnedMapping(importType, targetField, csvColumn) {
  const learned = getLearnedMappings();
  if (!learned[importType]) learned[importType] = {};
  learned[importType][targetField] = csvColumn;
  try {
    localStorage.setItem(LEARNED_MAPPINGS_KEY, JSON.stringify(learned));
  } catch { /* quota exceeded, ignore */ }
}

// Fuzzy similarity score between two strings (0-1)
function similarity(a, b) {
  if (!a || !b) return 0;
  const sa = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (sa === sb) return 1;
  if (sa.includes(sb) || sb.includes(sa)) return 0.85;

  // Token overlap
  const tokensA = a.toLowerCase().split(/[\s_\-()]+/).filter(Boolean);
  const tokensB = b.toLowerCase().split(/[\s_\-()]+/).filter(Boolean);
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let overlap = 0;
  for (const t of setA) { if (setB.has(t)) overlap++; }
  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;
  return overlap / union;
}

// Find best CSV column match for a target field using fuzzy + learned corrections
function findBestMatch(targetField, csvColumns, importType) {
  // 1. Check learned corrections first (highest priority)
  const learned = getLearnedMappings();
  const learnedCol = learned[importType]?.[targetField];
  if (learnedCol && csvColumns.includes(learnedCol)) {
    return { column: learnedCol, confidence: 'learned', score: 1 };
  }

  // 2. Exact case-insensitive match
  const exact = csvColumns.find(c => c.toLowerCase().trim() === targetField.toLowerCase().trim());
  if (exact) return { column: exact, confidence: 'high', score: 1 };

  // 3. Fuzzy matching
  let bestCol = null;
  let bestScore = 0;
  for (const col of csvColumns) {
    const score = similarity(targetField, col);
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  if (bestScore >= 0.7) return { column: bestCol, confidence: 'high', score: bestScore };
  if (bestScore >= 0.4) return { column: bestCol, confidence: 'medium', score: bestScore };
  if (bestScore >= 0.2) return { column: bestCol, confidence: 'low', score: bestScore };
  return null;
}

// Use LLM for unmapped columns as a last resort
async function aiMapColumns(unmappedFields, csvColumns, importType, importName) {
  if (unmappedFields.length === 0) return {};

  const prompt = `You are a data mapping assistant for healthcare data imports.
  
Import type: ${importName} (${importType})

CSV columns available: ${csvColumns.join(', ')}

Target fields that need mapping: ${unmappedFields.join(', ')}

For each target field, find the best matching CSV column. Only map if you're confident.
Return a JSON object where keys are target field names and values are the matching CSV column names.
Only include mappings you're confident about. Omit any field you can't confidently map.`;

  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          mappings: {
            type: 'object',
            description: 'Map of target field name to CSV column name',
          },
        },
      },
    });
    return result?.mappings || {};
  } catch {
    return {};
  }
}

// Main AI mapping function
export async function generateAIMapping(csvColumns, requiredColumns, importType, importName) {
  const allOptional = OPTIONAL_COLUMNS[importType] || [];
  const allTargets = [...requiredColumns, ...allOptional];
  const usedCsvCols = new Set();

  const mapping = {}; // { targetField: csvColumn }
  const confidence = {}; // { targetField: 'high' | 'medium' | 'low' | 'learned' | 'ai' }
  const unmapped = [];

  // Phase 1: Fuzzy + learned matching for all fields
  for (const target of allTargets) {
    const match = findBestMatch(target, csvColumns, importType);
    if (match && !usedCsvCols.has(match.column)) {
      mapping[target] = match.column;
      confidence[target] = match.confidence;
      usedCsvCols.add(match.column);
    } else {
      unmapped.push(target);
    }
  }

  // Phase 2: LLM for remaining unmapped required columns
  const unmappedRequired = unmapped.filter(f => requiredColumns.includes(f));
  if (unmappedRequired.length > 0) {
    const availableCols = csvColumns.filter(c => !usedCsvCols.has(c));
    const aiMappings = await aiMapColumns(unmappedRequired, availableCols, importType, importName);
    for (const [field, col] of Object.entries(aiMappings)) {
      if (csvColumns.includes(col) && !usedCsvCols.has(col)) {
        mapping[field] = col;
        confidence[field] = 'ai';
        usedCsvCols.add(col);
      }
    }
  }

  // Phase 3: LLM for remaining unmapped optional columns (only if few remain)
  const unmappedOptional = allOptional.filter(f => !mapping[f]);
  if (unmappedOptional.length > 0 && unmappedOptional.length <= 15) {
    const availableCols = csvColumns.filter(c => !usedCsvCols.has(c));
    if (availableCols.length > 0) {
      const aiMappings = await aiMapColumns(unmappedOptional, availableCols, importType, importName);
      for (const [field, col] of Object.entries(aiMappings)) {
        if (csvColumns.includes(col) && !usedCsvCols.has(col)) {
          mapping[field] = col;
          confidence[field] = 'ai';
          usedCsvCols.add(col);
        }
      }
    }
  }

  return { mapping, confidence, optionalColumns: allOptional };
}

export { OPTIONAL_COLUMNS };