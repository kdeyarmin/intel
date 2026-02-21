import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ---- Static analysis helpers ----
const ROLE_BASED_PATTERNS = [
  'info', 'contact', 'support', 'help', 'sales', 'marketing', 'noreply',
  'no-reply', 'admin', 'postmaster', 'webmaster', 'hello', 'hi', 'office',
  'frontdesk', 'reception', 'billing', 'appointments', 'general'
];

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'mailinator.com',
  'sharklasers.com', 'yopmail.com', 'throwaway.email', 'maildrop.cc',
  'fakeinbox.com', 'tempmail.us', 'trashmail.com', 'spam4.me',
  'guerrillamailblock.com', 'grr.la', 'dispostable.com', 'mailnesia.com'
]);

const TYPO_MAP = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmil.com': 'gmail.com',
  'yahooo.com': 'yahoo.com', 'yahho.com': 'yahoo.com', 'yaho.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outllook.com': 'outlook.com',
};

const HEALTHCARE_DOMAINS = [
  '.edu', '.gov', '.org', 'hospital', 'health', 'medical', 'clinic',
  'medicine', 'care', 'physician', 'doctor', 'healthcare', 'pharma'
];

function validateFormat(email) {
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(email);
}

function isRoleBased(localPart) {
  const l = (localPart || '').toLowerCase();
  return ROLE_BASED_PATTERNS.some(p => l === p || l.startsWith(p + '.') || l.startsWith(p + '_') || l.startsWith(p + '-'));
}

function isDisposable(domain) {
  return DISPOSABLE_DOMAINS.has((domain || '').toLowerCase());
}

function detectTypo(domain) {
  const d = (domain || '').toLowerCase();
  return TYPO_MAP[d] || null;
}

function isHealthcareDomain(domain) {
  const d = (domain || '').toLowerCase();
  return HEALTHCARE_DOMAINS.some(h => d.includes(h));
}

async function checkMXRecords(domain) {
  // Use Google DNS-over-HTTPS to check MX records
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return { hasMX: null, records: [], error: 'DNS lookup failed' };
    const data = await resp.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      const mxRecords = data.Answer
        .filter(a => a.type === 15)
        .map(a => a.data)
        .filter(Boolean);
      return { hasMX: mxRecords.length > 0, records: mxRecords, error: null };
    }
    // No MX but check if there's an A record (some domains accept mail without MX)
    const aResp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
      signal: AbortSignal.timeout(5000)
    });
    const aData = await aResp.json();
    const hasA = aData.Status === 0 && aData.Answer && aData.Answer.length > 0;
    return { hasMX: false, hasARecord: hasA, records: [], error: null };
  } catch (e) {
    return { hasMX: null, records: [], error: e.message };
  }
}

