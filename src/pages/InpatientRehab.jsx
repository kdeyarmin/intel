import React from 'react';
import { HeartPulse } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function InpatientRehab() {
  return (
    <FacilityListPage
      facilityGroup="irf"
      title="Inpatient Rehab Facilities"
      icon={HeartPulse}
      iconCls="text-rose-400"
      detailPage="FacilityDetail"
    />
  );
}
