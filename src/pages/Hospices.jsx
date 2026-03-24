import React from 'react';
import { HeartHandshake } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function Hospices() {
  return (
    <FacilityListPage
      facilityGroup="hospice"
      title="Hospices"
      icon={HeartHandshake}
      color="purple"
      detailPage="FacilityDetail"
    />
  );
}
