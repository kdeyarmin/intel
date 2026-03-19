import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider_id, email, outreach_type = 'contact_verification' } = await req.json();

    if (!provider_id || !email) {
      return Response.json({ error: 'provider_id and email are required' }, { status: 400 });
    }

    // Fetch the provider
    const providers = await base44.asServiceRole.entities.Provider.filter({ id: provider_id });
    if (providers.length === 0) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    const provider = providers[0];
    
    const getTaxonomies = async () => {
      const taxData = await base44.asServiceRole.entities.ProviderTaxonomy.filter({ npi: provider.npi });
      return taxData.map(t => t.taxonomy_description).join(', ') || 'Healthcare provider';
    };

    const getLocation = async () => {
      const locData = await base44.asServiceRole.entities.ProviderLocation.filter({ 
        npi: provider.npi,
        is_primary: true
      });
      if (locData.length > 0) {
        const loc = locData[0];
        return `${loc.city}, ${loc.state}`;
      }
      return 'your practice';
    };

    const [specialties, location] = await Promise.all([getTaxonomies(), getLocation()]);

    const providerName = provider.first_name ? 
      `Dr. ${provider.last_name || provider.organization_name}` : 
      provider.organization_name;

    let emailPrompt = '';
    let sendTimeHint = '';

    if (outreach_type === 'contact_verification') {
      emailPrompt = `Draft a professional, concise verification email to confirm contact information. 
      
      Provider: ${providerName}
      Specialty: ${specialties}
      Location: ${location}
      Email: ${email}
      
      The email should:
      - Be friendly but professional
      - Briefly explain that we're verifying their contact information
      - Ask them to confirm the email is correct
      - Be short (max 150 words)
      - Include a clear call-to-action
      
      Return JSON:
      {
        "subject": "email subject line",
        "body": "email body text",
        "preview": "preview text (under 50 chars)",
        "tone": "friendly/professional/casual"
      }`;
      sendTimeHint = 'Tuesday-Thursday, 10am-12pm EST (highest open rates for professional emails)';
    } else if (outreach_type === 'service_offer') {
      emailPrompt = `Draft a professional outreach email offering services or data enhancement.
      
      Provider: ${providerName}
      Specialty: ${specialties}
      Location: ${location}
      
      The email should:
      - Highlight how you can help improve their professional profile/data accuracy
      - Be personalized to their specialty
      - Be concise and valuable (max 200 words)
      - Have a clear value proposition
      - Include a soft call-to-action
      
      Return JSON:
      {
        "subject": "email subject line",
        "body": "email body text",
        "preview": "preview text (under 50 chars)",
        "value_proposition": "1-2 sentence summary of value offered"
      }`;
      sendTimeHint = 'Wednesday-Thursday, 2pm-4pm EST (professionals often review non-urgent emails late afternoon)';
    } else if (outreach_type === 'data_enrichment') {
      emailPrompt = `Draft a professional outreach email requesting to update and enrich their profile data.
      
      Provider: ${providerName}
      Specialty: ${specialties}
      Location: ${location}
      
      The email should:
      - Request permission to update their professional information
      - Mention specific areas (credentials, affiliations, contact info)
      - Explain the benefit to them
      - Be professional and respectful
      - Max 150 words
      
      Return JSON:
      {
        "subject": "email subject line",
        "body": "email body text",
        "preview": "preview text (under 50 chars)",
        "requested_data": ["credentials", "affiliations", "contact info"]
      }`;
      sendTimeHint = 'Monday or Tuesday, 9am-11am EST (professionals most responsive early week morning)';
    }

    const emailResult = await base44.integrations.Core.InvokeLLM({
      prompt: emailPrompt,
      response_json_schema: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          body: { type: 'string' },
          preview: { type: 'string' },
          tone: { type: 'string' },
          value_proposition: { type: 'string' },
          requested_data: { type: 'array', items: { type: 'string' } }
        }
      }
    });

    return Response.json({
      success: true,
      provider: {
        npi: provider.npi,
        name: providerName,
        specialty: specialties,
        location,
        email
      },
      outreach: {
        type: outreach_type,
        subject: emailResult.subject,
        body: emailResult.body,
        preview: emailResult.preview,
        tone: emailResult.tone || 'professional',
        value_proposition: emailResult.value_proposition,
        requested_data: emailResult.requested_data
      },
      sending_recommendation: {
        optimal_time: sendTimeHint,
        follow_up_delay_days: outreach_type === 'contact_verification' ? 3 : 7,
        track_opens: true,
        track_clicks: true
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});