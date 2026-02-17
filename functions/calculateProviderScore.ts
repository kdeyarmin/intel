import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { npi } = await req.json();

    if (!npi) {
      return Response.json({ error: 'NPI required' }, { status: 400 });
    }

    // Fetch scoring rules
    const rules = await base44.entities.ScoringRule.filter({ enabled: true });
    
    // Fetch provider data
    const [provider] = await base44.entities.Provider.filter({ npi });
    if (!provider) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    const [utilization] = await base44.entities.CMSUtilization.filter({ npi });
    const [referrals] = await base44.entities.CMSReferral.filter({ npi });
    const locations = await base44.entities.ProviderLocation.filter({ npi });
    const taxonomies = await base44.entities.ProviderTaxonomy.filter({ npi });

    // Get weights from rules
    const getWeight = (category) => {
      const rule = rules.find(r => r.category === category);
      return rule ? rule.weight : 0;
    };

    // Calculate components
    const breakdown = {
      specialty_match: calculateSpecialtyMatch(taxonomies, getWeight('specialty')),
      medicare_status: calculateMedicareStatus(provider, getWeight('enrollment')),
      patient_volume: calculatePatientVolume(utilization, getWeight('volume')),
      referral_signals: calculateReferralSignals(referrals, getWeight('referrals')),
      group_size: calculateGroupSize(locations, getWeight('group_size')),
      geography: calculateGeography(locations, getWeight('geography')),
    };

    // Calculate total score
    const totalScore = Object.values(breakdown).reduce((sum, component) => 
      sum + component.contribution, 0
    );

    // Generate reasons
    const reasons = generateReasons(breakdown, utilization, referrals);

    // Save or update score
    const existingScores = await base44.entities.LeadScore.filter({ npi });
    const scoreData = {
      npi,
      score: Math.round(totalScore),
      score_date: new Date().toISOString(),
      score_breakdown: breakdown,
      reasons,
    };

    if (existingScores.length > 0) {
      await base44.entities.LeadScore.update(existingScores[0].id, scoreData);
    } else {
      await base44.entities.LeadScore.create(scoreData);
    }

    return Response.json({ 
      score: Math.round(totalScore),
      breakdown,
      reasons 
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function calculateSpecialtyMatch(taxonomies, weight) {
  const targetSpecialties = ['208D00000X', '163W00000X', '2084P0800X']; // Psychiatry, Nurse Practitioner, Behavioral Health
  const hasMatch = taxonomies.some(t => targetSpecialties.includes(t.taxonomy_code));
  const value = hasMatch ? 100 : 50;
  
  return {
    value,
    weight,
    contribution: (value / 100) * weight,
  };
}

function calculateMedicareStatus(provider, weight) {
  const isActive = provider.status === 'Active' && !provider.needs_nppes_enrichment;
  const value = isActive ? 100 : 30;
  
  return {
    value,
    weight,
    contribution: (value / 100) * weight,
  };
}

function calculatePatientVolume(utilization, weight) {
  if (!utilization || !utilization.total_medicare_beneficiaries) {
    return { value: 0, weight, contribution: 0 };
  }

  const beneficiaries = utilization.total_medicare_beneficiaries;
  let value = 0;
  
  if (beneficiaries >= 500) value = 100;
  else if (beneficiaries >= 250) value = 80;
  else if (beneficiaries >= 100) value = 60;
  else if (beneficiaries >= 50) value = 40;
  else value = 20;

  return {
    value,
    weight,
    contribution: (value / 100) * weight,
  };
}

function calculateReferralSignals(referrals, weight) {
  if (!referrals) {
    return { value: 0, weight, contribution: 0 };
  }

  const homeHealth = referrals.home_health_referrals || 0;
  const hospice = referrals.hospice_referrals || 0;
  const total = homeHealth + hospice;

  let value = 0;
  if (total >= 50) value = 100;
  else if (total >= 25) value = 80;
  else if (total >= 10) value = 60;
  else if (total >= 5) value = 40;
  else value = 20;

  return {
    value,
    weight,
    contribution: (value / 100) * weight,
  };
}

function calculateGroupSize(locations, weight) {
  const locationCount = locations.length;
  let value = 0;
  
  if (locationCount >= 5) value = 100;
  else if (locationCount >= 3) value = 80;
  else if (locationCount >= 2) value = 60;
  else value = 40;

  return {
    value,
    weight,
    contribution: (value / 100) * weight,
  };
}

function calculateGeography(locations, weight) {
  const priorityStates = ['CA', 'TX', 'FL', 'NY', 'PA'];
  const hasMatch = locations.some(l => priorityStates.includes(l.state));
  const value = hasMatch ? 100 : 50;

  return {
    value,
    weight,
    contribution: (value / 100) * weight,
  };
}

function generateReasons(breakdown, utilization, referrals) {
  const reasons = [];

  if (breakdown.patient_volume.value >= 80) {
    reasons.push(`High Medicare patient volume (${utilization?.total_medicare_beneficiaries || 0} beneficiaries)`);
  }

  if (breakdown.referral_signals.value >= 80) {
    const total = (referrals?.home_health_referrals || 0) + (referrals?.hospice_referrals || 0);
    reasons.push(`Strong referral activity (${total} home health/hospice referrals)`);
  }

  if (breakdown.specialty_match.value === 100) {
    reasons.push('Specialty aligns with target focus areas');
  }

  if (breakdown.geography.value === 100) {
    reasons.push('Located in priority geography');
  }

  if (breakdown.group_size.value >= 80) {
    reasons.push('Multi-location practice');
  }

  return reasons;
}