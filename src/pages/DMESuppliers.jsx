import React from 'react';
import { Package } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';

export default function DMESuppliers() {
  return (
    <FacilityListPage
      facilityGroup="dme"
      title="DME Suppliers"
      icon={Package}
      iconCls="text-cyan-400"
      detailPage="FacilityDetail"
    />
  );
}
