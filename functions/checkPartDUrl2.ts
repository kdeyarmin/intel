import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const months = ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];
    const names = [
        'CPS%20MDCR%20UTLZN%20D%202023.zip',
        'MDCR%20UTLZN%20D%202023.zip',
        'MDCR%20Part%20D%202023.zip',
        'CPS%20MDCR%20UTLZN%20D%202022.zip'
    ];
    
    const urls = [];
    for (const m of months) {
        for (const n of names) {
            urls.push(`https://data.cms.gov/sites/default/files/${m}/${n}`);
        }
    }

    const found = [];
    const CHUNK = 5;
    
    for (let i = 0; i < urls.length; i += CHUNK) {
        const chunk = urls.slice(i, i + CHUNK);
        const promises = chunk.map(async (url) => {
            try {
                const resp = await fetch(url, { method: 'HEAD' });
                const type = resp.headers.get('content-type');
                if (resp.ok && type && (type.includes('zip') || type.includes('octet-stream'))) {
                    return { url, type };
                }
            } catch(e) {}
            return null;
        });
        const results = await Promise.all(promises);
        results.forEach(r => { if(r) found.push(r); });
    }

    return Response.json({ found, tried: urls.length });
});