function runStaticAnalysis(email) {
  const riskFlags = [];
  const reasons = [];
  let score = 100;

  if (!email || typeof email !== 'string') {
    return { score: 0, reasons: ['No email provided'], riskFlags: ['Missing email'], status: 'invalid', confidence: 'low' };
  }

  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx < 1) {
    return { score: 0, reasons: ['Invalid format'], riskFlags: ['Invalid format'], status: 'invalid', confidence: 'low' };
  }
  const localPart = trimmed.substring(0, atIdx);
  const domain = trimmed.substring(atIdx + 1);

  // Format
  if (!validateFormat(trimmed)) {
    score -= 50;
    riskFlags.push('Invalid format');
    reasons.push('Email format is invalid');
  }

  // Typo detection
  const typoSuggestion = detectTypo(domain);
  if (typoSuggestion) {
    score -= 40;
    riskFlags.push(`Possible typo: ${domain} → ${typoSuggestion}`);
    reasons.push(`Domain may be a typo for ${typoSuggestion}`);
  }

  // Disposable domain
  if (isDisposable(domain)) {
    score -= 60;
    riskFlags.push('Disposable/temporary domain');
    reasons.push('Uses a known disposable email service');
  }

  // Role-based
  if (isRoleBased(localPart)) {
    score -= 15; // Less penalty — practice emails are acceptable
    riskFlags.push('Role-based address');
    reasons.push(`Role-based email prefix (${localPart})`);
  }

  // Healthcare domain bonus
  if (isHealthcareDomain(domain)) {
    score += 10;
    reasons.push('Healthcare-related domain detected');
  }

  // .edu / .gov bonus
  if (domain.endsWith('.edu') || domain.endsWith('.gov')) {
    score += 15;
    reasons.push('Institutional domain (.edu/.gov)');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    riskFlags,
    localPart,
    domain,
    isRoleBased: isRoleBased(localPart),
    isDisposable: isDisposable(domain),
    hasTypo: !!typoSuggestion,
    typoSuggestion,
    isHealthcare: isHealthcareDomain(domain),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { provider_id, mode = 'single' } = await req.json();

    if (!provider_id) {
      return Response.json({ error: 'provider_id is required' }, { status: 400 });
    }

    const providers = await base44.asServiceRole.entities.Provider.filter({ id: provider_id });
    if (providers.length === 0) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    const provider = providers[0];
    if (!provider.email) {
      return Response.json({ success: false, message: 'Provider has no email to verify' });
    }

    const email = provider.email.trim().toLowerCase();

    // Phase 1: Static analysis
    const staticResult = runStaticAnalysis(email);

    // Phase 2: DNS/MX check
    const mxResult = await checkMXRecords(staticResult.domain);

    if (mxResult.hasMX === false && !mxResult.hasARecord) {
      staticResult.score -= 40;
      staticResult.riskFlags.push('No MX records found');
      staticResult.reasons.push('Domain has no mail exchange records — mail delivery unlikely');
    } else if (mxResult.hasMX === true) {
      staticResult.score += 10;
      staticResult.reasons.push(`Domain has valid MX records (${mxResult.records.length} found)`);
    } else if (mxResult.error) {
      staticResult.reasons.push('MX record lookup inconclusive');
    }

    // Phase 3: AI deliverability assessment
    const providerName = provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name || '';

    let aiAssessment = null;
    try {
      aiAssessment = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are an email deliverability expert. Assess this email address for a healthcare provider.

EMAIL: ${email}
PROVIDER: ${providerName} (NPI: ${provider.npi}, Credential: ${provider.credential || 'N/A'})
DOMAIN MX RECORDS: ${mxResult.hasMX ? 'Yes (' + mxResult.records.join(', ') + ')' : mxResult.hasMX === false ? 'No' : 'Unknown'}
STATIC FLAGS: ${staticResult.riskFlags.join(', ') || 'None'}
ORIGINAL SOURCE: ${provider.email_source || 'Unknown'}
ORIGINAL CONFIDENCE: ${provider.email_confidence || 'Unknown'}

Assess:
1. Is the email pattern consistent with the domain (e.g., first.last@hospital.org)?
2. Is the domain active and associated with a real organization?
3. Is this likely the correct email for this specific provider?
4. Any deliverability concerns (catch-all, bouncing, etc.)?

Be concise and factual.`,
        response_json_schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["valid", "risky", "invalid"] },
            deliverability_score: { type: "number" },
            pattern_match: { type: "boolean" },
            domain_active: { type: "boolean" },
            is_catch_all_likely: { type: "boolean" },
            provider_match_confidence: { type: "string", enum: ["high", "medium", "low"] },
            reasons: { type: "array", items: { type: "string" } },
            risk_factors: { type: "array", items: { type: "string" } },
            recommendation: { type: "string" }
          }
        }
      });
    } catch (e) {
      console.warn('AI assessment failed:', e.message);
    }

    // Compute final score blending static + AI
    let finalScore = staticResult.score;
    if (aiAssessment?.deliverability_score != null) {
      finalScore = Math.round(finalScore * 0.4 + aiAssessment.deliverability_score * 0.6);
    }
    finalScore = Math.max(0, Math.min(100, finalScore));

    // Determine final status
    let finalStatus = 'unknown';
    if (aiAssessment?.status) {
      finalStatus = aiAssessment.status;
    } else if (finalScore >= 70) {
      finalStatus = 'valid';
    } else if (finalScore >= 40) {
      finalStatus = 'risky';
    } else {
      finalStatus = 'invalid';
    }

    let finalConfidence = 'low';
    if (finalScore >= 75) finalConfidence = 'high';
    else if (finalScore >= 50) finalConfidence = 'medium';

    const allReasons = [
      ...staticResult.reasons,
      ...(aiAssessment?.reasons || []),
    ];
    const allRiskFlags = [
      ...staticResult.riskFlags,
      ...(aiAssessment?.risk_factors || []),
    ];

    // Update provider record
    await base44.asServiceRole.entities.Provider.update(provider_id, {
      email_validation_status: finalStatus,
      email_validation_reason: aiAssessment?.recommendation || allReasons.slice(0, 3).join('; '),
      email_quality_score: finalScore,
      email_quality_confidence: finalConfidence,
      email_quality_reasons: allReasons.slice(0, 10),
      email_quality_risk_flags: allRiskFlags.slice(0, 10),
      email_quality_analysis: {
        static: {
          score: staticResult.score,
          isRoleBased: staticResult.isRoleBased,
          isDisposable: staticResult.isDisposable,
          hasTypo: staticResult.hasTypo,
          typoSuggestion: staticResult.typoSuggestion,
          isHealthcare: staticResult.isHealthcare,
        },
        dns: {
          hasMX: mxResult.hasMX,
          mxCount: mxResult.records?.length || 0,
          error: mxResult.error,
        },
        ai: aiAssessment ? {
          status: aiAssessment.status,
          deliverability_score: aiAssessment.deliverability_score,
          pattern_match: aiAssessment.pattern_match,
          domain_active: aiAssessment.domain_active,
          is_catch_all_likely: aiAssessment.is_catch_all_likely,
          provider_match_confidence: aiAssessment.provider_match_confidence,
        } : null,
      },
      email_analyzed_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      email,
      status: finalStatus,
      score: finalScore,
      confidence: finalConfidence,
      reasons: allReasons,
      riskFlags: allRiskFlags,
      dns: { hasMX: mxResult.hasMX, mxCount: mxResult.records?.length || 0 },
      ai: aiAssessment,
      recommendation: aiAssessment?.recommendation || null,
    });

  } catch (error) {
    console.error('verifyProviderEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});