import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const codes = ['01SNF', '02SNF', '03SNF', '04SNF', '05SNF', '06SNF', '07SNF', '08SNF', '09SNF', '10SNF', 'SNF', '01MDCR', '02MDCR'];
  const years = [2023];
  
  // Try pattern: MDCR SNF_CPS_[CODE]_[YEAR].zip
  // Try pattern: MDCR SNF_CPS_[YEAR]_[CODE].zip
  // Try HHA-like: MDCR HHA_CPS_07UHH_2023.zip -> MDCR SNF_CPS_07SNF_2023.zip ?
  
  // Note: HHA URL: https://data.cms.gov/sites/default/files/2026-01/MDCR%20HHA_CPS_07UHH_2023.zip
  // Base: https://data.cms.gov/sites/default/files/2026-01/
  
  const base = 'https://data.cms.gov/sites/default/files/2026-01/';
  
  const urls = [];
  
  for (const year of years) {
      for (const code of codes) {
          urls.push(`${base}MDCR%20SNF_CPS_${code}_${year}.zip`); // like HHA
          urls.push(`${base}MDCR_SNF_CPS_${code}_${year}.zip`);
          urls.push(`${base}CPS%20MDCR%20SNF%20${year}.zip`); // old
          urls.push(`${base}MDCR%20SNF%20CPS%20${code}%20${year}.zip`);
          urls.push(`${base}MDCR%20SNF%20CPS%20${year}.zip`);
      }
      urls.push(`${base}MDCR%20SNF_CPS_${year}.zip`);
  }

  // Also try 2022 variations with 2024-10
  // urls.push(`https://data.cms.gov/sites/default/files/2024-10/MDCR%20SNF_CPS_06SNF_2022.zip`);

  const found = [];
  
  // Process in chunks
  const CHUNK = 5;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const chunk = urls.slice(i, i + CHUNK);
    const promises = chunk.map(async (url) => {
        try {
            const resp = await fetch(url, { headers: { 'Range': 'bytes=0-10' } });
            if (resp.ok || resp.status === 206) {
                const buf = await resp.arrayBuffer();
                const arr = new Uint8Array(buf);
                if (arr[0] === 0x50 && arr[1] === 0x4B) { // PK
                    return url;
                }
            }
        } catch (e) {}
        return null;
    });
    
    const results = await Promise.all(promises);
    results.forEach(r => { if (r) found.push(r); });
    if (found.length > 0) break; // found one!
  }

  return Response.json({ found, tried: urls.length });
});