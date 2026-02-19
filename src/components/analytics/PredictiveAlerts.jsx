import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp, CheckCircle2, Info } from 'lucide-react';

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  points.forEach(([x, y]) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });
  const denom = (n * sumX2 - sumX * sumX);
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export default function PredictiveAlerts({ metrics }) {
  const alerts = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date));
    if (sorted.length < 3) return [];

    const results = [];

    // Analyze completeness trend
    const compPoints = sorted.map((m, i) => [i, m.completeness_score || 0]);
    const compReg = linearRegression(compPoints);
    if (compReg.slope < -0.5) {
      const daysToThreshold = compReg.intercept > 50 ? Math.round((compReg.intercept - 50) / Math.abs(compReg.slope)) : 0;
      results.push({
        severity: 'warning',
        title: 'Completeness Score Declining',
        description: `Completeness is dropping by ~${Math.abs(compReg.slope).toFixed(1)} points/day.${daysToThreshold > 0 ? ` May fall below 50% in ~${daysToThreshold} days.` : ''}`,
        icon: TrendingDown,
      });
    } else if (compReg.slope > 0.5) {
      results.push({
        severity: 'positive',
        title: 'Completeness Improving',
        description: `Completeness is improving by ~${compReg.slope.toFixed(1)} points/day.`,
        icon: TrendingUp,
      });
    }

    // Analyze accuracy trend
    const accPoints = sorted.map((m, i) => [i, m.accuracy_score || 0]);
    const accReg = linearRegression(accPoints);
    if (accReg.slope < -0.5) {
      results.push({
        severity: 'warning',
        title: 'Accuracy Score Declining',
        description: `Data accuracy is decreasing. Check recent imports for data quality issues.`,
        icon: TrendingDown,
      });
    }

    // Analyze enrichment backlog
    const latestEnrichment = sorted[sorted.length - 1]?.providers_needing_enrichment || 0;
    const latestTotal = sorted[sorted.length - 1]?.total_providers || 1;
    const enrichmentPct = (latestEnrichment / latestTotal) * 100;
    if (enrichmentPct > 30) {
      results.push({
        severity: 'critical',
        title: 'High Enrichment Backlog',
        description: `${enrichmentPct.toFixed(0)}% of providers (${latestEnrichment.toLocaleString()}) need NPPES enrichment. Consider running enrichment.`,
        icon: AlertTriangle,
      });
    } else if (enrichmentPct > 10) {
      results.push({
        severity: 'warning',
        title: 'Growing Enrichment Backlog',
        description: `${latestEnrichment.toLocaleString()} providers need NPPES enrichment (${enrichmentPct.toFixed(0)}%).`,
        icon: Info,
      });
    }

    // Analyze import failure trend
    const failPoints = sorted.map((m, i) => [i, m.imports_failed_today || 0]);
    const failReg = linearRegression(failPoints);
    if (failReg.slope > 0.2) {
      results.push({
        severity: 'warning',
        title: 'Import Failures Increasing',
        description: `Import failures are trending upward. Review API connectivity and data source availability.`,
        icon: TrendingDown,
      });
    }

    // Stale data check
    const latest = sorted[sorted.length - 1];
    if (latest && latest.imports_today === 0 && sorted.length > 2) {
      const recentNoImports = sorted.slice(-3).every(m => (m.imports_today || 0) === 0);
      if (recentNoImports) {
        results.push({
          severity: 'info',
          title: 'No Recent Imports',
          description: `No imports have run in the last few snapshots. Check that scheduled imports are active.`,
          icon: Info,
        });
      }
    }

    // All good
    if (results.length === 0) {
      results.push({
        severity: 'positive',
        title: 'All Systems Healthy',
        description: 'No data quality issues detected. All trends are stable or improving.',
        icon: CheckCircle2,
      });
    }

    return results;
  }, [metrics]);

  const severityStyles = {
    critical: { bg: 'bg-red-50 border-red-200', icon: 'text-red-600', badge: 'bg-red-100 text-red-700' },
    warning: { bg: 'bg-yellow-50 border-yellow-200', icon: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700' },
    info: { bg: 'bg-blue-50 border-blue-200', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
    positive: { bg: 'bg-green-50 border-green-200', icon: 'text-green-600', badge: 'bg-green-100 text-green-700' },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Predictive Quality Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {metrics.length < 3 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            Predictive alerts require at least 3 daily snapshots. Capture snapshots daily to enable forecasting.
          </p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, idx) => {
              const styles = severityStyles[alert.severity];
              const Icon = alert.icon;
              return (
                <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${styles.bg}`}>
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${styles.icon}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm text-gray-900">{alert.title}</p>
                      <Badge className={`text-[10px] px-1.5 py-0 ${styles.badge}`}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600">{alert.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}