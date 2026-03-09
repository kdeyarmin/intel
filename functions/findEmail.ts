import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const files = [];
        for await (const entry of Deno.readDir('./functions')) {
            if (entry.isFile && entry.name.endsWith('.js')) {
                const content = await Deno.readTextFile(`./functions/${entry.name}`);
                if (content.includes('SendEmail')) {
                    files.push(entry.name);
                }
            }
        }
        return Response.json({ files });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
});