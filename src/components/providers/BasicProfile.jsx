import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, MapPin, Phone, Printer, Stethoscope, Mail } from 'lucide-react';
import EmailValidationBadge from '../emailBot/EmailValidationBadge';

export default function BasicProfile({ provider, taxonomy, locations }) {
  const primaryLocation = locations?.find(l => l.is_primary) || locations?.[0];
  const primaryTaxonomy = taxonomy?.find(t => t.primary_flag) || taxonomy?.[0];

  const formatName = () => {
    if (provider.entity_type === 'Organization') {
      return provider.organization_name || 'Unknown Organization';
    }
    return `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || 'Unknown';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Provider Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{formatName()}</h2>
          {provider.credential && (
            <p className="text-gray-600">{provider.credential}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{provider.entity_type}</Badge>
            <Badge variant="outline">NPI: {provider.npi}</Badge>
            {provider.needs_nppes_enrichment && (
              <Badge className="bg-orange-100 text-orange-800">Needs Enrichment</Badge>
            )}
          </div>
        </div>

        {primaryTaxonomy && (
          <div className="flex items-start gap-2 p-3 bg-teal-50 rounded-lg">
            <Stethoscope className="h-5 w-5 text-teal-600 mt-0.5" />
            <div>
              <p className="font-medium text-teal-900">Primary Specialty</p>
              <p className="text-sm text-teal-700">
                {primaryTaxonomy.taxonomy_description || primaryTaxonomy.taxonomy_code}
              </p>
            </div>
          </div>
        )}

        {taxonomy && taxonomy.length > 1 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Additional Specialties:</p>
            <div className="flex flex-wrap gap-2">
              {taxonomy.filter(t => !t.primary_flag).slice(0, 3).map((t, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {t.taxonomy_description || t.taxonomy_code}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {primaryLocation && (
          <div className="space-y-2 pt-3 border-t">
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">Primary Practice Location</p>
                {primaryLocation.address_1 && <p className="text-sm text-gray-600">{primaryLocation.address_1}</p>}
                <p className="text-sm text-gray-600">
                  {primaryLocation.city}, {primaryLocation.state} {primaryLocation.zip}
                </p>
              </div>
            </div>

            {primaryLocation.phone && (
              <div className="flex items-center gap-2 ml-7">
                <Phone className="h-4 w-4 text-gray-500" />
                <p className="text-sm text-gray-600">{primaryLocation.phone}</p>
              </div>
            )}

            {primaryLocation.fax && (
              <div className="flex items-center gap-2 ml-7">
                <Printer className="h-4 w-4 text-gray-500" />
                <p className="text-sm text-gray-600">{primaryLocation.fax}</p>
              </div>
            )}
          </div>
        )}

        {provider.email && (
          <div className="flex items-start gap-2 pt-3 border-t">
            <Mail className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium">Email</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm text-gray-600">{provider.email}</p>
                {provider.email_confidence && (
                  <Badge className={`text-[10px] ${
                    provider.email_confidence === 'high' ? 'bg-green-100 text-green-800' :
                    provider.email_confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>{provider.email_confidence}</Badge>
                )}
                <EmailValidationBadge
                  status={provider.email_validation_status}
                  reason={provider.email_validation_reason}
                />
              </div>
            </div>
          </div>
        )}

        {locations && locations.length > 1 && (
          <div className="pt-3 border-t">
            <p className="text-sm text-gray-600">
              {locations.length} practice location{locations.length !== 1 ? 's' : ''} on file
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}