import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all provider entities
    const [providers, locations, taxonomies, referrals, utilizations] = await Promise.all([
      base44.asServiceRole.entities.Provider.list('-created_date', 10000),
      base44.asServiceRole.entities.ProviderLocation.list('-created_date', 10000),
      base44.asServiceRole.entities.ProviderTaxonomy.list('-created_date', 10000),
      base44.asServiceRole.entities.CMSReferral.list('-created_date', 10000),
      base44.asServiceRole.entities.CMSUtilization.list('-created_date', 10000),
    ]);

    // Calculate completeness metrics
    const providerMetrics = calculateCompleteness(providers, [
      'npi', 'entity_type', 'status', 'first_name', 'last_name', 'organization_name',
      'enumeration_date', 'last_update_date'
    ]);

    const locationMetrics = calculateCompleteness(locations, [
      'npi', 'address_1', 'city', 'state', 'zip', 'phone'
    ]);

    const taxonomyMetrics = calculateCompleteness(taxonomies, [
      'npi', 'taxonomy_code', 'taxonomy_description', 'primary_flag'
    ]);

    // Calculate referral and utilization coverage
    const providerNPIs = new Set(providers.map(p => p.npi));
    const referralCoverage = referrals.filter(r => providerNPIs.has(r.npi)).length;
    const utilizationCoverage = utilizations.filter(u => providerNPIs.has(u.npi)).length;

    // Email field completeness
    const emailCompleteness = {
      total: providers.length,
      with_email: providers.filter(p => p.email && p.email.trim()).length,
      with_validation: providers.filter(p => p.email_validation_status && p.email_validation_status !== 'unknown').length,
      valid_emails: providers.filter(p => p.email_validation_status === 'valid').length,
    };

    // Deactivated provider check
    const deactivatedCount = providers.filter(p => p.status === 'Deactivated').length;

    const providerCount = Math.max(1, providers.length);

    const reportData = {
      generated_at: new Date().toISOString(),
      period: 'weekly',
      provider_metrics: providerMetrics,
      location_metrics: locationMetrics,
      taxonomy_metrics: taxonomyMetrics,
      referral_coverage: {
        total_providers: providers.length,
        with_referrals: referralCoverage,
        coverage_percent: Math.round((referralCoverage / providerCount) * 100),
      },
      utilization_coverage: {
        total_providers: providers.length,
        with_utilization: utilizationCoverage,
        coverage_percent: Math.round((utilizationCoverage / providerCount) * 100),
      },
      email_quality: {
        ...emailCompleteness,
        completeness_percent: Math.round((emailCompleteness.with_email / providerCount) * 100),
        validation_percent: Math.round((emailCompleteness.with_validation / providerCount) * 100),
        valid_percent: Math.round((emailCompleteness.valid_emails / providerCount) * 100),
      },
      deactivated_providers: deactivatedCount,
      data_quality_score: calculateQualityScore(
        providerMetrics.field_completeness,
        locationMetrics.field_completeness,
        emailCompleteness.with_email / providerCount,
        referralCoverage / providerCount
      ),
    };

    // Store the report
    const record = await base44.asServiceRole.entities.DataQualityScan.create({
      scan_date: new Date().toISOString(),
      entity_type: 'providers',
      total_records: providers.length,
      completeness_score: Math.round((providerMetrics.field_completeness + locationMetrics.field_completeness) / 2),
      accuracy_issues: 0,
      duplicate_count: 0,
      quality_details: reportData,
      status: 'completed',
    });

    // Email notifications disabled per admin request

    return Response.json({
      success: true,
      report_id: record.id,
      quality_score: reportData.data_quality_score,
      summary: {
        providers: providers.length,
        locations: locations.length,
        completeness_percent: Math.round(reportData.data_quality_score),
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function calculateCompleteness(records, requiredFields) {
  if (!records.length) return { total_records: 0, field_completeness: 0, fields: {} };

  const fieldStats: Record<string, { present: number; percent: number }> = {};
  requiredFields.forEach(field => {
    const withField = records.filter(r => r[field] && String(r[field]).trim()).length;
    fieldStats[field] = {
      present: withField,
      percent: Math.round((withField / records.length) * 100),
    };
  });

  const avgCompleteness = Object.values(fieldStats).reduce(
    (sum, field) => sum + field.percent,
    0
  ) / requiredFields.length;

  return {
    total_records: records.length,
    field_completeness: avgCompleteness,
    fields: fieldStats,
  };
}

function calculateQualityScore(providerFieldComp, locationFieldComp, emailCov, referralCov) {
  return Math.round(
    (providerFieldComp * 0.35) +
    (locationFieldComp * 0.25) +
    (emailCov * 100 * 0.25) +
    (referralCov * 100 * 0.15)
  );
}
