import React from 'react';
import { HeartHandshake } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function Hospices() {
  return (
    <FacilityListPage
      facilityGroup="hospice"
      title="Hospices"
      icon={HeartHandshake}
      iconCls="text-purple-400"
      detailPage="FacilityDetail"
    />
  );
}
