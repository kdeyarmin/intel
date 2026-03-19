import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const url = 'https://data.cms.gov/data.json';
    const resp = await fetch(url);
    const text = await resp.text();
    const data = JSON.parse(text);
    
    const targets = [
        'Medicare Skilled Nursing Facility',
        'Medicare Home Health Agency',
        'Medicare Advantage-Inpatient Hospital',
        'Medicare Advantage Inpatient Hospital'
    ];
    
    const results = data.dataset.filter(d => 
        targets.some(t => d.title.includes(t)) && 
        d.distribution && d.distribution.some(dist => dist.downloadURL?.endsWith('.zip'))
    ).map(d => ({
        title: d.title,
        zips: d.distribution.filter(dist => dist.downloadURL?.endsWith('.zip')).map(dist => dist.downloadURL)
    }));
    
    return Response.json({ count: results.length, matches: results.slice(0, 10) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});