import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const payload = await req.json().catch(() => ({}));
  const urls = payload.urls || [
    'https://data.cms.gov/sites/default/files/2026-01/CPS%20MDCR%20SNF%202023.zip',
  ];

  const results = [];
  
  for (const url of urls) {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      // CMS servers sometimes reject HEAD or return 405. If so, try GET with Range.
      let isOk = resp.ok;
      let status = resp.status;
      
      if (!isOk && (status === 405 || status === 403)) {
          // try GET
      }
      
      // Always try GET range to be sure
      const rangeResp = await fetch(url, { headers: { 'Range': 'bytes=0-10' } });
      status = rangeResp.status;
      
      if (rangeResp.ok || status === 206) {
        const buf = await rangeResp.arrayBuffer();
        const arr = new Uint8Array(buf);
        const isZip = arr[0] === 0x50 && arr[1] === 0x4B;
        results.push({ url, status, isZip, header: arr.slice(0, 4) });
      } else {
        results.push({ url, status });
      }
    } catch (e) {
      results.push({ url, error: e.message });
    }
  }

  return Response.json({ results });
});