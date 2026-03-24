import React from 'react';
import { Building2 } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function Hospitals() {
  return (
    <FacilityListPage
      facilityGroup="hospital"
      title="Hospitals"
      icon={Building2}
      color="blue"
      detailPage="FacilityDetail"
    />
  );
}
