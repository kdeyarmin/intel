import { base44 } from '@/api/base44Client';

// =======================================
// KNOWN ALIASES: Common CSV column names for healthcare datasets
// These are hand-curated mappings for NPPES, CMS, and related files.
// =======================================
const KNOWN_ALIASES = {
  // NPPES fields
  'NPI': ['npi', 'npi number', 'national provider identifier', 'npinumber', 'provider npi'],
  'Entity Type Code': ['entity type code', 'entity_type_code', 'entitytypecode', 'entity type', 'enumeration_type'],
  'Provider First Name': ['provider first name', 'first_name', 'firstname', 'first name', 'provider_first_name', 'prvdr_first_name', 'rndrng_prvdr_first_name'],
  'Provider Last Name (Legal Name)': ['provider last name (legal name)', 'last_name', 'lastname', 'last name', 'provider_last_name', 'provider last name', 'prvdr_last_name', 'rndrng_prvdr_last_org_name'],
  'Provider Middle Name': ['provider middle name', 'middle_name', 'middlename', 'middle name'],
  'Provider Credential Text': ['provider credential text', 'credential', 'credentials', 'credential_text'],
  'Provider Gender Code': ['provider gender code', 'gender', 'gender_code', 'sex'],
  'Provider Organization Name (Legal Business Name)': ['provider organization name (legal business name)', 'organization_name', 'org_name', 'organization name', 'legal business name', 'business name'],
  'Provider Enumeration Date': ['provider enumeration date', 'enumeration_date', 'enumeration date'],
  'Last Update Date': ['last update date', 'last_update_date', 'last updated', 'updated_date'],
  'NPI Deactivation Date': ['npi deactivation date', 'deactivation_date', 'deactivation date'],
  // CMS Utilization
  'Year': ['year', 'data_year', 'yr', 'rndrng_prvdr_yr'],
  'Total Services': ['total services', 'tot_srvcs', 'total_services', 'tot_srvc_cnt'],
  'Total Medicare Beneficiaries': ['total medicare beneficiaries', 'tot_benes', 'total_benes', 'tot_medicare_benes', 'total beneficiaries'],
  'Total Medicare Payment Amount': ['total medicare payment amount', 'tot_mdcr_pymt_amt', 'total_medicare_payment', 'total payment'],
  'Total Submitted Charges': ['total submitted charges', 'tot_sbmtd_chrgs', 'total_submitted_charges', 'submitted charges'],
  'Total Medicare Allowed Amount': ['total medicare allowed amount', 'tot_mdcr_alowd_amt', 'total_allowed_amount', 'allowed amount'],
  // CMS Referrals
  'HHA': ['hha', 'home_health_referrals', 'home health', 'hh_referrals'],
  'HOSPICE': ['hospice', 'hospice_referrals'],
  'DME': ['dme', 'dme_referrals', 'durable medical equipment'],
  'Total Referrals': ['total referrals', 'total_referrals', 'tot_referrals'],
  'SNF': ['snf', 'snf_referrals', 'skilled nursing facility'],
  // CMS Part D
  'Total 30-Day Fill Count': ['total 30-day fill count', 'tot_30day_fill_cnt', 'total_30day_fills', 'fill count'],
  'Total Day Supply': ['total day supply', 'tot_day_suply', 'total_day_supply', 'day supply'],
  'Brand Drug Cost': ['brand drug cost', 'brnd_drug_tot_cost', 'brand_cost', 'brand cost'],
  'Generic Drug Cost': ['generic drug cost', 'gnrc_drug_tot_cost', 'generic_cost', 'generic cost'],
  'Specialty Description': ['specialty description', 'specialty_description', 'specialty', 'provider type', 'rndrng_prvdr_type'],
  // Provider service utilization
  'HCPCS_Cd': ['hcpcs_cd', 'hcpcs code', 'hcpcs', 'procedure code', 'cpt code'],
  'HCPCS_Desc': ['hcpcs_desc', 'hcpcs description', 'hcpcs desc', 'procedure description'],
  'Tot_Benes': ['tot_benes', 'total beneficiaries', 'total_beneficiaries', 'beneficiaries'],
  'Tot_Srvcs': ['tot_srvcs', 'total services', 'total_services', 'services'],
  'Rndrng_NPI': ['rndrng_npi', 'rendering npi', 'npi'],
  // Enrollment fields
  'ENROLLMENT ID': ['enrollment id', 'enrollment_id', 'enrl_id', 'id'],
  'CCN': ['ccn', 'cms_certification_number', 'certification number', 'provider number'],
  'ORGANIZATION NAME': ['organization name', 'org_name', 'organization_name', 'provider name', 'facility name'],
  // Location fields
  'Provider Business Mailing Address Street 1': ['provider business mailing address street 1', 'mailing_address_1', 'mailing address', 'address line 1'],
  'Provider Business Mailing Address City Name': ['provider business mailing address city name', 'mailing_city', 'city'],
  'Provider Business Mailing Address State Name': ['provider business mailing address state name', 'mailing_state', 'state'],
  'Provider Business Mailing Address Postal Code': ['provider business mailing address postal code', 'mailing_zip', 'postal code', 'zip code', 'zip'],
  'Provider Business Practice Location Telephone Number': ['provider business practice location telephone number', 'phone', 'telephone', 'phone number'],
  'Provider Business Practice Location Fax Number': ['provider business practice location fax number', 'fax', 'fax number'],
  'Healthcare Provider Taxonomy Code_1': ['healthcare provider taxonomy code_1', 'taxonomy_code', 'taxonomy code', 'taxonomy_1', 'primary taxonomy'],
  // PDGM / Inpatient
  'PRVDR_NAME': ['prvdr_name', 'provider name', 'facility name'],
  'PRVDR_STATE': ['prvdr_state', 'provider state', 'state'],
  'TOT_EPSD_CNT': ['tot_epsd_cnt', 'total episodes', 'episode count'],
  'AVG_HH_CHRG_AMT': ['avg_hh_chrg_amt', 'average charge', 'avg charge'],
  'AVG_HH_MDCR_PYMT_AMT': ['avg_hh_mdcr_pymt_amt', 'average payment', 'avg payment'],
  'Rndrng_Prvdr_Org_Name': ['rndrng_prvdr_org_name', 'provider org name', 'organization name', 'hospital name'],
  'Rndrng_Prvdr_State_Abrvtn': ['rndrng_prvdr_state_abrvtn', 'state', 'provider state'],
  'Avg_Submtd_Cvrd_Chrg': ['avg_submtd_cvrd_chrg', 'average charge', 'avg covered charge'],
  'Avg_Tot_Pymt_Amt': ['avg_tot_pymt_amt', 'average total payment', 'avg payment'],
  'Avg_Mdcr_Pymt_Amt': ['avg_mdcr_pymt_amt', 'average medicare payment', 'avg medicare payment'],
};

