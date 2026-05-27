import React from 'react';
import { BedDouble } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function LongTermCare() {
  return (
    <FacilityListPage
      facilityGroup="ltch"
      title="Long-Term Care Hospitals"
      icon={BedDouble}
      iconCls="text-orange-400"
      detailPage="FacilityDetail"
    />
  );
}
