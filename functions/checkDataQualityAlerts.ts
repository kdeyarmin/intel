import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role === 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get latest 2 scans to detect drops
    const scans = await base44.asServiceRole.entities.DataQualityScan.list('-created_date', 2);

    const alerts = [];
    let currentScan = scans[0];
    let previousScan = scans[1];

    if (!currentScan) {
      return Response.json({ alerts: [], message: 'No quality scan data available' });
    }

    const currentScore = currentScan.completeness_score || 0;
    const previousScore = previousScan?.completeness_score || currentScore;
    const scoreDrop = previousScore - currentScore;

    // ALERT 1: Significant quality drop (>10%)
    if (scoreDrop > 10) {
      alerts.push({
        severity: 'high',
        type: 'quality_drop',
        title: 'Significant Data Quality Drop Detected',
        message: `Quality score dropped ${scoreDrop}% (from ${previousScore}% to ${currentScore}%)`,
        metric: 'completeness_score',
        action_required: true,
      });
    } else if (scoreDrop > 5) {
      alerts.push({
        severity: 'medium',
        type: 'quality_decline',
        title: 'Data Quality Declining',
        message: `Quality score dropped ${scoreDrop}% (from ${previousScore}% to ${currentScore}%)`,
        metric: 'completeness_score',
        action_required: false,
      });
    }

    // Analyze quality details
    if (currentScan.quality_details) {
      const details = currentScan.quality_details;

      // ALERT 2: Low email coverage
      if (details.email_quality?.completeness_percent < 40) {
        alerts.push({
          severity: 'high',
          type: 'low_email_coverage',
          title: 'Low Email Coverage',
          message: `Only ${details.email_quality.completeness_percent}% of providers have email addresses`,
          metric: 'email_quality',
          action_required: true,
        });
      }

      // ALERT 3: Poor email validation rate
      if (details.email_quality?.valid_percent < 50) {
        alerts.push({
          severity: 'medium',
          type: 'poor_email_validation',
          title: 'Low Email Validation Rate',
          message: `Only ${details.email_quality.valid_percent}% of emails are validated as valid`,
          metric: 'email_validation',
          action_required: false,
        });
      }

      // ALERT 4: Low location coverage
      if (details.location_metrics?.field_completeness < 60) {
        alerts.push({
          severity: 'medium',
          type: 'low_location_completeness',
          title: 'Location Data Incomplete',
          message: `Location data completeness at ${details.location_metrics.field_completeness}%`,
          metric: 'location_completeness',
          action_required: true,
        });
      }

      // ALERT 5: High deactivation rate
      if (details.deactivated_providers > details.provider_metrics.total_records * 0.1) {
        alerts.push({
          severity: 'low',
          type: 'high_deactivation',
          title: 'High Provider Deactivation Rate',
          message: `${details.deactivated_providers} providers are deactivated (${Math.round((details.deactivated_providers / details.provider_metrics.total_records) * 100)}%)`,
          metric: 'deactivation_rate',
          action_required: false,
        });
      }

      // ALERT 6: Poor referral coverage
      if (details.referral_coverage?.coverage_percent < 30) {
        alerts.push({
          severity: 'low',
          type: 'low_referral_coverage',
          title: 'Limited Referral Data',
          message: `Only ${details.referral_coverage.coverage_percent}% of providers have referral data`,
          metric: 'referral_coverage',
          action_required: false,
        });
      }
    }

    // Create alert records for high severity issues
    for (const alert of alerts) {
      if (alert.severity === 'high') {
        await base44.asServiceRole.entities.DataQualityAlert.create({
          alert_type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.message,
          metric_affected: alert.metric,
          action_required: alert.action_required,
          status: 'new',
          scan_id: currentScan.id,
        });
      }
    }

    // Email notifications disabled per admin request

    return Response.json({
      success: true,
      alerts_detected: alerts.length,
      high_severity: alerts.filter(a => a.severity === 'high').length,
      medium_severity: alerts.filter(a => a.severity === 'medium').length,
      alerts: alerts,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});