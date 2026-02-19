import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { config } = await req.json();

    if (!config) {
      return Response.json({ error: 'Missing config in request body' }, { status: 400 });
    }

    const automation = await base44.asServiceRole.createAutomation(config);

    return Response.json({ success: true, automation });
  } catch (error) {
    console.error('Failed to create automation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});