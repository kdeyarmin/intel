import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, Activity } from 'lucide-react';
import { suppressSmallCell } from '../compliance/complianceUtils';

export default function UtilizationInsights({ utilization }) {
  if (!utilization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Utilization Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">No utilization data available</p>
        </CardContent>
      </Card>
    );
  }

  const rawPatientVolume = Number(utilization.total_medicare_beneficiaries) || 0;
  const rawTotalServices = Number(utilization.total_services) || 0;
  const patientVolume = suppressSmallCell(rawPatientVolume);
  const totalServices = suppressSmallCell(rawTotalServices);
  // Compute the ratio from the RAW numeric values, not the suppressed display
  // strings ('<11'), so it never becomes the string "NaN" and the intensity
  // thresholds below compare real numbers.
  const servicesPerPatient = rawPatientVolume > 0
    ? Number((rawTotalServices / rawPatientVolume).toFixed(1))
    : 0;

  const getVolumeIndicator = () => {
    if (patientVolume === '<11') return { label: 'Low Volume', color: 'bg-slate-700/40 text-slate-200' };
    if (patientVolume >= 1000) return { label: 'Very High', color: 'bg-purple-900/30 text-purple-300' };
    if (patientVolume >= 500) return { label: 'High', color: 'bg-blue-900/30 text-blue-300' };
    if (patientVolume >= 200) return { label: 'Moderate', color: 'bg-green-900/30 text-green-300' };
    return { label: 'Low', color: 'bg-slate-700/40 text-slate-200' };
  };

  const getIntensityIndicator = () => {
    if (servicesPerPatient >= 15) return { label: 'High Intensity', color: 'bg-red-900/30 text-red-400' };
    if (servicesPerPatient >= 8) return { label: 'Moderate Intensity', color: 'bg-yellow-900/30 text-yellow-400' };
    return { label: 'Standard Care', color: 'bg-green-900/30 text-green-400' };
  };

  const volumeIndicator = getVolumeIndicator();
  const intensityIndicator = getIntensityIndicator();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Utilization Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-blue-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-600" />
              <p className="text-xs text-blue-600 font-medium">Patient Volume</p>
            </div>
            <p className="text-2xl font-bold text-blue-400">
              {patientVolume === '<11' ? '<11' : patientVolume.toLocaleString()}
            </p>
            <p className="text-xs text-blue-400">Medicare beneficiaries ({utilization.year})</p>
          </div>

          <div className="p-3 bg-teal-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-teal-600" />
              <p className="text-xs text-teal-600 font-medium">Service Intensity</p>
            </div>
            <p className="text-2xl font-bold text-teal-400">{servicesPerPatient}</p>
            <p className="text-xs text-teal-400">Services per patient</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Volume Classification</span>
            <Badge className={volumeIndicator.color}>{volumeIndicator.label}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Care Intensity</span>
            <Badge className={intensityIndicator.color}>{intensityIndicator.label}</Badge>
          </div>
        </div>

        <div className="pt-3 border-t">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-400">Total Services</p>
              <p className="font-medium">
                {totalServices === '<11' ? '<11' : totalServices.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Medicare Payments</p>
              <p className="font-medium">
                ${(utilization.total_medicare_payment || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}