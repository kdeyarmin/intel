import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all providers and locations
    const providers = await base44.entities.Provider.list('', 5000);
    const locations = await base44.entities.ProviderLocation.list('', 5000);

    const issues = {
      providers: {
        missingRequired: [],
        invalidNPI: [],
        invalidPhone: [],
        duplicateNPIs: []
      },
      locations: {
        missingRequired: [],
        invalidPhone: [],
        missingCity: [],
        missingState: []
      },
      summary: {
        totalProviders: providers.length,
        totalLocations: locations.length,
        totalIssues: 0,
        qualityScore: 100
      }
    };

    // Validate Providers
    const npiSet = new Set();
    const npiDuplicates = {};

    providers.forEach(p => {
      // Check for missing required fields
      if (!p.npi || !p.entity_type) {
        issues.providers.missingRequired.push(p.id);
      }

      // Check NPI format (must be 10 digits)
      if (p.npi && !/^\d{10}$/.test(p.npi)) {
        issues.providers.invalidNPI.push(p.id);
      }

      // Check for duplicate NPIs
      if (p.npi) {
        if (npiSet.has(p.npi)) {
          if (!npiDuplicates[p.npi]) {
            npiDuplicates[p.npi] = [];
          }
          npiDuplicates[p.npi].push(p.id);
        }
        npiSet.add(p.npi);
      }

      // Validate phone format if present
      if (p.cell_phone && !/^[\d\-\.\(\)\s]+$/.test(p.cell_phone)) {
        issues.providers.invalidPhone.push(p.id);
      }
    });

    Object.entries(npiDuplicates).forEach(([npi, ids]) => {
      issues.providers.duplicateNPIs.push({ npi, ids, count: ids.length });
    });

    // Validate Locations
    locations.forEach(loc => {
      // Check for missing required fields
      if (!loc.npi || !loc.address_1) {
        issues.locations.missingRequired.push(loc.id);
      }

      // Check city and state
      if (!loc.city) {
        issues.locations.missingCity.push(loc.id);
      }
      if (!loc.state) {
        issues.locations.missingState.push(loc.id);
      }

      // Validate phone format if present
      if (loc.phone && !/^[\d\-\.\(\)\s]+$/.test(loc.phone)) {
        issues.locations.invalidPhone.push(loc.id);
      }
    });

    // Calculate total issues and quality score
    issues.summary.totalIssues = 
      issues.providers.missingRequired.length +
      issues.providers.invalidNPI.length +
      issues.providers.invalidPhone.length +
      issues.providers.duplicateNPIs.reduce((sum, d) => sum + d.count, 0) +
      issues.locations.missingRequired.length +
      issues.locations.invalidPhone.length +
      issues.locations.missingCity.length +
      issues.locations.missingState.length;

    // Quality score = (1 - issues/totalRecords) * 100
    const totalRecords = providers.length + locations.length;
    if (totalRecords > 0) {
      issues.summary.qualityScore = Math.max(0, Math.round((1 - (issues.summary.totalIssues / totalRecords)) * 100));
    }

    // AI Anomaly Detection on a sample of data
    try {
      const sample = providers.slice(0, 20).map(p => ({
        npi: p.npi,
        type: p.entity_type,
        status: p.status,
        dates: [p.enumeration_date, p.last_update_date],
        email: p.email
      }));
      
      const prompt = `Analyze this JSON sample of healthcare providers and identify any unusual anomalies or logical inconsistencies across the dataset. Return a list of anomalies.
      Data: ${JSON.stringify(sample)}
      Focus on weird patterns like everyone having the same date, lots of missing emails if they are active, etc.`;

      const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            anomalies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  severity: { type: "string" },
                  affected_npis: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        }
      });
      issues.ai_anomalies = aiRes.anomalies || [];
    } catch (aiErr) {
      console.warn("AI Anomaly detection failed:", aiErr.message);
      issues.ai_anomalies = [];
    }

    return Response.json(issues);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});