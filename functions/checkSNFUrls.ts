import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const urls = [
    'https://data.cms.gov/sites/default/files/2026-01/CPS%20MDCR%20SNF%202023.zip',
    'https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF_CPS_07SNF_2023.zip',
    'https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF_CPS_2023.zip',
    'https://data.cms.gov/sites/default/files/2026-01/MDCR_SNF_CPS_2023.zip',
    'https://data.cms.gov/sites/default/files/2025-12/CPS%20MDCR%20SNF%202023.zip',
    'https://data.cms.gov/sites/default/files/2026-02/CPS%20MDCR%20SNF%202023.zip',
    'https://data.cms.gov/sites/default/files/2026-01/CPS_MDCR_SNF_2023.zip'
  ];

  const results = [];
  
  for (const url of urls) {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (resp.ok) {
        // If HEAD works, try to get first few bytes to check if it's a zip
        const rangeResp = await fetch(url, { headers: { 'Range': 'bytes=0-10' } });
        const buf = await rangeResp.arrayBuffer();
        const arr = new Uint8Array(buf);
        const isZip = arr[0] === 0x50 && arr[1] === 0x4B;
        results.push({ url, status: resp.status, isZip, header: arr.slice(0, 4) });
      } else {
        results.push({ url, status: resp.status });
      }
    } catch (e) {
      results.push({ url, error: e.message });
    }
  }

  return Response.json({ results });
});