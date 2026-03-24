import React from 'react';
import { Home } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function NursingHomes() {
  return (
    <FacilityListPage
      facilityGroup="snf"
      title="Nursing Homes & SNFs"
      icon={Home}
      iconCls="text-amber-400"
      detailPage="FacilityDetail"
    />
  );
}
