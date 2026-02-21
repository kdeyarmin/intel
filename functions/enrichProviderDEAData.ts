import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const DEA_SCHEDULES = {
  'CI': 'Schedule I - High abuse potential, no accepted medical use',
  'CII': 'Schedule II - High abuse potential, severe dependence liability',
  'CIII': 'Schedule III - Moderate abuse potential, moderate dependence liability',
  'CIV': 'Schedule IV - Low abuse potential, limited dependence liability',
  'CV': 'Schedule V - Low abuse potential, limited dependence liability'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { npi, last_name, first_name } = body;

    if (!npi && !last_name) {
      return Response.json({ error: 'NPI or name required' }, { status: 400 });
    }

    // Validate NPI checksum
    if (npi && !isValidNPIChecksum(npi)) {
      return Response.json({
        success: false,
        message: 'Invalid NPI checksum',
        is_dea_registered: false
      });
    }

    // Fetch provider data first to get details
    let provider = null;
    if (npi) {
      const providers = await base44.asServiceRole.entities.Provider.filter({ npi });
      provider = providers[0];
    }

    // Try to get DEA info via AI search using public sources
    const searchQuery = npi ? 
      `DEA registration status for provider NPI ${npi}` :
      `DEA registration for Dr. ${first_name || ''} ${last_name || ''}`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Search for DEA registration and controlled substance authorization information for: ${searchQuery}
      
      Determine:
      1. Is this provider registered with DEA for controlled substances?
      2. What schedules can they prescribe? (CI, CII, CIII, CIV, CV)
      3. Any restrictions on opioids, stimulants, benzodiazepines?
      4. License type and specialty?
      
      Return JSON with dea_registered (true/false), authorized_schedules (array), restrictions (array), can_prescribe_opioids, can_prescribe_stimulants, can_prescribe_benzodiazepines.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          dea_registered: { type: "boolean" },
          dea_number: { type: "string" },
          authorized_schedules: {
            type: "array",
            items: { type: "string" }
          },
          restrictions: {
            type: "array",
            items: { type: "string" }
          },
          license_type: { type: "string" },
          can_prescribe_opioids: { type: "boolean" },
          can_prescribe_stimulants: { type: "boolean" },
          can_prescribe_benzodiazepines: { type: "boolean" },
          confidence: { type: "string" }
        }
      }
    });

    const enrichedData = {
      npi: npi || provider?.npi || 'unknown',
      provider_name: provider?.organization_name || 
                     `${provider?.first_name || first_name || ''} ${provider?.last_name || last_name || ''}`.trim(),
      is_dea_registered: aiResponse.dea_registered || false,
      dea_number: aiResponse.dea_number || null,
      dea_registration_status: aiResponse.dea_registered ? 'active' : 'not_found',
      authorized_schedules: (aiResponse.authorized_schedules || []).map(schedule => ({
        schedule: schedule,
        description: DEA_SCHEDULES[schedule] || 'Unknown',
        authorized: true
      })),
      license_type: aiResponse.license_type || provider?.credential || '',
      can_prescribe_opioids: aiResponse.can_prescribe_opioids !== false,
      can_prescribe_stimulants: aiResponse.can_prescribe_stimulants !== false,
      can_prescribe_benzodiazepines: aiResponse.can_prescribe_benzodiazepines !== false,
      restrictions: aiResponse.restrictions || [],
      validation_date: new Date().toISOString()
    };

    // Store in database
    const record = await base44.asServiceRole.entities.ProviderDEASchedules.create(enrichedData);

    return Response.json({
      success: true,
      npi: enrichedData.npi,
      is_dea_registered: enrichedData.is_dea_registered,
      authorized_schedules: enrichedData.authorized_schedules,
      restrictions: enrichedData.restrictions,
      can_prescribe: {
        opioids: enrichedData.can_prescribe_opioids,
        stimulants: enrichedData.can_prescribe_stimulants,
        benzodiazepines: enrichedData.can_prescribe_benzodiazepines
      },
      record_id: record.id
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function isValidNPIChecksum(npi) {
  if (!npi || npi.length !== 10 || !/^\d{10}$/.test(npi)) return false;
  let sum = 0;
  let parity = npi.length % 2;
  for (let i = 0; i < npi.length; i++) {
    let digit = parseInt(npi[i]);
    if (i % 2 === parity) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}