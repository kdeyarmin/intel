import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

type AIProviderUpdate = {
  ai_enrichment_timestamp: string;
  ai_enrichment_notes: any;
  completeness_score: number;
  ai_category: any;
  ai_outreach_score: any;
  ai_profile_summary: any;
  website?: string;
  website_validated?: boolean;
  credential?: string;
  ai_enrichment_status?: string;
  ai_enrichment_fields?: string[];
};

Deno.serve(async (req) => {
  try {
    return Response.json({ success: false, message: 'AI integrations paused to save credits' });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider_id } = await req.json();

    if (!provider_id) {
      return Response.json({ error: 'provider_id is required' }, { status: 400 });
    }

    // Fetch the provider
    const provider = await base44.entities.Provider.get(provider_id);
    if (!provider) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    const displayName = provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name;

    // Determine what fields need enrichment
    const needsWebsite = !provider.website;
    const needsSpecialty = provider.needs_specialty_enrichment !== false && !provider.credential;
    const needsLocation = provider.needs_location_enrichment !== false;

    // Build enrichment prompt
    const enrichmentPrompt = `You are a healthcare provider data enrichment specialist. Research and find missing information for this provider using public sources.

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
5. Broad category based on taxonomy/specialty (e.g. Primary Care, Surgical, Mental Health, DME)
6. Predicted potential outreach engagement score from 0-100 based on typical responsiveness and data completeness
7. A 2-3 sentence summarized profile of the provider for quick review

Format response as JSON:
{
  "website": "https://...",
  "website_is_official": true,
  "specialty": "Cardiology",
  "credentials": ["MD", "Board Certified"],
  "practice_name": "...",
  "address": "123 Main St, City, ST 12345",
  "phone": "555-0123",
  "ai_category": "Specialty Care",
  "ai_outreach_score": 85,
  "ai_profile_summary": "Dr. Smith is a Board Certified Cardiologist with over 15 years of experience. He operates a private practice in New York and is highly engaged with modern medical technologies.",
  "found_sources": ["CMS Provider Directory", "Practice Website", "State Medical Board"],
  "confidence": "high",
  "notes": "Information verified from multiple sources"
}

Return ONLY valid JSON with no markdown formatting.`;

    // Use AI to search for missing information
    const enrichmentData = await base44.integrations.Core.InvokeLLM({
      prompt: enrichmentPrompt,
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
          ai_category: { type: "string" },
          ai_outreach_score: { type: "number" },
          ai_profile_summary: { type: "string" },
          found_sources: { type: "array", items: { type: "string" } },
          confidence: { type: "string" },
          notes: { type: "string" }
        }
      }
    });

    // Prepare update object
    const updateData: AIProviderUpdate = {
      ai_enrichment_timestamp: new Date().toISOString(),
      ai_enrichment_notes: enrichmentData.notes,
      completeness_score: calculateCompleteness(provider, enrichmentData),
      ai_category: enrichmentData.ai_category,
      ai_outreach_score: enrichmentData.ai_outreach_score,
      ai_profile_summary: enrichmentData.ai_profile_summary
    };

    const enrichedFields = [];

    // Update website if found
    if (enrichmentData.website && !provider.website) {
      updateData.website = enrichmentData.website;
      updateData.website_validated = enrichmentData.website_is_official;
      enrichedFields.push('website');
    }

    // Update credentials if found
    if (enrichmentData.credentials && enrichmentData.credentials.length > 0 && !provider.credential) {
      updateData.credential = enrichmentData.credentials[0];
      enrichedFields.push('credential');
    }

    // Set enrichment status
    updateData.ai_enrichment_status = enrichedFields.length > 0 ? 'enriched' : 'partial';
    updateData.ai_enrichment_fields = enrichedFields;

    // Update provider
    await base44.entities.Provider.update(provider_id, updateData);

    // Handle location enrichment
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

    // Handle specialty/taxonomy enrichment
    let taxonomyCreated = false;
    if (enrichmentData.specialty && provider.needs_specialty_enrichment !== false) {
      const existingTaxonomy = await base44.entities.ProviderTaxonomy.filter({
        npi: provider.npi
      });

      if (!existingTaxonomy || existingTaxonomy.length === 0) {
        // Use AI to map specialty to taxonomy code
        const taxonomyCode = await getTaxonomyCode(enrichmentData.specialty);

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
        confidence: enrichmentData.confidence
      },
      message: `Enrichment complete. ${enrichedFields.length} fields updated.`
    });
  } catch (error) {
    console.error('Enrichment error:', error);
    return Response.json(
      { error: error.message || 'Enrichment failed' },
      { status: 500 }
    );
  }
});

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

async function getTaxonomyCode(specialty) {
  // Common specialty to taxonomy code mappings
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

  // Default to generic physician code if no match
  return '207Q00000X';
}