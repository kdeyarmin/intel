import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const url = 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-part-d';
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await resp.text();
    
    // Look for zip links
    const matches = html.match(/href="([^"]+\.zip)"/gi) || [];
    return Response.json({ status: resp.status, zip_links: matches, html_snippet: html.substring(0, 1000) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});