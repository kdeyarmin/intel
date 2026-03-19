import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const componentLabels = {
  specialty_match: 'Specialty Match',
  medicare_status: 'Medicare Status',
  patient_volume: 'Patient Volume',
  referral_signals: 'Referral Activity',
  group_size: 'Group Size',
  geography: 'Geography',
};

export default function ScoreBreakdown({ score, breakdown, reasons }) {
  if (!breakdown) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>CareMetric Fit Score</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {score && (
          <div className="flex items-center gap-4 pb-4 border-b">
            <div className="text-5xl font-bold text-teal-600">{score}</div>
            <div className="text-gray-600">
              <p className="text-sm">Out of 100</p>
            </div>
          </div>
        )}
        {Object.entries(breakdown).map(([key, data]) => {
          const percentage = data.weight > 0 ? (data.contribution / data.weight) * 100 : 0;
          
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{componentLabels[key]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{data.value}/100</span>
                  <Badge variant="outline" className="text-xs">
                    {data.contribution.toFixed(1)} pts
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={percentage} className="h-2 flex-1" />
                <span className="text-xs text-gray-500 w-12 text-right">
                  {data.weight}% wt
                </span>
              </div>
            </div>
          );
        })}

        {reasons && reasons.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-sm font-medium mb-2">Key Factors:</p>
            <ul className="space-y-1">
              {reasons.map((reason, idx) => (
                <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}