import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let url;
        try {
            const body = await req.json();
            url = body.url;
        } catch(e) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 });
        }
        
        if (!url) {
            return Response.json({ error: 'url is required' }, { status: 400 });
        }

        // Fetch a small chunk of data from the URL to analyze
        const res = await fetch(url, {
            headers: { 'Range': 'bytes=0-4096' }
        });
        
        const sampleText = await res.text();
        
        const prompt = `
        You are an expert data integration assistant.
        I am configuring a new data source from the following URL: ${url}
        
        Here is a sample of the data returned by the URL:
        ${sampleText.substring(0, 1000)}
        
        Please predict:
        1. The most appropriate 'import_type' from this list: "cms_utilization", "cms_order_referring", "opt_out_physicians", "provider_service_utilization", "home_health_enrollments", "hospice_enrollments", "nppes_registry", "medicare_hha_stats", "medicare_ma_inpatient", "medicare_part_d_stats", "medicare_snf_stats", "nursing_home_providers", "nursing_home_deficiencies".
        2. The 'data_year' if it can be inferred from the URL or data. Otherwise, guess the most recent year or null.
        3. 'is_valid_format': boolean, whether this looks like a valid CSV or JSON dataset.
        4. 'explanation': a short 1-sentence explanation of why you chose this import type.
        `;

        const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: {
                type: "object",
                properties: {
                    import_type: { type: "string" },
                    data_year: { type: "number" },
                    is_valid_format: { type: "boolean" },
                    explanation: { type: "string" }
                },
                required: ["import_type", "is_valid_format", "explanation"]
            }
        });

        return Response.json({ success: true, prediction: response });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});