// Optional columns per import type
const OPTIONAL_COLUMNS = {
  nppes_monthly: [
    'Provider Middle Name', 'Provider Credential Text', 'Provider Gender Code',
    'Provider Organization Name (Legal Business Name)', 'Provider Enumeration Date',
    'Last Update Date', 'NPI Deactivation Date',
    'Provider Business Mailing Address Street 1', 'Provider Business Mailing Address City Name',
    'Provider Business Mailing Address State Name', 'Provider Business Mailing Address Postal Code',
    'Provider Business Practice Location Telephone Number', 'Provider Business Practice Location Fax Number',
    'Healthcare Provider Taxonomy Code_1',
  ],
  cms_utilization: ['Total Submitted Charges', 'Total Medicare Allowed Amount', 'Drug Services', 'Provider Type', 'Provider State'],
  cms_part_d: ['Provider Last Name', 'Provider First Name', 'Provider State', 'Specialty Description', 'Total 30-Day Fill Count', 'Total Day Supply', 'Brand Drug Cost', 'Generic Drug Cost'],
  cms_order_referring: ['LAST_NAME', 'FIRST_NAME', 'Year', 'SNF', 'PMD', 'Total Referrals'],
  pa_home_health: ['Address', 'Zip', 'Phone', 'County'],
  hospice_providers: ['Address', 'Zip', 'Phone', 'County'],
  nursing_home_chains: ['Number of states', 'Average health inspection rating', 'Average staffing rating', 'Average quality rating', 'Total fines amount'],
  hospice_enrollments: ['DOING BUSINESS AS', 'CITY', 'STATE', 'ZIP', 'INCORPORATION STATE', 'PROPRIETARY NONPROFIT'],
  home_health_enrollments: ['DOING BUSINESS AS', 'CITY', 'STATE', 'ZIP', 'INCORPORATION STATE', 'PROPRIETARY NONPROFIT', 'PRACTICE LOCATION TYPE'],
  home_health_cost_reports: ['City', 'State', 'Zip Code', 'Total Revenue', 'Total Visits', 'Net Income'],
  cms_service_utilization: ['Tot_Srvcs', 'Tot_Sbmtd_Chrgs', 'Tot_Mdcr_Alowd_Amt', 'Tot_Mdcr_Pymt_Amt'],
  provider_service_utilization: ['Tot_Srvcs', 'Avg_Sbmtd_Chrg', 'Avg_Mdcr_Alowd_Amt', 'Avg_Mdcr_Pymt_Amt', 'Rndrng_Prvdr_Last_Org_Name', 'Rndrng_Prvdr_State_Abrvtn'],
  home_health_pdgm: ['PRVDR_NAME', 'PRVDR_STATE', 'TOT_EPSD_CNT', 'AVG_HH_CHRG_AMT', 'AVG_HH_MDCR_PYMT_AMT'],
  inpatient_drg: ['Rndrng_Prvdr_Org_Name', 'Rndrng_Prvdr_State_Abrvtn', 'Avg_Submtd_Cvrd_Chrg', 'Avg_Tot_Pymt_Amt', 'Avg_Mdcr_Pymt_Amt'],
  provider_ownership: ['ORGANIZATION TYPE', 'STATE', 'ROLE TEXT', 'ASSOCIATE NAME'],
};

