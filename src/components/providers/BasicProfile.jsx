import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, MapPin, Phone, Printer, Stethoscope, Mail, Edit, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EmailValidationBadge from '../emailBot/EmailValidationBadge';

export default function BasicProfile({ provider, taxonomy, locations }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Provider.update(provider.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['provider', provider.npi]);
      toast.success('Provider updated successfully');
      setIsEditing(false);
    },
    onError: (err) => {
      toast.error('Failed to update provider: ' + err.message);
    }
  });

  const handleEditClick = () => {
    setEditForm({
      first_name: provider.first_name || '',
      last_name: provider.last_name || '',
      middle_name: provider.middle_name || '',
      organization_name: provider.organization_name || '',
      credential: provider.credential || '',
      email: provider.email || '',
      status: provider.status || 'Active',
      entity_type: provider.entity_type
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(editForm);
  };

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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <User className="h-5 w-5" />
          Provider Profile
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={handleEditClick} className="h-8 w-8 p-0">
          <Edit className="h-4 w-4 text-slate-500" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div>
          <h2 className="text-2xl font-bold leading-tight">{formatName()}</h2>
          {provider.credential && (
            <p className="text-gray-600">{provider.credential}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline">{provider.entity_type}</Badge>
            <Badge variant="outline">NPI: {provider.npi}</Badge>
            {provider.status === 'Deactivated' && <Badge variant="destructive">Deactivated</Badge>}
            {provider.needs_nppes_enrichment && (
              <Badge className="bg-orange-100 text-orange-800 border-orange-200">Needs Enrichment</Badge>
            )}
          </div>
        </div>

        {primaryTaxonomy && (
          <div className="flex items-start gap-2 p-3 bg-teal-50 rounded-lg border border-teal-100">
            <Stethoscope className="h-5 w-5 text-teal-600 mt-0.5" />
            <div>
              <p className="font-medium text-teal-900 text-sm">Primary Specialty</p>
              <p className="text-sm text-teal-700">
                {primaryTaxonomy.taxonomy_description || primaryTaxonomy.taxonomy_code}
              </p>
            </div>
          </div>
        )}

        {taxonomy && taxonomy.length > 1 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Additional Specialties</p>
            <div className="flex flex-wrap gap-2">
              {taxonomy.filter(t => !t.primary_flag).slice(0, 3).map((t, idx) => (
                <Badge key={idx} variant="outline" className="text-xs font-normal">
                  {t.taxonomy_description || t.taxonomy_code}
                </Badge>
              ))}
              {taxonomy.filter(t => !t.primary_flag).length > 3 && (
                <Badge variant="outline" className="text-xs font-normal text-gray-500">
                  +{taxonomy.filter(t => !t.primary_flag).length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {primaryLocation && (
          <div className="space-y-2 pt-3 border-t">
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Primary Practice Location</p>
                {primaryLocation.address_1 && <p className="text-sm text-gray-600">{primaryLocation.address_1}</p>}
                <p className="text-sm text-gray-600">
                  {primaryLocation.city}, {primaryLocation.state} {primaryLocation.zip}
                </p>
              </div>
            </div>

            {primaryLocation.phone && (
              <div className="flex items-center gap-2 ml-7">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-xs text-gray-600">{primaryLocation.phone}</p>
              </div>
            )}

            {primaryLocation.fax && (
              <div className="flex items-center gap-2 ml-7">
                <Printer className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-xs text-gray-600">{primaryLocation.fax}</p>
              </div>
            )}
          </div>
        )}

        {provider.email && (
          <div className="flex items-start gap-2 pt-3 border-t">
            <Mail className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">Email</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-sm text-gray-600 truncate">{provider.email}</p>
                {provider.email_confidence && (
                  <Badge className={`text-[10px] h-5 px-1.5 ${
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
            <p className="text-xs text-gray-500">
              {locations.length} practice location{locations.length !== 1 ? 's' : ''} on file
            </p>
          </div>
        )}
      </CardContent>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Provider Details</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {provider.entity_type === 'Individual' ? (
                <>
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input 
                      value={editForm.first_name} 
                      onChange={(e) => setEditForm({...editForm, first_name: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input 
                      value={editForm.last_name} 
                      onChange={(e) => setEditForm({...editForm, last_name: e.target.value})} 
                    />
                  </div>
                </>
              ) : (
                <div className="col-span-2 space-y-2">
                  <Label>Organization Name</Label>
                  <Input 
                    value={editForm.organization_name} 
                    onChange={(e) => setEditForm({...editForm, organization_name: e.target.value})} 
                  />
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label>Credential</Label>
                <Input 
                  value={editForm.credential} 
                  onChange={(e) => setEditForm({...editForm, credential: e.target.value})} 
                  placeholder="e.g. MD, DO"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={editForm.status} 
                  onValueChange={(val) => setEditForm({...editForm, status: val})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Deactivated">Deactivated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input 
                value={editForm.email} 
                onChange={(e) => setEditForm({...editForm, email: e.target.value})} 
                type="email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}