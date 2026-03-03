import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { npis, batch_size = 10, auto_apply_high_confidence = false } = await req.json();

    if (!npis || !Array.isArray(npis) || npis.length === 0) {
      return Response.json({ error: 'npis array required' }, { status: 400 });
    }

    const toProcess = npis.slice(0, batch_size);
    const batchId = `enrich_${Date.now()}`;
    const results = [];

    for (const npi of toProcess) {
      try {
        // 1. Fetch from NPPES API
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

        // 2. AI web search for affiliations, reviews, group memberships
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
8. Social media profiles (LinkedIn, Twitter URLs)
9. Firmographics of their primary group/practice (employee count, estimated revenue, founding year)

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
              linkedin_url: { type: ["string", "null"] },
              twitter_url: { type: ["string", "null"] },
              firmographics: {
                type: ["object", "null"],
                properties: {
                  employee_count: { type: ["string", "null"] },
                  estimated_revenue: { type: ["string", "null"] },
                  founding_year: { type: ["number", "null"] }
                }
              },
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
          linkedin_url: aiRes.linkedin_url,
          twitter_url: aiRes.twitter_url,
          firmographics: aiRes.firmographics,
        };

        const hasData = (enrichmentDetails.hospital_affiliations.length > 0 ||
          enrichmentDetails.group_practices.length > 0 ||
          enrichmentDetails.review_score ||
          enrichmentDetails.board_certifications.length > 0 ||
          enrichmentDetails.education ||
          enrichmentDetails.linkedin_url ||
          enrichmentDetails.twitter_url ||
          enrichmentDetails.firmographics);

        if (!hasData) {
          results.push({ npi, status: 'no_data', name: providerName });
          continue;
        }

        const confidence = aiRes.confidence || 'medium';
        const status = (auto_apply_high_confidence && confidence === 'high') ? 'auto_applied' : 'pending_review';

        // Build a summary new_value for display
        const summaryParts = [];
        if (enrichmentDetails.hospital_affiliations.length > 0)
          summaryParts.push(`Affiliations: ${enrichmentDetails.hospital_affiliations.join(', ')}`);
        if (enrichmentDetails.group_practices.length > 0)
          summaryParts.push(`Groups: ${enrichmentDetails.group_practices.join(', ')}`);
        if (enrichmentDetails.review_score)
          summaryParts.push(`Review: ${enrichmentDetails.review_score}/5 (${enrichmentDetails.review_count || 0} reviews)`);
        if (enrichmentDetails.board_certifications.length > 0)
          summaryParts.push(`Board Certs: ${enrichmentDetails.board_certifications.join(', ')}`);
        if (enrichmentDetails.linkedin_url)
          summaryParts.push(`LinkedIn Found`);
        if (enrichmentDetails.firmographics)
          summaryParts.push(`Firmographics Found`);

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

        // If NPPES had credential/address updates, create separate records
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

        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        results.push({ npi, status: 'error', error: err.message });
      }
    }

    // Audit event
    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import',
      user_email: user.email,
      details: {
        action: 'Third-Party Enrichment',
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
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});