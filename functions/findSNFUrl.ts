import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as cheerio from 'npm:cheerio@1.0.0-rc.12';

Deno.serve(async (req) => {
  const pageUrl = 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-skilled-nursing-facility';
  
  try {
    const resp = await fetch(pageUrl);
    const html = await resp.text();
    const $ = cheerio.load(html);
    
    const links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      // Log ANY href that looks like a file or external link
      if (href && (href.includes('.zip') || href.includes('files/') || href.includes('download') || href.includes('MDCR'))) {
        links.push(href);
      }
    });

    const buttons = [];
    $('button').each((i, el) => {
        // sometimes the link is in a data attribute
        buttons.push($(el).attr('data-url') || $(el).text());
    });
    
    // Look for script tags that might contain the download link
    const scripts = [];
    $('script').each((i, el) => {
        const txt = $(el).html();
        if (txt && txt.includes('.zip')) {
            scripts.push(txt.substring(0, 500));
        }
    });

    return Response.json({ links, buttons, scripts });
  } catch (error) {
    return Response.json({ error: error.message });
  }
});