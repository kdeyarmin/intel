import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const NPI_API_URL = 'https://npiregistry.cms.hhs.gov/api';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { npi, checkDiscrepancies = false } = body;

    if (!npi) {
      return Response.json({ error: 'NPI required' }, { status: 400 });
    }

    // Validate NPI checksum (Luhn algorithm)
    if (!isValidNPIChecksum(npi)) {
      const record = await base44.asServiceRole.entities.ProviderNPIValidation.create({
        npi,
        is_valid: false,
        npi_type: 'invalid',
        status: 'invalid',
        validation_date: new Date().toISOString(),
        discrepancies: ['Invalid NPI checksum']
      });
      
      return Response.json({
        success: false,
        npi,
        is_valid: false,
        reason: 'Invalid NPI checksum',
        record_id: record.id
      });
    }

    // Query NPI Registry API
    const response = await fetch(
      `${NPI_API_URL}?number=${npi}&version=2.1`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CareMetric-NPI-Validation/1.0'
        },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) {
      return Response.json({
        success: false,
        message: 'NPI Registry API unavailable',
        status: response.status
      });
    }

    const npiData = await response.json();
    const results = npiData.results || [];

    if (results.length === 0) {
      const record = await base44.asServiceRole.entities.ProviderNPIValidation.create({
        npi,
        is_valid: false,
        npi_type: 'invalid',
        status: 'invalid',
        validation_date: new Date().toISOString()
      });

      return Response.json({
        success: false,
        npi,
        is_valid: false,
        record_id: record.id
      });
    }

    const provider = results[0];
    const basic = provider.basic || {};
    const taxonomies = provider.taxonomies || [];

    // Determine NPI type
    const npiType = provider.enumeration_type === 'NPI-1' ? 'individual' : 'organization';

    const validationData = {
      npi,
      is_valid: true,
      npi_type: npiType,
      entity_name: basic.name || '',
      first_name: basic.first_name || '',
      last_name: basic.last_name || '',
      organization_name: basic.organization_name || '',
      address: basic.sole_proprietor_flag ? 'Individual' : `${basic.address_1 || ''} ${basic.city || ''} ${basic.state || ''}`.trim(),
      city: basic.city || '',
      state: basic.state || '',
      zip: basic.postal_code || '',
      phone: basic.telephone_number || '',
      credentials: basic.credential_text ? [basic.credential_text] : [],
      taxonomies: taxonomies.map(t => ({
        code: t.code,
        description: t.desc,
        primary: t.primary === 'Y'
      })),
      status: basic.status === 'A' ? 'active' : 'deactivated',
      deactivation_date: basic.deactivation_date || null,
      validation_date: new Date().toISOString(),
      discrepancies: []
    };

    // Check for discrepancies if requested
    if (checkDiscrepancies) {
      const appProvider = await base44.asServiceRole.entities.Provider.filter({ npi });
      if (appProvider.length > 0) {
        const appData = appProvider[0];
        const discrepancies = [];

        if (appData.entity_type !== npiType) {
          discrepancies.push(`Entity type mismatch: app has ${appData.entity_type}, NPI registry has ${npiType}`);
        }
        if (appData.status !== validationData.status) {
          discrepancies.push(`Status mismatch: app has ${appData.status}, NPI registry has ${validationData.status}`);
        }
        if (appData.organization_name && appData.organization_name !== validationData.organization_name) {
          discrepancies.push(`Organization name differs: "${appData.organization_name}" vs "${validationData.organization_name}"`);
        }

        validationData.discrepancies = discrepancies;
      }
    }

    const record = await base44.asServiceRole.entities.ProviderNPIValidation.create(validationData);

    return Response.json({
      success: true,
      npi,
      is_valid: true,
      npi_type: npiType,
      status: validationData.status,
      provider_name: validationData.entity_name,
      taxonomies: validationData.taxonomies.length,
      discrepancies: validationData.discrepancies,
      record_id: record.id
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function isValidNPIChecksum(npi) {
  if (!npi || npi.length !== 10 || !/^\d{10}$/.test(npi)) return false;

  // Luhn algorithm for NPI validation
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