import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { campaign_id, message_id = null, action = null } = body;

    if (!campaign_id) {
      return Response.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    // If tracking specific action
    if (message_id && action) {
      const messages = await base44.asServiceRole.entities.OutreachMessage.filter(
        { id: message_id }
      );

      if (messages.length === 0) {
        return Response.json({ error: 'Message not found' }, { status: 404 });
      }

      const message = messages[0];
      const updateData = {};

      if (action === 'opened') {
        updateData.status = 'opened';
        updateData.opened_at = new Date().toISOString();
      } else if (action === 'responded') {
        updateData.status = 'responded';
        updateData.responded_at = new Date().toISOString();
      } else if (action === 'bounced') {
        updateData.status = 'bounced';
      }

      await base44.asServiceRole.entities.OutreachMessage.update(message_id, updateData);
    }

    // Get all campaign messages
    const messages = await base44.asServiceRole.entities.OutreachMessage.filter(
      { campaign_id }
    );

    // Calculate metrics
    const totalMessages = messages.length;
    const sentMessages = messages.filter(m => ['sent', 'opened', 'responded', 'bounced'].includes(m.status)).length;
    const openedMessages = messages.filter(m => m.opened_at).length;
    const respondedMessages = messages.filter(m => m.responded_at).length;
    const bouncedMessages = messages.filter(m => m.status === 'bounced').length;

    const metrics = {
      campaign_id,
      total_recipients: totalMessages,
      sent_count: sentMessages,
      pending_count: messages.filter(m => m.status === 'pending').length,
      open_rate: totalMessages > 0 ? (openedMessages / sentMessages * 100).toFixed(1) : 0,
      response_rate: sentMessages > 0 ? (respondedMessages / sentMessages * 100).toFixed(1) : 0,
      bounce_rate: sentMessages > 0 ? (bouncedMessages / sentMessages * 100).toFixed(1) : 0,
      conversion_count: respondedMessages,
      messages_by_status: {
        pending: messages.filter(m => m.status === 'pending').length,
        generated: messages.filter(m => m.status === 'generated').length,
        sent: messages.filter(m => m.status === 'sent').length,
        opened: openedMessages,
        responded: respondedMessages,
        bounced: bouncedMessages,
        failed: messages.filter(m => m.status === 'failed').length
      }
    };

    // Update campaign with metrics
    const campaigns = await base44.asServiceRole.entities.OutreachCampaign.filter(
      { id: campaign_id }
    );

    if (campaigns.length > 0) {
      await base44.asServiceRole.entities.OutreachCampaign.update(campaign_id, {
        sent_count: sentMessages,
        opened_count: openedMessages,
        responded_count: respondedMessages,
        bounced_count: bouncedMessages
      });
    }

    return Response.json({
      success: true,
      metrics
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});