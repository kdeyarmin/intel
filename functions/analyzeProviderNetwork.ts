import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { analysis_type = 'full', focus_npi = null, min_referral_count = 5 } = body;

    // Fetch referral data
    const referrals = await base44.asServiceRole.entities.CMSReferral.list('-total_referrals', 500);
    const providers = await base44.asServiceRole.entities.Provider.list('', 1000);
    const taxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.list('', 2000);

    // Build network graph
    const networkNodes = new Map();
    const networkEdges = [];
    const referralStats = {};

    // Create nodes
    for (const provider of providers) {
      const primaryTax = taxonomies.find(t => t.npi === provider.npi && t.primary_flag);
      networkNodes.set(provider.npi, {
        npi: provider.npi,
        name: provider.entity_type === 'Individual' 
          ? `${provider.first_name} ${provider.last_name}`.trim() 
          : provider.organization_name,
        specialty: primaryTax?.taxonomy_description || 'Unknown',
        entity_type: provider.entity_type,
        status: provider.status
      });
    }

    // Create edges and calculate strength
    for (const ref of referrals) {
      if (ref.total_referrals >= min_referral_count) {
        networkEdges.push({
          source: ref.referring_npi,
          target: ref.referred_to_npi,
          weight: ref.total_referrals,
          reciprocal: false
        });

        // Track stats
        if (!referralStats[ref.referring_npi]) {
          referralStats[ref.referring_npi] = { sent: 0, received: 0, partners: new Set() };
        }
        referralStats[ref.referring_npi].sent += ref.total_referrals;
        referralStats[ref.referring_npi].partners.add(ref.referred_to_npi);
      }
    }

    // Identify reciprocal relationships
    for (const edge of networkEdges) {
      const reciprocal = networkEdges.find(
        e => e.source === edge.target && e.target === edge.source
      );
      if (reciprocal) {
        edge.reciprocal = true;
        reciprocal.reciprocal = true;
      }
    }

    // Calculate key metrics
    const influencers = Object.entries(referralStats)
      .map(([npi, stats]) => ({
        npi,
        outbound_referrals: stats.sent,
        network_size: stats.partners.size,
        influence_score: stats.sent * Math.log(Math.max(2, stats.partners.size))
      }))
      .sort((a, b) => b.influence_score - a.influence_score)
      .slice(0, 20);

    // Find network gaps
    const gaps = [];
    const specialtyMap = new Map();

    for (const [npi, node] of networkNodes) {
      if (!specialtyMap.has(node.specialty)) {
        specialtyMap.set(node.specialty, []);
      }
      specialtyMap.get(node.specialty).push(npi);
    }

    for (const [specialty, npis] of specialtyMap) {
      const specialists = npis.filter(npi => referralStats[npi]?.sent > 0);
      const utilization = specialists.length / npis.length;

      if (utilization < 0.5 && npis.length > 5) {
        gaps.push({
          specialty,
          total_providers: npis.length,
          active_referrers: specialists.length,
          utilization_percent: Math.round(utilization * 100),
          underutilized: npis.filter(npi => !referralStats[npi] || referralStats[npi].sent === 0)
            .slice(0, 5)
            .map(npi => ({
              npi,
              name: networkNodes.get(npi)?.name
            }))
        });
      }
    }

    // Get AI recommendations
    const recommendations = await getAIRecommendations(base44, {
      influencers,
      gaps,
      total_providers: providers.length,
      total_edges: networkEdges.length
    });

    // Focus analysis if npi provided
    let focusedAnalysis = null;
    if (focus_npi) {
      const outbound = networkEdges.filter(e => e.source === focus_npi);
      const inbound = networkEdges.filter(e => e.target === focus_npi);
      const neighbors = new Set([
        ...outbound.map(e => e.target),
        ...inbound.map(e => e.source)
      ]);

      focusedAnalysis = {
        npi: focus_npi,
        provider_name: networkNodes.get(focus_npi)?.name,
        outbound_relationships: outbound.length,
        inbound_relationships: inbound.length,
        total_referrals_sent: outbound.reduce((sum, e) => sum + e.weight, 0),
        total_referrals_received: inbound.reduce((sum, e) => sum + e.weight, 0),
        network_reach: neighbors.size,
        reciprocal_relationships: networkEdges.filter(
          e => (e.source === focus_npi || e.target === focus_npi) && e.reciprocal
        ).length,
        top_referral_partners: outbound
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 10)
          .map(e => ({
            npi: e.target,
            name: networkNodes.get(e.target)?.name,
            referrals: e.weight,
            specialty: networkNodes.get(e.target)?.specialty
          })),
        top_referral_sources: inbound
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 10)
          .map(e => ({
            npi: e.source,
            name: networkNodes.get(e.source)?.name,
            referrals: e.weight,
            specialty: networkNodes.get(e.source)?.specialty
          }))
      };
    }

    return Response.json({
      success: true,
      analysis: {
        network_metrics: {
          total_providers: networkNodes.size,
          total_relationships: networkEdges.length,
          reciprocal_relationships: networkEdges.filter(e => e.reciprocal).length,
          density: networkEdges.length / (networkNodes.size * (networkNodes.size - 1))
        },
        influencers,
        network_gaps: gaps,
        recommendations,
        focused_analysis: focusedAnalysis
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getAIRecommendations(base44, networkData) {
  try {
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this provider network and provide strategic recommendations:

Top 10 Influencers (by influence score):
${networkData.influencers.slice(0, 10).map((inf, i) => 
  `${i + 1}. ${inf.influence_score.toFixed(0)} influence score, ${inf.network_size} referral partners, ${inf.outbound_referrals} referrals sent`
).join('\n')}

Network Gaps (underutilized specialties):
${networkData.gaps.slice(0, 5).map(gap =>
  `- ${gap.specialty}: ${gap.active_referrers}/${gap.total_providers} active (${gap.utilization_percent}%)`
).join('\n')}

Network Statistics:
- Total providers: ${networkData.total_providers}
- Active relationships: ${networkData.total_edges}
- Network density: ${(networkData.total_edges / (networkData.total_providers * (networkData.total_providers - 1)) * 100).toFixed(2)}%

Based on this analysis, provide 3-5 specific, actionable recommendations for:
1. Network expansion opportunities
2. Key partnerships to strengthen
3. Specialty gaps to fill
4. Influence centers to leverage

Format as a JSON object with: expansion_opportunities (array), partnership_recommendations (array), gap_filling_strategies (array), influence_strategy (string)`,
      response_json_schema: {
        type: 'object',
        properties: {
          expansion_opportunities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                opportunity: { type: 'string' },
                rationale: { type: 'string' },
                expected_impact: { type: 'string' }
              }
            }
          },
          partnership_recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                focus_area: { type: 'string' },
                action: { type: 'string' },
                priority: { type: 'string' }
              }
            }
          },
          gap_filling_strategies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                specialty: { type: 'string' },
                strategy: { type: 'string' },
                timeline: { type: 'string' }
              }
            }
          },
          influence_strategy: { type: 'string' }
        }
      }
    });

    return response;
  } catch (error) {
    return {
      expansion_opportunities: [{ opportunity: 'Unable to generate AI recommendations', rationale: error.message }],
      partnership_recommendations: [],
      gap_filling_strategies: [],
      influence_strategy: 'Please try again later'
    };
  }
}