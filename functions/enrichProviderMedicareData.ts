import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { npi, provider_name = '' } = body;

    if (!npi) {
      return Response.json({ error: 'NPI is required' }, { status: 400 });
    }

    // Check if already enriched recently
    const existing = await base44.asServiceRole.entities.ProviderMedicareCompare.filter(
      { npi },
      '-created_date',
      1
    );

    if (existing.length > 0) {
      const lastUpdate = new Date(existing[0].last_updated || existing[0].created_date);
      const daysSince = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return Response.json({
          success: true,
          cached: true,
          data: existing[0],
          message: 'Using cached data from ' + Math.floor(daysSince) + ' days ago'
        });
      }
    }

    // Query Medicare Provider Compare API
    const medicareData = await queryMedicareAPI(npi);

    if (!medicareData) {
      return Response.json({
        success: false,
        error: 'Provider not found in Medicare data'
      });
    }

    // Create or update ProviderMedicareCompare entity
    const compareData = {
      npi,
      provider_name: medicareData.name || provider_name,
      medicare_id: medicareData.provider_id,
      quality_score: medicareData.quality_measure?.overall_score,
      safety_score: medicareData.safety_measure?.score,
      timeliness_score: medicareData.timeliness_measure?.score,
      cost_score: medicareData.cost_measure?.score,
      readmission_rate: medicareData.readmission_rate,
      mortality_rate: medicareData.mortality_rate,
      patient_satisfaction: medicareData.patient_satisfaction,
      medical_school: medicareData.medical_school,
      board_certification: medicareData.board_certification,
      years_of_experience: medicareData.years_in_practice,
      hospital_affiliations: medicareData.hospital_affiliations || [],
      data_source: 'medicare_provider_compare',
      last_updated: new Date().toISOString(),
      raw_data: medicareData
    };

    // Check if exists
    const existing_records = await base44.asServiceRole.entities.ProviderMedicareCompare.filter(
      { npi },
      '-created_date',
      1
    );

    let result;
    if (existing_records.length > 0) {
      result = await base44.asServiceRole.entities.ProviderMedicareCompare.update(
        existing_records[0].id,
        compareData
      );
    } else {
      result = await base44.asServiceRole.entities.ProviderMedicareCompare.create(compareData);
    }

    return Response.json({
      success: true,
      data: result,
      message: 'Medicare data enriched successfully'
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});

async function queryMedicareAPI(npi) {
  try {
    // Medicare Provider Compare API endpoint
    const response = await fetch(
      `https://data.cms.gov/api/3/action/datastore_search?resource_id=4ff0b55a-6a3a-413c-bb53-cf8b08f38c74&filters={"NPI":"${npi}"}&limit=1`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data.result || !data.result.records || data.result.records.length === 0) {
      return null;
    }

    const record = data.result.records[0];
    
    return {
      provider_id: record['Provider ID'],
      name: record['Provider Name'] || record['First Name'] ? 
        `${record['First Name'] || ''} ${record['Last Name'] || ''}`.trim() : 
        record['Org Name'],
      quality_measure: {
        overall_score: parseFloat(record['Quality Score'] || 0)
      },
      safety_measure: {
        score: parseFloat(record['Safety Score'] || 0)
      },
      timeliness_measure: {
        score: parseFloat(record['Timeliness Score'] || 0)
      },
      cost_measure: {
        score: parseFloat(record['Cost Score'] || 0)
      },
      readmission_rate: parseFloat(record['Readmission Rate'] || 0),
      mortality_rate: parseFloat(record['Mortality Rate'] || 0),
      patient_satisfaction: parseFloat(record['Patient Satisfaction'] || 0),
      medical_school: record['Medical School'],
      board_certification: record['Board Certification'],
      years_in_practice: parseInt(record['Years in Practice'] || 0),
      hospital_affiliations: record['Hospital Affiliations']?.split(';') || []
    };
  } catch (error) {
    console.error('Medicare API error:', error);
    return null;
  }
}