import React from 'react';
import { Building } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function FQHCs() {
  return (
    <FacilityListPage
      facilityGroup="fqhc"
      title="Federally Qualified Health Centers"
      icon={Building}
      iconCls="text-lime-400"
      detailPage="FacilityDetail"
    />
  );
}
