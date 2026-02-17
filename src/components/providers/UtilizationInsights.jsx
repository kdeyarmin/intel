import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, Activity } from 'lucide-react';

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
          <p className="text-sm text-gray-500">No utilization data available</p>
        </CardContent>
      </Card>
    );
  }

  const patientVolume = utilization.total_medicare_beneficiaries || 0;
  const totalServices = utilization.total_services || 0;
  const servicesPerPatient = patientVolume > 0 ? (totalServices / patientVolume).toFixed(1) : 0;

  const getVolumeIndicator = () => {
    if (patientVolume >= 1000) return { label: 'Very High', color: 'bg-purple-100 text-purple-800' };
    if (patientVolume >= 500) return { label: 'High', color: 'bg-blue-100 text-blue-800' };
    if (patientVolume >= 200) return { label: 'Moderate', color: 'bg-green-100 text-green-800' };
    return { label: 'Low', color: 'bg-gray-100 text-gray-800' };
  };

  const getIntensityIndicator = () => {
    if (servicesPerPatient >= 15) return { label: 'High Intensity', color: 'bg-red-100 text-red-800' };
    if (servicesPerPatient >= 8) return { label: 'Moderate Intensity', color: 'bg-yellow-100 text-yellow-800' };
    return { label: 'Standard Care', color: 'bg-green-100 text-green-800' };
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
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-600" />
              <p className="text-xs text-blue-600 font-medium">Patient Volume</p>
            </div>
            <p className="text-2xl font-bold text-blue-900">{patientVolume.toLocaleString()}</p>
            <p className="text-xs text-blue-700">Medicare beneficiaries ({utilization.year})</p>
          </div>

          <div className="p-3 bg-teal-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-teal-600" />
              <p className="text-xs text-teal-600 font-medium">Service Intensity</p>
            </div>
            <p className="text-2xl font-bold text-teal-900">{servicesPerPatient}</p>
            <p className="text-xs text-teal-700">Services per patient</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Volume Classification</span>
            <Badge className={volumeIndicator.color}>{volumeIndicator.label}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Care Intensity</span>
            <Badge className={intensityIndicator.color}>{intensityIndicator.label}</Badge>
          </div>
        </div>

        <div className="pt-3 border-t">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-gray-500">Total Services</p>
              <p className="font-medium">{totalServices.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Medicare Payments</p>
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