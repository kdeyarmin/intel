import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export default function ComplianceDisclaimer() {
  return (
    <Alert className="bg-blue-50 border-blue-200">
      <Info className="h-4 w-4 text-blue-600" />
      <AlertDescription className="text-sm text-blue-900">
        <strong>Data Sources:</strong> All data is derived from publicly available CMS Medicare datasets and NPPES National Provider files. 
        Insights are estimates based on public data patterns and do not represent confirmed referral relationships. 
        Small cell counts (&lt;11) are suppressed for privacy compliance.
      </AlertDescription>
    </Alert>
  );
}