import React from 'react';
import { Heart } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function HomeHealthAgencies() {
  return (
    <FacilityListPage
      facilityGroup="home_health"
      title="Home Health Agencies"
      icon={Heart}
      color="green"
      detailPage="FacilityDetail"
    />
  );
}