// =======================================
// LEARNED MAPPINGS CACHE
// Loaded once per session from ColumnMappingRule entity, updated on corrections
// =======================================
let _learnedCache = null;
let _learnedCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function loadLearnedMappings() {
  if (_learnedCache && (Date.now() - _learnedCacheTime < CACHE_TTL)) return _learnedCache;
  try {
    const rules = await base44.entities.ColumnMappingRule.list('-times_used', 500);
    const map = {};
    for (const rule of rules) {
      const key = `${rule.import_type}::${rule.target_field}`;
      if (!map[key] || rule.times_used > map[key].times_used) {
        map[key] = rule;
      }
    }
    _learnedCache = map;
    _learnedCacheTime = Date.now();
    return map;
  } catch {
    return _learnedCache || {};
  }
}

// Save a user correction — persist to entity and update cache
export async function saveLearnedMapping(importType, targetField, csvColumn) {
  if (!importType || !targetField || !csvColumn) return;
  try {
    // Check if rule already exists
    const existing = await base44.entities.ColumnMappingRule.filter({
      import_type: importType,
      target_field: targetField,
    });

    const matchingRule = existing.find(r => r.csv_column === csvColumn);
    if (matchingRule) {
      // Increment usage count
      await base44.entities.ColumnMappingRule.update(matchingRule.id, {
        times_used: (matchingRule.times_used || 1) + 1,
        last_used_at: new Date().toISOString(),
        source: 'confirmed',
      });
    } else {
      // Create new rule (and demote old one if exists for same target)
      await base44.entities.ColumnMappingRule.create({
        import_type: importType,
        target_field: targetField,
        csv_column: csvColumn,
        times_used: 1,
        last_used_at: new Date().toISOString(),
        source: 'user_correction',
      });
    }
    // Invalidate cache
    _learnedCache = null;
  } catch (e) {
    console.warn('[LearnedMapping] Failed to save:', e.message);
    // Fallback to localStorage
    try {
      const key = 'caremetric_learned_column_mappings';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (!stored[importType]) stored[importType] = {};
      stored[importType][targetField] = csvColumn;
      localStorage.setItem(key, JSON.stringify(stored));
    } catch { /* ignore */ }
  }
}

// =======================================
// SCORING ENGINE
// Returns a numeric confidence score (0-100) and a tier label
// =======================================

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(str) {
  return (str || '').toLowerCase().split(/[\s_\-.()/]+/).filter(Boolean);
}

function tokenOverlap(a, b) {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) { if (tokB.has(t)) overlap++; }
  return overlap / Math.max(tokA.size, tokB.size);
}

function scorePair(targetField, csvColumn) {
  const nTarget = normalize(targetField);
  const nCsv = normalize(csvColumn);

  // Exact match
  if (nTarget === nCsv) return 100;

  // Known alias match
  const aliases = KNOWN_ALIASES[targetField];
  if (aliases) {
    for (const alias of aliases) {
      if (normalize(alias) === nCsv) return 97;
    }
    // Partial alias match
    for (const alias of aliases) {
      if (nCsv.includes(normalize(alias)) || normalize(alias).includes(nCsv)) return 88;
    }
  }

  // Substring containment
  if (nTarget.includes(nCsv) || nCsv.includes(nTarget)) {
    const ratio = Math.min(nTarget.length, nCsv.length) / Math.max(nTarget.length, nCsv.length);
    return Math.round(70 + ratio * 20);
  }

  // Token overlap
  const overlap = tokenOverlap(targetField, csvColumn);
  if (overlap >= 0.8) return 85;
  if (overlap >= 0.5) return 65;
  if (overlap >= 0.3) return 45;

  return Math.round(overlap * 100);
}

