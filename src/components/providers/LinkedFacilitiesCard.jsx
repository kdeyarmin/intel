import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin, Star, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const TYPE_LABELS = {
  hospital_readmissions: 'Hospital',
  hospital_hcahps: 'Hospital (HCAHPS)',
  hospital_spending: 'Hospital (Spending)',
  hospital_timely_care: 'Hospital (Timely Care)',
  hospital_hac: 'Hospital (HAC)',
  home_health_agencies: 'Home Health',
  home_health_enrollments: 'Home Health',
  hospice_general_info: 'Hospice',
  hospice_provider_data: 'Hospice',
  snf_quality: 'Nursing Home',
  nursing_home_general: 'Nursing Home',
};

function getGroupFromType(ft) {
  if (ft?.startsWith('hospital')) return 'hospital';
  if (ft?.startsWith('home_health') || ft?.startsWith('medicare_hha')) return 'home_health';
  if (ft?.startsWith('hospice') || ft?.startsWith('medicare_hospice')) return 'hospice';
  if (ft?.startsWith('snf') || ft?.startsWith('nursing_home')) return 'snf';
  return null;
}

export default function LinkedFacilitiesCard({ linkedFacilities }) {
  const navigate = useNavigate();

  if (!linkedFacilities || linkedFacilities.length === 0) return null;

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Linked Facilities
          </CardTitle>
          <Badge className="bg-cyan-900/30 text-cyan-400 border-cyan-500/30 text-xs">
            {linkedFacilities.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {linkedFacilities.map((f, i) => {
          const group = getGroupFromType(f.facility_type);
          const label = TYPE_LABELS[f.facility_type] || f.facility_type?.replace(/_/g, ' ');

          return (
            <div
              key={i}
              className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30 hover:border-slate-600/50 cursor-pointer transition-colors"
              onClick={() => {
                if (group && f.provider_id) {
                  navigate(createPageUrl('FacilityDetail') + `?id=${f.provider_id}&group=${group}`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200 truncate">
                    {f.facility_name || f.provider_id}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className="bg-slate-800/50 text-slate-400 border-slate-500/30 text-[10px]">
                      {label}
                    </Badge>
                    {f.city && f.state && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" />
                        {f.city}, {f.state}
                      </span>
                    )}
                    {f.data_year && (
                      <span className="text-[10px] text-slate-400">{f.data_year}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.quality_rating && (
                    <Badge className="bg-amber-900/30 text-amber-400 border-amber-500/30 text-xs">
                      <Star className="w-3 h-3 mr-0.5" />{f.quality_rating}
                    </Badge>
                  )}
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
