import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    if (payload.npis && Array.isArray(payload.npis)) {
      return handleBatchEnrichment(base44, user, payload);
    }

    if (payload.npi && !payload.provider_id) {
      return handleNpiEnrichment(base44, payload);
    }

    if (payload.provider_id) {
      return handleProviderEnrichment(base44, payload);
    }

    return Response.json({ error: 'Provide provider_id, npi, or npis array' }, { status: 400 });
  } catch (error) {
    console.error('Enrichment error:', error);
    return Response.json({ error: error.message || 'Enrichment failed' }, { status: 500 });
  }
});

async function handleProviderEnrichment(base44, payload) {
  const { provider_id } = payload;

  const provider = await base44.entities.Provider.get(provider_id);
  if (!provider) {
    return Response.json({ error: 'Provider not found' }, { status: 404 });
  }

  const displayName = provider.entity_type === 'Individual'
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : provider.organization_name;

  const enrichmentData = await base44.integrations.Core.InvokeLLM({
    prompt: `You are a healthcare provider data enrichment specialist. Research and find missing information for this provider using public sources.

Provider Details:
- NPI: ${provider.npi}
- Name: ${displayName}
- Entity Type: ${provider.entity_type}
- Organization: ${provider.organization_name || 'N/A'}
- Current Credential: ${provider.credential || 'Unknown'}
- Current Website: ${provider.website || 'Not found'}
- Email: ${provider.email || 'Not found'}

Find and provide:
1. Official website URL (if missing or needs verification)
2. Primary specialty/credentials (if missing)
3. Practice address and phone number (if missing)
4. Practice name and type
5. Hospital affiliations
6. Patient review scores
7. Board certifications
8. Languages spoken

Return ONLY valid JSON with no markdown formatting.`,
    add_context_from_internet: true,
    response_json_schema: {
      type: "object",
      properties: {
        website: { type: "string" },
        website_is_official: { type: "boolean" },
        specialty: { type: "string" },
        credentials: { type: "array", items: { type: "string" } },
        practice_name: { type: "string" },
        address: { type: "string" },
        phone: { type: "string" },
        found_sources: { type: "array", items: { type: "string" } },
        confidence: { type: "string" },
        notes: { type: "string" },
        hospital_affiliations: { type: "array", items: { type: "string" } },
        review_score: { type: ["number", "null"] },
        review_count: { type: ["number", "null"] },
        board_certifications: { type: "array", items: { type: "string" } },
        languages: { type: "array", items: { type: "string" } },
        accepting_new_patients: { type: ["boolean", "null"] }
      }
    }
  });

  const updateData = {
    ai_enrichment_timestamp: new Date().toISOString(),
    ai_enrichment_notes: enrichmentData.notes,
    completeness_score: calculateCompleteness(provider, enrichmentData)
  };

  const enrichedFields = [];

  if (enrichmentData.website && !provider.website) {
    updateData.website = enrichmentData.website;
    updateData.website_validated = enrichmentData.website_is_official;
    enrichedFields.push('website');
  }

  if (enrichmentData.credentials && enrichmentData.credentials.length > 0 && !provider.credential) {
    updateData.credential = enrichmentData.credentials[0];
    enrichedFields.push('credential');
  }

  updateData.ai_enrichment_status = enrichedFields.length > 0 ? 'enriched' : 'partial';
  updateData.ai_enrichment_fields = enrichedFields;

  await base44.entities.Provider.update(provider_id, updateData);

  let locationCreated = false;
  if (enrichmentData.address && provider.needs_location_enrichment !== false) {
    const existingLocation = await base44.entities.ProviderLocation.filter({
      npi: provider.npi,
      location_type: 'Practice'
    });

    if (!existingLocation || existingLocation.length === 0) {
      const [addressLine1, cityState] = enrichmentData.address.split(',').slice(0, 2);
      const [city, stateZip] = (cityState || '').trim().split(/\s+/);
      const state = stateZip?.split(/\d/)[0] || '';
      const zip = stateZip?.match(/\d+/)?.[0] || '';

      await base44.entities.ProviderLocation.create({
        npi: provider.npi,
        location_type: 'Practice',
        is_primary: true,
        address_1: addressLine1?.trim() || '',
        city: city?.trim() || '',
        state: state?.trim() || '',
        zip: zip?.trim() || '',
        phone: enrichmentData.phone || '',
        email: provider.email || ''
      });

      enrichedFields.push('location');
      locationCreated = true;
    }
  }

  let taxonomyCreated = false;
  if (enrichmentData.specialty && provider.needs_specialty_enrichment !== false) {
    const existingTaxonomy = await base44.entities.ProviderTaxonomy.filter({
      npi: provider.npi
    });

    if (!existingTaxonomy || existingTaxonomy.length === 0) {
      const taxonomyCode = getTaxonomyCode(enrichmentData.specialty);

      await base44.entities.ProviderTaxonomy.create({
        npi: provider.npi,
        taxonomy_code: taxonomyCode,
        taxonomy_description: enrichmentData.specialty,
        primary_flag: true
      });

      enrichedFields.push('taxonomy');
      taxonomyCreated = true;
    }
  }

  return Response.json({
    success: true,
    provider_id,
    enriched_fields: enrichedFields,
    location_created: locationCreated,
    taxonomy_created: taxonomyCreated,
    completeness_score: calculateCompleteness(provider, enrichmentData),
    enrichment_data: {
      website: enrichmentData.website,
      specialty: enrichmentData.specialty,
      practice_name: enrichmentData.practice_name,
      confidence: enrichmentData.confidence,
      hospital_affiliations: enrichmentData.hospital_affiliations,
      review_score: enrichmentData.review_score,
      board_certifications: enrichmentData.board_certifications
    },
    message: `Enrichment complete. ${enrichedFields.length} fields updated.`
  });
}

