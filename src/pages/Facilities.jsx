import React from 'react';
import { Building2, Heart, HeartHandshake, Home, HeartPulse, BedDouble, Package, Building } from 'lucide-react';
import FacilityListPage from '@/components/facilities/FacilityListPage';
import PageTabs from '@/components/layout/PageTabs';
import { FACILITY_TYPES } from '@/components/layout/navConfig';
import { useUrlState } from '@/hooks/useUrlState';

// One page for every Medicare facility type (it replaces eight identical
// pages); ?type= picks the type and old page URLs redirect here.
const LOOK = {
  hospital: { title: 'Hospitals', icon: Building2, iconCls: 'text-blue-400' },
  home_health: { title: 'Home Health Agencies', icon: Heart, iconCls: 'text-green-400' },
  hospice: { title: 'Hospices', icon: HeartHandshake, iconCls: 'text-purple-400' },
  snf: { title: 'Nursing Homes & SNFs', icon: Home, iconCls: 'text-amber-400' },
  irf: { title: 'Inpatient Rehab Facilities', icon: HeartPulse, iconCls: 'text-rose-400' },
  ltch: { title: 'Long-Term Care Hospitals', icon: BedDouble, iconCls: 'text-orange-400' },
  dme: { title: 'DME Suppliers', icon: Package, iconCls: 'text-cyan-400' },
  community_health: { title: 'Community Health Centers', icon: Building, iconCls: 'text-lime-400' },
};

const URL_DEFAULTS = { type: 'hospital', page: 1 };

export default function Facilities() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const type = LOOK[url.type] ? url.type : 'hospital';
  const look = LOOK[type];

  return (
    <div>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 max-w-[1400px] mx-auto">
        <PageTabs current="Facilities" />
        <nav aria-label="Facility type" className="overflow-x-auto">
          <ul className="flex w-max gap-1.5">
            {FACILITY_TYPES.map((t) => {
              const active = t.type === type;
              return (
                <li key={t.type}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setUrl({ type: t.type, page: 1 })}
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? 'border-cyan-500/40 bg-cyan-900/30 text-cyan-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <FacilityListPage key={type} facilityGroup={type} title={look.title} icon={look.icon} iconCls={look.iconCls} detailPage="FacilityDetail" />
    </div>
  );
}
