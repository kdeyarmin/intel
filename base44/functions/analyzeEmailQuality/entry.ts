import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const ROLE_BASED_PATTERNS = [
  'info', 'contact', 'support', 'help', 'sales', 'marketing', 'noreply', 
  'no-reply', 'admin', 'postmaster', 'webmaster', 'hello', 'hi'
];

const SPAM_DOMAINS = new Set([
  'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'mailinator.com',
  'sharklasers.com', 'yopmail.com', 'throwaway.email', 'maildrop.cc',
  'fakeinbox.com', 'tempmail.us', 'trashmail.com', 'spam4.me'
]);

const TYPO_PATTERNS = {
  'gmial': 'gmail',
  'gmai': 'gmail',
  'yahooo': 'yahoo',
  'yahho': 'yahoo',
  'hotmial': 'hotmail',
  'outlok': 'outlook',
  'aol.co': 'aol.com',
};

const REPUTABLE_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'protonmail.com', 'icloud.com', 'mail.com', 'zoho.com'
]);

function checkRoleBasedEmail(localPart) {
  const lower = (localPart || '').toLowerCase();
  for (const pattern of ROLE_BASED_PATTERNS) {
    if (lower === pattern || lower.includes(`${pattern}_`) || lower.includes(`${pattern}.`)) {
      return true;
    }
  }
  return false;
}

function checkCommonTypos(domain) {
  const lower = (domain || '').toLowerCase();
  for (const [typo, correct] of Object.entries(TYPO_PATTERNS)) {
    if (lower.includes(typo)) {
      return { detected: true, suggestion: correct, typo };
    }
  }
  return { detected: false };
}

function isReputableDomain(domain) {
  return REPUTABLE_DOMAINS.has((domain || '').toLowerCase());
}

function isSpamDomain(domain) {
  return SPAM_DOMAINS.has((domain || '').toLowerCase());
}

function validateEmailFormat(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function analyzeEmail(email) {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      confidence: 'low',
      score: 0,
      reasons: ['Invalid email format'],
      riskFlags: ['Invalid email'],
      analysis: {}
    };
  }

  const emailLower = email.toLowerCase().trim();
  if (!emailLower.includes('@')) {
    return {
      isValid: false,
      confidence: 'low',
      score: 0,
      reasons: ['Missing @ symbol'],
      riskFlags: ['Invalid email'],
      analysis: {}
    };
  }
  const [localPart, domain] = emailLower.split('@');

  const analysis = {
    format: validateEmailFormat(email),
    isRoleBased: false,
    hasTypo: false,
    isSpamDomain: false,
    isReputable: false,
  };

  let score = 100;
  const reasons = [];
  const riskFlags = [];

  // Format validation
  if (!analysis.format) {
    score -= 50;
    reasons.push('Invalid email format');
    riskFlags.push('Invalid format');
  }

  // Check for role-based emails
  analysis.isRoleBased = checkRoleBasedEmail(localPart);
  if (analysis.isRoleBased) {
    score -= 25;
    reasons.push(`Role-based email (${localPart})`);
    riskFlags.push('Role-based email');
  }

  // Check for typos
  const typoCheck = checkCommonTypos(domain || '');
  if (typoCheck.detected) {
    analysis.hasTypo = true;
    score -= 40;
    reasons.push(`Possible typo: "${typoCheck.typo}" should be "${typoCheck.suggestion}"`);
    riskFlags.push(`Potential typo: ${typoCheck.typo} → ${typoCheck.suggestion}`);
  }

  // Check domain reputation
  analysis.isSpamDomain = isSpamDomain(domain);
  if (analysis.isSpamDomain) {
    score -= 60;
    reasons.push('Known disposable/spam domain');
    riskFlags.push('Spam or disposable domain');
  }

  analysis.isReputable = isReputableDomain(domain);
  if (analysis.isReputable) {
    score += 20;
    reasons.push('Uses reputable domain');
  } else if (!analysis.isSpamDomain && domain) {
    reasons.push('Personal or corporate domain');
  }

  // Determine confidence level
  let confidence = 'low';
  if (score >= 75) {
    confidence = 'high';
  } else if (score >= 50) {
    confidence = 'medium';
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    isValid: analysis.format && !analysis.hasTypo && !analysis.isSpamDomain,
    confidence,
    score: finalScore,
    reasons,
    riskFlags: riskFlags.length > 0 ? riskFlags : [],
    analysis,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emails } = await req.json();

    if (!Array.isArray(emails)) {
      return Response.json({ error: 'emails must be an array' }, { status: 400 });
    }

    const results = emails.map(email => ({
      email,
      ...analyzeEmail(email),
    }));

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});