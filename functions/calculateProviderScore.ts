import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

type ScoreBreakdown = Record<string, {
  value: number;
  weight: number;
  contribution: number;
}>;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { npi } = await req.json();

    if (!npi) {
      return Response.json({ error: 'NPI required' }, { status: 400 });
    }

    const [provider] = await base44.asServiceRole.entities.Provider.filter({ npi });
    if (!provider) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    const [taxonomies, utilizations, locations, scoringRules] = await Promise.all([
      base44.asServiceRole.entities.ProviderTaxonomy.filter({ npi }),
      base44.asServiceRole.entities.CMSUtilization.filter({ npi }),
      base44.asServiceRole.entities.ProviderLocation.filter({ npi }),
      base44.asServiceRole.entities.ScoringRule.filter({ enabled: true })
    ]);

    const utilization = utilizations[0];
    const primaryTaxonomy = taxonomies.find(t => t.primary_flag) || taxonomies[0];
    const primaryLocation = locations.find(l => l.is_primary) || locations[0];

    const DEFAULT_WEIGHTS: Record<string, number> = {
      specialty_match: 0.20, medicare_participation: 0.15, patient_volume: 0.20,
      service_intensity: 0.15, geographic_priority: 0.10, practice_type: 0.10,
      behavioral_health: 0.10
    };
    const weights: Record<string, number> = { ...DEFAULT_WEIGHTS };
    scoringRules.forEach(rule => {
      weights[rule.category] = rule.weight / 100;
    });

    const scores: Record<string, number> = {};
    const reasons = [];

    // 1. Specialty Match (20%)
    const targetSpecialties = ['family medicine', 'internal medicine', 'nurse practitioner', 'geriatric', 'psychiatry'];
    const taxonomyDesc = (primaryTaxonomy?.taxonomy_description || '').toLowerCase();
    const specialtyMatch = targetSpecialties.some(s => taxonomyDesc.includes(s));
    scores.specialty_match = specialtyMatch ? 100 : 40;
    if (specialtyMatch && primaryTaxonomy) {
      reasons.push(`Primary specialty (${primaryTaxonomy.taxonomy_description}) aligns with target profile`);
    }

    // 2. Medicare Participation (15%)
    const hasMedicareData = !!utilization;
    scores.medicare_participation = hasMedicareData ? 100 : 0;
    if (hasMedicareData) {
      reasons.push('Active Medicare participation confirmed');
    }

    // 3. Patient Volume (20%)
    const patientVolume = utilization?.total_medicare_beneficiaries || 0;
    let volumeScore = 0;
    if (patientVolume >= 500) {
      volumeScore = 100;
      reasons.push(`High patient volume (${patientVolume} Medicare beneficiaries)`);
    } else if (patientVolume >= 200) {
      volumeScore = 75;
      reasons.push(`Moderate patient volume (${patientVolume} beneficiaries)`);
    } else if (patientVolume >= 50) {
      volumeScore = 50;
    } else if (patientVolume > 0) {
      volumeScore = 25;
    }
    scores.patient_volume = volumeScore;

    // 4. Service Intensity (15%)
    const servicesPerPatient = patientVolume > 0 
      ? (utilization?.total_services || 0) / patientVolume 
      : 0;
    let serviceIntensityScore = 0;
    if (servicesPerPatient >= 12) {
      serviceIntensityScore = 100;
      reasons.push('High service intensity indicates complex care management');
    } else if (servicesPerPatient >= 8) {
      serviceIntensityScore = 70;
    } else if (servicesPerPatient >= 4) {
      serviceIntensityScore = 40;
    }
    scores.service_intensity = serviceIntensityScore;

    // 5. Geographic Priority (10%)
    const targetState = (scoringRules.find(r => r.category === 'geographic_priority')?.config?.target_state || 'PA').toUpperCase().trim();
    const isTargetState = primaryLocation?.state?.toUpperCase().trim() === targetState;
    scores.geographic_priority = isTargetState ? 100 : (primaryLocation ? 20 : 0);
    if (isTargetState && primaryLocation) {
      reasons.push(`Located in ${primaryLocation.state} (${primaryLocation.city || 'unknown city'})`);
    }

    // 6. Practice Type (10%)
    const locationCount = locations.length;
    let practiceScore = 0;
    if (locationCount === 1) {
      practiceScore = 100;
      reasons.push('Solo practice or single location');
    } else if (locationCount <= 3) {
      practiceScore = 80;
      reasons.push('Small group practice');
    } else if (locationCount <= 5) {
      practiceScore = 60;
    } else {
      practiceScore = 30;
    }
    scores.practice_type = practiceScore;

    // 7. Behavioral Health Referral Potential (10%)
    const behavioralSpecialties = ['psychiatry', 'psychology', 'behavioral health', 'mental health'];
    const isBehavioral = behavioralSpecialties.some(s => taxonomyDesc.includes(s));
    scores.behavioral_health = isBehavioral ? 100 : 50;
    if (isBehavioral) {
      reasons.push('Behavioral health specialty increases referral potential');
    }

    // Calculate weighted final score
    let finalScore = 0;
    const breakdown: ScoreBreakdown = {};

    Object.keys(scores).forEach(category => {
      const weight = weights[category] || 0;
      const contribution = (scores[category] * weight);
      finalScore += contribution;
      breakdown[category] = {
        value: scores[category],
        weight: weight * 100,
        contribution: Math.round(contribution)
      };
    });

    finalScore = Math.round(finalScore);

    const existingScores = await base44.asServiceRole.entities.LeadScore.filter({ npi });
    const scoreData = {
      npi,
      score: finalScore,
      score_date: new Date().toISOString(),
      score_breakdown: breakdown,
      reasons
    };

    if (existingScores.length > 0) {
      await base44.asServiceRole.entities.LeadScore.update(existingScores[0].id, scoreData);
    } else {
      await base44.asServiceRole.entities.LeadScore.create(scoreData);
    }

    return Response.json({
      success: true,
      npi,
      score: finalScore,
      breakdown,
      reasons
    });

  } catch (error) {
    console.error('Score calculation error:', error);
    return Response.json({ 
      error: 'Failed to calculate score', 
      details: error.message 
    }, { status: 500 });
  }
});
