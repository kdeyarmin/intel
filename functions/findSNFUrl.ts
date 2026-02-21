import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as cheerio from 'npm:cheerio@1.0.0-rc.12';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  
  const pageUrl = 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-skilled-nursing-facility';
  
  try {
    const resp = await fetch(pageUrl);
    const html = await resp.text();
    const $ = cheerio.load(html);
    
    const links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && (href.endsWith('.zip') || href.includes('files/'))) {
        links.push(href);
      }
    });

    // Also look for buttons/elements that might hold the download link
    const potential = [];
    $('button').each((i, el) => {
       const txt = $(el).text();
       if (txt.includes('Download')) {
           potential.push($(el).html());
       }
    });

    return Response.json({ links, potential });
  } catch (error) {
    return Response.json({ error: error.message });
  }
});