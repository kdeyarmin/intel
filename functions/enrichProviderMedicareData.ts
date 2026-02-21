import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MEDICARE_API_URL = 'https://compare.cms.gov/api/v1/Measure/getProviderData';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { npi, provider_id, limit = 100 } = body;

    if (!npi && !provider_id) {
      return Response.json({ error: 'NPI or Provider ID required' }, { status: 400 });
    }

    // Fetch from Medicare Provider Compare API
    const params = new URLSearchParams();
    if (provider_id) params.append('ProviderId', provider_id);
    if (npi) params.append('NPI', npi);

    const response = await fetch(`${MEDICARE_API_URL}?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CareMetric-Enrichment/1.0'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return Response.json({
        success: false,
        message: 'Medicare Provider Compare API unavailable',
        status: response.status
      });
    }

    const medicareData = await response.json();

    if (!medicareData || Object.keys(medicareData).length === 0) {
      return Response.json({
        success: false,
        message: 'No Medicare data found for this provider',
        npi: npi
      });
    }

    // Extract and structure quality metrics
    const enrichedData = {
      npi: npi,
      provider_name: medicareData.ProviderName || '',
      medicare_id: medicareData.ProviderId || provider_id,
      quality_score: extractScore(medicareData, 'SafetyScore'),
      safety_score: extractScore(medicareData, 'SafetyScore'),
      timeliness_score: extractScore(medicareData, 'TimelinessScore'),
      cost_score: extractScore(medicareData, 'CostScore'),
      readmission_rate: extractNumeric(medicareData, 'ReadmissionRate'),
      mortality_rate: extractNumeric(medicareData, 'MortalityRate'),
      patient_satisfaction: extractScore(medicareData, 'PatientSatisfactionScore'),
      medical_school: medicareData.MedicalSchool || '',
      board_certification: medicareData.BoardCertification || '',
      years_of_experience: extractNumeric(medicareData, 'YearsOfExperience'),
      hospital_affiliations: medicareData.Affiliations ? 
        (Array.isArray(medicareData.Affiliations) ? medicareData.Affiliations : [medicareData.Affiliations]) : [],
      data_source: 'medicare_provider_compare',
      last_updated: new Date().toISOString(),
      raw_data: medicareData
    };

    // Store in database
    const record = await base44.asServiceRole.entities.ProviderMedicareCompare.create(enrichedData);

    // Update provider record with quality info if needed
    if (npi) {
      const providers = await base44.asServiceRole.entities.Provider.filter({ npi });
      if (providers.length > 0) {
        // Could optionally link the Medicare data back to provider
        // But keeping separate for data integrity
      }
    }

    return Response.json({
      success: true,
      npi: npi,
      quality_metrics: {
        safety: enrichedData.safety_score,
        timeliness: enrichedData.timeliness_score,
        cost: enrichedData.cost_score,
        patient_satisfaction: enrichedData.patient_satisfaction
      },
      record_id: record.id
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function extractScore(data, field) {
  const value = data[field];
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : Math.min(100, Math.max(0, num));
}

function extractNumeric(data, field) {
  const value = data[field];
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}