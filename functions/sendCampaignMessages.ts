import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { campaign_id, batch_size = 50, send_now = false } = body;

    if (!campaign_id) {
      return Response.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    // Get campaign
    const campaigns = await base44.asServiceRole.entities.OutreachCampaign.filter(
      { id: campaign_id },
      '-created_date',
      1
    );

    if (campaigns.length === 0) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const campaign = campaigns[0];

    // Get target providers from lead list
    let targetProviders = [];
    if (campaign.lead_list_id) {
      const listMembers = await base44.asServiceRole.entities.LeadListMember.filter(
        { lead_list_id: campaign.lead_list_id }
      );
      const npis = listMembers.map(m => m.npi);
      
      if (npis.length > 0) {
        targetProviders = await base44.asServiceRole.entities.Provider.filter(
          { npi: { $in: npis } }
        );
      }
    }

    // Fetch enrichment data
    const providers = await base44.asServiceRole.entities.Provider.list('', 500);
    const locations = await base44.asServiceRole.entities.ProviderLocation.list('', 500);
    const taxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.list('', 500);
    const scores = await base44.asServiceRole.entities.LeadScore.list('', 500);

    const results = {
      campaign_id,
      messages_created: 0,
      messages_sent: 0,
      errors: [],
      preview_messages: []
    };

    // Process providers in batches
    for (let i = 0; i < targetProviders.length; i += batch_size) {
      const batch = targetProviders.slice(i, i + batch_size);

      for (const provider of batch) {
        try {
          // Check if message already sent
          const existing = await base44.asServiceRole.entities.OutreachMessage.filter({
            campaign_id,
            npi: provider.npi
          });

          if (existing.length > 0) {
            continue;
          }

          // Get provider context
          const location = locations.find(l => l.npi === provider.npi && l.is_primary);
          const taxonomy = taxonomies.find(t => t.npi === provider.npi && t.primary_flag);
          const score = scores.find(s => s.npi === provider.npi);

          // Render template with provider data
          const { subject, body } = renderTemplate(campaign, provider, location, taxonomy, score);

          // Get personalization from AI if enabled
          let aiPersonalization = null;
          if (campaign.ai_personalization) {
            aiPersonalization = await generateAIPersonalization(base44, {
              provider,
              location,
              taxonomy,
              score,
              campaign
            });
          }

          const finalBody = aiPersonalization?.body_html || body;

          // Create message record
          const message = await base44.asServiceRole.entities.OutreachMessage.create({
            campaign_id,
            npi: provider.npi,
            recipient_email: provider.email || location?.email,
            recipient_name: getProviderName(provider),
            subject,
            body_html: finalBody,
            body_text: htmlToText(finalBody),
            status: send_now ? 'generated' : 'pending',
            ai_personalization_reason: aiPersonalization?.reasoning
          });

          results.messages_created++;

          // Send immediately if requested
          if (send_now && provider.email) {
            try {
              await base44.integrations.Core.SendEmail({
                to: provider.email,
                subject,
                body: finalBody
              });

              await base44.asServiceRole.entities.OutreachMessage.update(message.id, {
                status: 'sent',
                sent_at: new Date().toISOString()
              });

              results.messages_sent++;
            } catch (emailError) {
              results.errors.push({
                npi: provider.npi,
                error: `Email send failed: ${emailError.message}`
              });
            }
          }

          // Store preview for first message
          if (results.preview_messages.length < 3) {
            results.preview_messages.push({
              provider_name: getProviderName(provider),
              npi: provider.npi,
              subject,
              preview: finalBody.substring(0, 200)
            });
          }
        } catch (error) {
          results.errors.push({
            npi: provider.npi,
            error: error.message
          });
        }
      }
    }

    // Update campaign
    await base44.asServiceRole.entities.OutreachCampaign.update(campaign_id, {
      total_recipients: results.messages_created,
      sent_count: results.messages_sent,
      status: send_now ? 'sending' : 'scheduled'
    });

    return Response.json({
      success: true,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});

function renderTemplate(campaign, provider, location, taxonomy, score) {
  let subject = campaign.subject_template || '';
  let body = campaign.body_template || '';

  const providerName = getProviderName(provider);
  const specialty = taxonomy?.taxonomy_description || 'Healthcare Provider';
  const city = location?.city || 'your area';
  const state = location?.state || '';
  const scoreValue = score?.score || 0;

  const mergeData = {
    '{{provider_name}}': providerName,
    '{{first_name}}': provider.first_name || 'Colleague',
    '{{specialty}}': specialty,
    '{{location_city}}': city,
    '{{location_state}}': state,
    '{{score}}': scoreValue.toFixed(0),
    '{{year}}': new Date().getFullYear().toString()
  };

  for (const [key, value] of Object.entries(mergeData)) {
    subject = subject.replace(new RegExp(key, 'g'), value);
    body = body.replace(new RegExp(key, 'g'), value);
  }

  return { subject, body };
}

async function generateAIPersonalization(base44, context) {
  try {
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Personalize this outreach message for a healthcare provider:

Provider: ${context.provider.first_name} ${context.provider.last_name}
Specialty: ${context.taxonomy?.taxonomy_description || 'Unknown'}
Location: ${context.location?.city}, ${context.location?.state}
Lead Score: ${context.score?.score || 'N/A'}
Network Position: ${context.score?.reasons?.[0] || 'Strong candidate'}

Original message: ${context.campaign.body_template}

Create a personalized HTML version that:
1. Addresses the provider by name
2. References their specialty and location naturally
3. Highlights 1-2 specific reasons why this partnership matters for them
4. Keeps professional tone
5. Maintains original message length

Return as a JSON object with: body_html (the personalized HTML), reasoning (1 sentence why this personalization)`,
      response_json_schema: {
        type: 'object',
        properties: {
          body_html: { type: 'string' },
          reasoning: { type: 'string' }
        }
      }
    });

    return response;
  } catch (error) {
    console.error('AI personalization error:', error);
    return null;
  }
}

function getProviderName(provider) {
  if (provider.entity_type === 'Individual') {
    return `${provider.first_name || ''} ${provider.last_name || ''}`.trim();
  }
  return provider.organization_name || 'Healthcare Provider';
}

function htmlToText(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}