async function handleNpiEnrichment(base44, payload) {
  const { npi } = payload;

  const providers = await base44.asServiceRole.entities.Provider.filter({ npi });
  const provider = providers.length > 0 ? providers[0] : null;

  const locations = await base44.asServiceRole.entities.ProviderLocation.filter({ npi });
  const taxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.filter({ npi });

  let nppesData = null;
  try {
    const nppesRes = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`);
    if (nppesRes.ok) {
      const data = await nppesRes.json();
      if (data.results && data.results.length > 0) {
        nppesData = data.results[0];
      }
    }
  } catch (e) {
    console.error("NPPES API Error:", e);
  }

  let aiSuggestions = null;
  try {
    aiSuggestions = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Analyze the healthcare provider with NPI: ${npi}.
                
Current DB Data:
Provider: ${JSON.stringify(provider || {})}
Locations: ${JSON.stringify(locations || [])}
Taxonomies: ${JSON.stringify(taxonomies || [])}

Latest NPPES Registry Data: ${JSON.stringify(nppesData || {})}

Search the internet for this provider to find missing or outdated information. Look for:
- Current practice website
- Active email addresses
- New or unlisted practice locations and phone numbers
- Additional specialties or clinical focus areas

Compare the found information with the provided data and return intelligent suggestions for updates.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          suggested_website: { type: "string", description: "Found website URL if any" },
          suggested_emails: { type: "array", items: { type: "string" }, description: "Found email addresses" },
          suggested_locations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                address: { type: "string" },
                phone: { type: "string" },
                is_new_or_updated: { type: "boolean" }
              }
            }
          },
          suggested_specialties: { type: "array", items: { type: "string" } },
          enrichment_notes: { type: "string", description: "Explanation of findings and what should be updated" },
          confidence_score: { type: "number", description: "1-100 score on the confidence of these suggestions" }
        }
      }
    });
  } catch (e) {
    console.error("AI Enrichment Error:", e);
  }

  return Response.json({
    npi,
    status: 'success',
    database_record: {
      provider,
      locations,
      taxonomies
    },
    nppes_registry_data: nppesData,
    ai_enrichment_suggestions: aiSuggestions
  });
}

async function handleBatchEnrichment(base44, user, payload) {
  const { npis, batch_size = 10, auto_apply_high_confidence = false } = payload;

  if (!npis || !Array.isArray(npis) || npis.length === 0) {
    return Response.json({ error: 'npis array required' }, { status: 400 });
  }

  const toProcess = npis.slice(0, batch_size);
  const batchId = `enrich_${Date.now()}`;
  const results = [];

  for (const npi of toProcess) {
    try {
      const nppesRes = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`);
      let nppesData = null;
      if (nppesRes.ok) {
        const json = await nppesRes.json();
        if (json.results && json.results.length > 0) nppesData = json.results[0];
      }

      const basic = nppesData?.basic || {};
      const providerName = basic.first_name
        ? `${basic.first_name} ${basic.last_name || ''}`.trim()
        : basic.organization_name || basic.name || npi;

      const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Search for public information about this healthcare provider:
- NPI: ${npi}
- Name: ${providerName}
- Credential: ${basic.credential || 'Unknown'}
- State: ${nppesData?.addresses?.[0]?.state || 'Unknown'}

Find the following:
1. Hospital affiliations (which hospitals they practice at)
2. Practice group memberships (medical group or practice name)
3. Patient review scores (from Healthgrades, Vitals, WebMD, Google, etc.)
4. Board certifications
5. Medical school / education
6. Languages spoken
7. Whether they are accepting new patients

Only return information you can verify from public sources. Be specific with hospital names and group names.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            hospital_affiliations: { type: "array", items: { type: "string" }, description: "List of hospital names" },
            group_practices: { type: "array", items: { type: "string" }, description: "Practice group names" },
            review_score: { type: ["number", "null"], description: "Average patient review score (1-5 scale)" },
            review_count: { type: ["number", "null"], description: "Number of reviews" },
            review_source: { type: ["string", "null"], description: "Source of reviews (Healthgrades, etc.)" },
            board_certifications: { type: "array", items: { type: "string" } },
            education: { type: ["string", "null"], description: "Medical school" },
            languages: { type: "array", items: { type: "string" } },
            accepting_new_patients: { type: ["boolean", "null"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            data_found: { type: "boolean" }
          }
        }
      });

      if (!aiRes.data_found && !nppesData) {
        results.push({ npi, status: 'no_data', name: providerName });
        continue;
      }

      const enrichmentDetails = {
        hospital_affiliations: aiRes.hospital_affiliations || [],
        group_practices: aiRes.group_practices || [],
        review_score: aiRes.review_score,
        review_count: aiRes.review_count,
        review_source: aiRes.review_source,
        board_certifications: aiRes.board_certifications || [],
        education: aiRes.education,
        languages: aiRes.languages || [],
        accepting_new_patients: aiRes.accepting_new_patients,
      };

      const hasData = (enrichmentDetails.hospital_affiliations.length > 0 ||
        enrichmentDetails.group_practices.length > 0 ||
        enrichmentDetails.review_score ||
        enrichmentDetails.board_certifications.length > 0 ||
        enrichmentDetails.education);

      if (!hasData) {
        results.push({ npi, status: 'no_data', name: providerName });
        continue;
      }

      const confidence = aiRes.confidence || 'medium';
      const status = (auto_apply_high_confidence && confidence === 'high') ? 'auto_applied' : 'pending_review';

      const summaryParts = [];
      if (enrichmentDetails.hospital_affiliations.length > 0)
        summaryParts.push(`Affiliations: ${enrichmentDetails.hospital_affiliations.join(', ')}`);
      if (enrichmentDetails.group_practices.length > 0)
        summaryParts.push(`Groups: ${enrichmentDetails.group_practices.join(', ')}`);
      if (enrichmentDetails.review_score)
        summaryParts.push(`Review: ${enrichmentDetails.review_score}/5 (${enrichmentDetails.review_count || 0} reviews)`);
      if (enrichmentDetails.board_certifications.length > 0)
        summaryParts.push(`Board Certs: ${enrichmentDetails.board_certifications.join(', ')}`);

      await base44.asServiceRole.entities.EnrichmentRecord.create({
        npi,
        provider_name: providerName,
        source: 'ai_web_search',
        enrichment_type: 'multi_field',
        field_name: 'enrichment_details',
        old_value: '',
        new_value: summaryParts.join(' | '),
        confidence,
        status,
        enrichment_details: enrichmentDetails,
        batch_id: batchId,
      });

      if (nppesData) {
        const existingProviders = await base44.asServiceRole.entities.Provider.filter({ npi });
        if (existingProviders.length > 0) {
          const prov = existingProviders[0];
          if (basic.credential && !prov.credential) {
            await base44.asServiceRole.entities.EnrichmentRecord.create({
              npi,
              provider_name: providerName,
              source: 'nppes_api',
              enrichment_type: 'credential',
              field_name: 'credential',
              old_value: prov.credential || '',
              new_value: basic.credential,
              confidence: 'high',
              status: auto_apply_high_confidence ? 'auto_applied' : 'pending_review',
              batch_id: batchId,
            });

            if (auto_apply_high_confidence) {
              await base44.asServiceRole.entities.Provider.update(prov.id, { credential: basic.credential });
            }
          }
        }
      }

      results.push({ npi, status: 'enriched', name: providerName, confidence, fieldsFound: summaryParts.length });

      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      results.push({ npi, status: 'error', error: err.message });
    }
  }

  await base44.asServiceRole.entities.AuditEvent.create({
    event_type: 'import',
    user_email: user.email,
    details: {
      action: 'AI Batch Enrichment',
      entity: 'Provider',
      row_count: results.filter(r => r.status === 'enriched').length,
      message: `Enriched ${results.filter(r => r.status === 'enriched').length} of ${toProcess.length} providers`
    },
    timestamp: new Date().toISOString(),
  });

  return Response.json({
    success: true,
    batch_id: batchId,
    total: toProcess.length,
    enriched: results.filter(r => r.status === 'enriched').length,
    no_data: results.filter(r => r.status === 'no_data').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  });
}

