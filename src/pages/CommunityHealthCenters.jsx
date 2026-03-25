import React from 'react';
import { Building } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function CommunityHealthCenters() {
  return (
    <FacilityListPage
      facilityGroup="community_health"
      title="Community Health Centers"
      icon={Building}
      iconCls="text-lime-400"
      detailPage="FacilityDetail"
    />
  );
}
