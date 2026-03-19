import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider_id, rule_ids = [], auto_fix = true } = await req.json();

    if (!provider_id) {
      return Response.json({ error: 'provider_id is required' }, { status: 400 });
    }

    // Fetch the provider
    const provider = await base44.entities.Provider.get(provider_id);
    if (!provider) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Fetch cleaning rules (all if not specified)
    let rules;
    if (rule_ids.length > 0) {
      rules = [];
      for (const ruleId of rule_ids) {
        const rule = await base44.entities.DataCleaningRule.get(ruleId);
        if (rule && rule.enabled) rules.push(rule);
      }
    } else {
      rules = await base44.entities.DataCleaningRule.filter({ enabled: true });
    }

    const changes = [];
    const flags = [];
    let updatedProvider = { ...provider };

    // Apply each rule
    for (const rule of rules) {
      const result = applyRule(rule, updatedProvider);

      if (result.changes.length > 0) {
        changes.push(...result.changes);
        if (rule.auto_fix && auto_fix) {
          updatedProvider = { ...updatedProvider, ...result.updates };
        }
      }

      if (result.flags.length > 0) {
        flags.push(...result.flags);
      }
    }

    // If there are changes and auto_fix is enabled, update the provider
    if (changes.length > 0 && auto_fix) {
      await base44.entities.Provider.update(provider_id, {
        ...Object.fromEntries(changes.map(c => [c.field, c.new_value]))
      });
    }

    return Response.json({
      success: true,
      provider_id,
      changes_found: changes.length,
      flags_found: flags.length,
      auto_fixed: auto_fix,
      changes: changes.map(c => ({
        field: c.field,
        old_value: c.old_value,
        new_value: c.new_value,
        rule: c.rule
      })),
      flags: flags.map(f => ({
        field: f.field,
        issue: f.issue,
        severity: f.severity,
        suggestion: f.suggestion
      })),
      message: `Found ${changes.length} changes and ${flags.length} flags${auto_fix ? ' (applied)' : ' (review needed)'}`
    });
  } catch (error) {
    console.error('Data cleaning error:', error);
    return Response.json(
      { error: error.message || 'Data cleaning failed' },
      { status: 500 }
    );
  }
});

function applyRule(rule, provider) {
  const changes = [];
  const flags = [];
  const updates = {};

  const field = rule.target_field;
  const fieldValue = provider[field];

  if (!fieldValue) return { changes, flags, updates };

  switch (rule.rule_type) {
    case 'format_standardization':
      const standardized = standardizeFormat(field, fieldValue);
      if (standardized !== fieldValue) {
        changes.push({
          field,
          old_value: fieldValue,
          new_value: standardized,
          rule: rule.rule_name
        });
        updates[field] = standardized;
      }
      break;

    case 'typo_correction':
      if (rule.typo_map) {
        let corrected = fieldValue;
        for (const [typo, correction] of Object.entries(rule.typo_map)) {
          const regex = new RegExp(`\\b${typo}\\b`, 'gi');
          if (regex.test(corrected)) {
            corrected = corrected.replace(regex, correction);
          }
        }
        if (corrected !== fieldValue) {
          changes.push({
            field,
            old_value: fieldValue,
            new_value: corrected,
            rule: rule.rule_name
          });
          updates[field] = corrected;
        }
      }
      break;

    case 'pattern_validation':
      if (rule.pattern) {
        const regex = new RegExp(rule.pattern);
        if (!regex.test(fieldValue)) {
          flags.push({
            field,
            issue: `Value does not match expected pattern: ${rule.pattern}`,
            severity: rule.severity,
            suggestion: rule.description
          });
        }
      }
      break;

    case 'consistency_check':
      const inconsistencies = checkConsistency(field, fieldValue, provider, rule);
      if (inconsistencies.length > 0) {
        inconsistencies.forEach(inc => {
          flags.push({
            field,
            issue: inc.issue,
            severity: rule.severity,
            suggestion: inc.suggestion
          });
        });
      }
      break;
  }

  return { changes, flags, updates };
}

function standardizeFormat(field, value) {
  if (!value) return value;

  switch (field.toLowerCase()) {
    case 'cell_phone':
    case 'phone':
      return standardizePhone(value);
    case 'email':
      return value.toLowerCase().trim();
    case 'state':
      return value.toUpperCase().trim();
    case 'zip':
      return value.replace(/\D/g, '').slice(0, 5);
    case 'organization_name':
      return value.trim().replace(/\s+/g, ' ');
    default:
      return value.trim();
  }
}

function standardizePhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

function checkConsistency(field, value, provider, rule) {
  const issues = [];

  if (field === 'email' && value) {
    // Email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      issues.push({
        issue: 'Email format is invalid',
        suggestion: 'Provide a valid email address'
      });
    }

    // Check if organization email domain matches organization name
    if (provider.organization_name && value) {
      const domain = value.split('@')[1]?.toLowerCase();
      const orgWords = provider.organization_name.toLowerCase().split(/\s+/);
      const hasDomainMatch = orgWords.some(word => domain?.includes(word));
      if (!hasDomainMatch && provider.entity_type === 'Organization') {
        issues.push({
          issue: 'Email domain may not match organization name',
          suggestion: `Expected domain related to "${provider.organization_name}"`
        });
      }
    }
  }

  if (field === 'first_name' && provider.entity_type === 'Individual') {
    if (!provider.last_name) {
      issues.push({
        issue: 'First name exists but last name is missing',
        suggestion: 'Provide a last name for individual providers'
      });
    }
  }

  if (field === 'credential' && provider.entity_type === 'Individual') {
    const validCredentials = ['MD', 'DO', 'NP', 'PA', 'DPM', 'DVM', 'RN', 'PT', 'OD', 'DDS'];
    const hasValidCredential = validCredentials.some(cred => 
      value.toUpperCase().includes(cred)
    );
    if (!hasValidCredential) {
      issues.push({
        issue: `Credential "${value}" not recognized`,
        suggestion: `Common credentials: ${validCredentials.join(', ')}`
      });
    }
  }

  return issues;
}