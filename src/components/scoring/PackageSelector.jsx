import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Home, Stethoscope } from 'lucide-react';

const packages = [
  {
    id: 'behavioral_health',
    name: 'Behavioral Health Package',
    icon: Brain,
    description: 'Optimize for psychiatry and mental health providers',
    weights: {
      specialty: 35,
      enrollment: 10,
      volume: 20,
      referrals: 15,
      group_size: 10,
      geography: 10,
    },
  },
  {
    id: 'home_health_hospice',
    name: 'Home Health/Hospice Package',
    icon: Home,
    description: 'Focus on providers with high referral activity',
    weights: {
      specialty: 10,
      enrollment: 15,
      volume: 15,
      referrals: 40,
      group_size: 10,
      geography: 10,
    },
  },
  {
    id: 'primary_care',
    name: 'Primary Care Package',
    icon: Stethoscope,
    description: 'Target high-volume primary care practices',
    weights: {
      specialty: 25,
      enrollment: 15,
      volume: 30,
      referrals: 10,
      group_size: 10,
      geography: 10,
    },
  },
];

export default function PackageSelector({ onApply }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring Packages</CardTitle>
        <p className="text-sm text-gray-600">Pre-configured weight templates for different use cases</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {packages.map(pkg => {
          const Icon = pkg.icon;
          return (
            <div key={pkg.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="font-medium">{pkg.name}</p>
                  <p className="text-sm text-gray-600">{pkg.description}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">Referrals: {pkg.weights.referrals}%</Badge>
                    <Badge variant="outline" className="text-xs">Volume: {pkg.weights.volume}%</Badge>
                    <Badge variant="outline" className="text-xs">Specialty: {pkg.weights.specialty}%</Badge>
                  </div>
                </div>
              </div>
              <Button 
                onClick={() => onApply(pkg.weights)}
                variant="outline"
                size="sm"
              >
                Apply
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}