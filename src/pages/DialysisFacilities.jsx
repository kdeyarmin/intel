import React from 'react';
import { Activity } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function DialysisFacilities() {
  return (
    <FacilityListPage
      facilityGroup="dialysis"
      title="Dialysis Facilities"
      icon={Activity}
      iconCls="text-teal-400"
      detailPage="FacilityDetail"
    />
  );
}
