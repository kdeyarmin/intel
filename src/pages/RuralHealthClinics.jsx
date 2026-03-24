import React from 'react';
import { Trees } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function RuralHealthClinics() {
  return (
    <FacilityListPage
      facilityGroup="rhc"
      title="Rural Health Clinics"
      icon={Trees}
      iconCls="text-emerald-400"
      detailPage="FacilityDetail"
    />
  );
}