function scoreTier(score) {
  if (score >= 95) return 'exact';
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  if (score >= 30) return 'low';
  return 'none';
}

// =======================================
// MAIN AI MAPPING FUNCTION
// Multi-phase: Learned → Known Aliases → Fuzzy → LLM fallback
// =======================================

export async function generateAIMapping(csvColumns, requiredColumns, importType, importName) {
  const allOptional = OPTIONAL_COLUMNS[importType] || [];
  const allTargets = [...requiredColumns, ...allOptional];
  const usedCsvCols = new Set();
  const mapping = {};
  const confidence = {};
  const scores = {};

  // Phase 1: Load learned mappings from entity
  const learned = await loadLearnedMappings();

  for (const target of allTargets) {
    const key = `${importType}::${target}`;
    const rule = learned[key];
    if (rule && csvColumns.includes(rule.csv_column) && !usedCsvCols.has(rule.csv_column)) {
      mapping[target] = rule.csv_column;
      confidence[target] = 'learned';
      scores[target] = 99;
      usedCsvCols.add(rule.csv_column);
    }
  }

  // Phase 2: Known aliases + fuzzy scoring for remaining
  const unmappedAfterLearned = allTargets.filter(t => !mapping[t]);

  for (const target of unmappedAfterLearned) {
    let bestCol = null;
    let bestScore = 0;

    for (const col of csvColumns) {
      if (usedCsvCols.has(col)) continue;
      const s = scorePair(target, col);
      if (s > bestScore) {
        bestScore = s;
        bestCol = col;
      }
    }

    if (bestScore >= 30 && bestCol) {
      mapping[target] = bestCol;
      const tier = scoreTier(bestScore);
      confidence[target] = tier === 'exact' ? 'high' : tier;
      scores[target] = bestScore;
      usedCsvCols.add(bestCol);
    }
  }

  // Phase 3: LLM fallback for unmapped required columns
  const unmappedRequired = requiredColumns.filter(f => !mapping[f]);
  if (unmappedRequired.length > 0) {
    const availableCols = csvColumns.filter(c => !usedCsvCols.has(c));
    if (availableCols.length > 0) {
      const aiMappings = await aiMapColumns(unmappedRequired, availableCols, importType, importName);
      for (const [field, col] of Object.entries(aiMappings)) {
        if (csvColumns.includes(col) && !usedCsvCols.has(col)) {
          mapping[field] = col;
          confidence[field] = 'ai';
          scores[field] = 60;
          usedCsvCols.add(col);
        }
      }
    }
  }

  // Phase 4: LLM for remaining unmapped optional (if few remain)
  const unmappedOptional = allOptional.filter(f => !mapping[f]);
  if (unmappedOptional.length > 0 && unmappedOptional.length <= 15) {
    const availableCols = csvColumns.filter(c => !usedCsvCols.has(c));
    if (availableCols.length > 0) {
      const aiMappings = await aiMapColumns(unmappedOptional, availableCols, importType, importName);
      for (const [field, col] of Object.entries(aiMappings)) {
        if (csvColumns.includes(col) && !usedCsvCols.has(col)) {
          mapping[field] = col;
          confidence[field] = 'ai';
          scores[field] = 55;
          usedCsvCols.add(col);
        }
      }
    }
  }

  return { mapping, confidence, scores, optionalColumns: allOptional };
}

// LLM fallback for hard-to-match columns
async function aiMapColumns(unmappedFields, csvColumns, importType, importName) {
  if (unmappedFields.length === 0) return {};

  const prompt = `You are a data mapping assistant for healthcare data imports (NPPES, CMS, Medicare).

Import type: ${importName} (${importType})

CSV columns available: ${csvColumns.join(', ')}

Target fields that need mapping: ${unmappedFields.join(', ')}

For each target field, find the best matching CSV column. Consider common healthcare abbreviations like:
- Rndrng = Rendering, Prvdr = Provider, Benes = Beneficiaries, Srvcs = Services
- Sbmtd = Submitted, Chrgs = Charges, Mdcr = Medicare, Alowd = Allowed, Pymt = Payment
- Tot = Total, Avg = Average, Amt = Amount, Cnt = Count

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

export { OPTIONAL_COLUMNS };