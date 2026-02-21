import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const codes = ['01SNF', '02SNF', '03SNF', '04SNF', '05SNF', '06SNF', '07SNF', '08SNF', '09SNF', '10SNF', 'SNF', '01MDCR', '02MDCR'];
  const years = [2023];
  const patterns = [
    (code, year) => `https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF_CPS_${code}_${year}.zip`,
    (code, year) => `https://data.cms.gov/sites/default/files/2026-01/MDCR_SNF_CPS_${code}_${year}.zip`,
    (code, year) => `https://data.cms.gov/sites/default/files/2026-01/CPS%20MDCR%20SNF%20${year}.zip`, // old pattern
    (code, year) => `https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF%20CPS%20${code}%20${year}.zip`
  ];

  const urls = [];
  for (const year of years) {
      for (const code of codes) {
          for (const pattern of patterns) {
              urls.push(pattern(code, year));
          }
      }
      // Add HHA style without code just in case
      urls.push(`https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF_CPS_${year}.zip`);
  }

  // Also try 2022 URL variations with 2024-10 date
  urls.push(`https://data.cms.gov/sites/default/files/2024-10/MDCR%20SNF_CPS_06SNF_2022.zip`);

  const results = [];
  
  // Test in parallel chunks of 10
  const CHUNK_SIZE = 10;
  for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
    const chunk = urls.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (url) => {
        try {
            const rangeResp = await fetch(url, { headers: { 'Range': 'bytes=0-10' } });
            if (rangeResp.status === 206 || rangeResp.ok) {
                const buf = await rangeResp.arrayBuffer();
                const arr = new Uint8Array(buf);
                const isZip = arr[0] === 0x50 && arr[1] === 0x4B;
                if (isZip) return { url, isZip: true };
            }
        } catch (e) {}
        return null;
    });
    
    const chunkResults = await Promise.all(promises);
    const found = chunkResults.filter(r => r);
    if (found.length > 0) return Response.json({ found });
  }

  return Response.json({ found: [] });
});