function calculateCompleteness(provider, enrichmentData) {
  const fields = [
    'first_name',
    'last_name',
    'credential',
    'email',
    'website',
    'organization_name',
    'cell_phone'
  ];

  let filledCount = 0;
  fields.forEach(field => {
    if (field === 'website' && (provider.website || enrichmentData.website)) filledCount++;
    else if (field === 'credential' && (provider.credential || enrichmentData.credentials?.length)) filledCount++;
    else if (provider[field]) filledCount++;
  });

  return Math.round((filledCount / fields.length) * 100);
}

function getTaxonomyCode(specialty) {
  const mappings = {
    'cardiology': '207RC0000X',
    'psychiatry': '207Q00000X',
    'family medicine': '207QH0002X',
    'internal medicine': '207R00000X',
    'orthopedic surgery': '207X00000X',
    'neurology': '207RC0001X',
    'oncology': '207RX0202X',
    'pediatrics': '207P00000X',
    'dermatology': '207ND0101X',
    'radiology': '207RA0401X'
  };

  const normalizedSpecialty = specialty?.toLowerCase() || '';
  for (const [key, code] of Object.entries(mappings)) {
    if (normalizedSpecialty.includes(key) || key.includes(normalizedSpecialty.split(' ')[0])) {
      return code;
    }
  }

  return '207Q00000X';
}
