import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { npi, checkDiscrepancies = false } = body;

    if (!npi) {
      return Response.json({ error: 'NPI is required' }, { status: 400 });
    }

    // Check if already validated recently
    const existing = await base44.asServiceRole.entities.ProviderNPIValidation.filter(
      { npi },
      '-created_date',
      1
    );

    if (existing.length > 0 && !checkDiscrepancies) {
      const lastUpdate = new Date(existing[0].validation_date || existing[0].created_date);
      const daysSince = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return Response.json({
          success: true,
          cached: true,
          data: existing[0],
          message: 'Using cached validation from ' + Math.floor(daysSince) + ' days ago'
        });
      }
    }

    // Query NPI Registry API
    const npiData = await queryNPIRegistry(npi);

    if (!npiData) {
      // Create invalid NPI record
      const invalidRecord = {
        npi,
        is_valid: false,
        npi_type: 'invalid',
        status: 'invalid',
        validation_date: new Date().toISOString()
      };

      const existing_invalid = await base44.asServiceRole.entities.ProviderNPIValidation.filter(
        { npi },
        '-created_date',
        1
      );

      if (existing_invalid.length > 0) {
        await base44.asServiceRole.entities.ProviderNPIValidation.update(
          existing_invalid[0].id,
          invalidRecord
        );
      } else {
        await base44.asServiceRole.entities.ProviderNPIValidation.create(invalidRecord);
      }

      return Response.json({
        success: false,
        error: 'NPI not found in registry',
        is_valid: false
      });
    }

    // Build validation record
    const validationData = {
      npi,
      is_valid: true,
      npi_type: npiData.entity_type?.toLowerCase().includes('org') ? 'organization' : 'individual',
      entity_name: npiData.basic?.name,
      first_name: npiData.basic?.first_name,
      last_name: npiData.basic?.last_name,
      organization_name: npiData.basic?.organization_name,
      address: npiData.basic?.address,
      city: npiData.basic?.city,
      state: npiData.basic?.state,
      zip: npiData.basic?.zip,
      phone: npiData.basic?.phone,
      credentials: npiData.basic?.credential?.map(c => c.code) || [],
      taxonomies: (npiData.taxonomies || []).map(t => ({
        code: t.code,
        description: t.description,
        primary: t.primary === 'Y'
      })),
      status: npiData.basic?.status === 'A' ? 'active' : 'deactivated',
      deactivation_date: npiData.basic?.deactivation_date,
      validation_date: new Date().toISOString(),
      discrepancies: checkDiscrepancies ? await findDiscrepancies(base44, npi, npiData) : []
    };

    // Check if exists
    const existing_records = await base44.asServiceRole.entities.ProviderNPIValidation.filter(
      { npi },
      '-created_date',
      1
    );

    let result;
    if (existing_records.length > 0) {
      result = await base44.asServiceRole.entities.ProviderNPIValidation.update(
        existing_records[0].id,
        validationData
      );
    } else {
      result = await base44.asServiceRole.entities.ProviderNPIValidation.create(validationData);
    }

    return Response.json({
      success: true,
      data: result,
      message: 'NPI validation completed successfully'
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});

async function queryNPIRegistry(npi) {
  try {
    const response = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?number=${npi}&enumeration_type=&taxonomy_description=&first_name=&last_name=&organization_name=&address_purpose=&city=&state=&zip=&country_code=&limit=1&skip=0&pretty=on`,
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
    if (!data.results || data.results.length === 0) {
      return null;
    }

    const record = data.results[0];
    return {
      basic: {
        npi: record.number,
        name: record.basic?.name,
        first_name: record.basic?.first_name,
        last_name: record.basic?.last_name,
        organization_name: record.basic?.organization_name,
        address: `${record.addresses?.[0]?.address_1 || ''} ${record.addresses?.[0]?.address_2 || ''}`.trim(),
        city: record.addresses?.[0]?.city,
        state: record.addresses?.[0]?.state,
        zip: record.addresses?.[0]?.postal_code,
        phone: record.addresses?.[0]?.telephone_number,
        credential: record.basic?.credential || [],
        status: record.basic?.status,
        deactivation_date: record.basic?.deactivation_date
      },
      entity_type: record.enumeration_type,
      taxonomies: record.taxonomies || []
    };
  } catch (error) {
    console.error('NPI Registry API error:', error);
    return null;
  }
}

async function findDiscrepancies(base44, npi, npiData) {
  try {
    const provider = await base44.asServiceRole.entities.Provider.filter(
      { npi },
      '-created_date',
      1
    );

    if (provider.length === 0) {
      return [];
    }

    const prov = provider[0];
    const discrepancies = [];

    // Check name discrepancies
    if (prov.entity_type === 'Individual') {
      const appName = `${prov.first_name || ''} ${prov.last_name || ''}`.trim().toLowerCase();
      const npiName = `${npiData.basic?.first_name || ''} ${npiData.basic?.last_name || ''}`.trim().toLowerCase();
      if (appName !== npiName && appName && npiName) {
        discrepancies.push(`Name mismatch: App has "${appName}", NPI has "${npiName}"`);
      }
    }

    // Check status discrepancies
    const appStatus = prov.status?.toLowerCase() || '';
    const npiStatus = npiData.basic?.status === 'A' ? 'active' : 'deactivated';
    if (appStatus && appStatus !== npiStatus) {
      discrepancies.push(`Status mismatch: App has "${appStatus}", NPI has "${npiStatus}"`);
    }

    return discrepancies;
  } catch (error) {
    return [];
  }
}