import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { automation_id, config } = await req.json();

    if (!automation_id || !config) {
      return Response.json({ error: 'Missing automation_id or config in request body' }, { status: 400 });
    }

    const automation = await base44.asServiceRole.updateAutomation(automation_id, config);

    return Response.json({ success: true, automation });
  } catch (error) {
    console.error('Failed to update automation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});