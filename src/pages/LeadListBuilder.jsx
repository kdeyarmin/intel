import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Download, Users } from 'lucide-react';
import LeadListFilters from '../components/leadlists/LeadListFilters';
import LeadResultsTable from '../components/leadlists/LeadResultsTable';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';
import PageHeader from '../components/shared/PageHeader';

export default function LeadListBuilder() {
  const [filters, setFilters] = useState({
    state: 'PA',
    county: '',
    zip: '',
    radius: '',
    specialty: '',
    minScore: '',
    maxScore: '',
    minVolume: '',
    requireMedicare: false,
    behavioralHealth: false,
    geriatricHeavy: false,
  });

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [currentListId, setCurrentListId] = useState(null);

  const queryClient = useQueryClient();

  // Fetch all data
  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['llbProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: scores = [], isLoading: loadingScores } = useQuery({
    queryKey: ['llbScores'],
    queryFn: () => base44.entities.LeadScore.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: ['llbLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: taxonomies = [], isLoading: loadingTaxonomies } = useQuery({
    queryKey: ['llbTaxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: utilizations = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['llbUtilizations'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: listMembers = [] } = useQuery({
    queryKey: ['listMembers', currentListId],
    queryFn: () => currentListId ? base44.entities.LeadListMember.filter({ lead_list_id: currentListId }) : [],
    enabled: !!currentListId,
  });

  const createListMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadList.create(data),
    onSuccess: (newList) => {
      setCurrentListId(newList.id);
      queryClient.invalidateQueries(['leadLists']);
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeadListMember.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['listMembers']);
    },
  });

  const createMemberMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadListMember.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['listMembers']);
    },
  });

  const isLoading = loadingProviders || loadingScores || loadingLocations || loadingTaxonomies || loadingUtil;

  // Filter logic
  const filteredResults = React.useMemo(() => {
    return providers
      .map(provider => {
        const providerLocations = locations.filter(l => l.npi === provider.npi);
        const primaryLocation = providerLocations.find(l => l.is_primary) || providerLocations[0];
        const providerTaxonomies = taxonomies.filter(t => t.npi === provider.npi);
        const primaryTaxonomy = providerTaxonomies.find(t => t.primary_flag) || providerTaxonomies[0];
        const score = scores.find(s => s.npi === provider.npi);
        const utilization = utilizations.find(u => u.npi === provider.npi);
        const listMember = listMembers.find(m => m.npi === provider.npi);

        return {
          provider,
          location: primaryLocation,
          taxonomy: providerTaxonomies,
          score,
          utilization,
          listMember,
        };
      })
      .filter(result => {
        const { provider, location, taxonomy, score, utilization } = result;

        // State filter
        if (filters.state !== 'all' && location?.state !== filters.state) return false;

        // County filter
        if (filters.county && !location?.city?.toLowerCase().includes(filters.county.toLowerCase())) return false;

        // ZIP filter (exact match)
        if (filters.zip && location?.zip !== filters.zip) return false;

        // Specialty filter
        if (filters.specialty) {
          const taxonomyDesc = (taxonomy?.[0]?.taxonomy_description || '').toLowerCase();
          if (!taxonomyDesc.includes(filters.specialty.toLowerCase())) return false;
        }

        // Score range
        if (filters.minScore && (!score || score.score < parseFloat(filters.minScore))) return false;
        if (filters.maxScore && (!score || score.score > parseFloat(filters.maxScore))) return false;

        // Medicare participation
        if (filters.requireMedicare && !utilization) return false;

        // Patient volume
        if (filters.minVolume && (!utilization || utilization.total_medicare_beneficiaries < parseFloat(filters.minVolume))) return false;

        // Behavioral health filter
        if (filters.behavioralHealth) {
          const taxonomyDesc = (taxonomy?.[0]?.taxonomy_description || '').toLowerCase();
          const behavioralTerms = ['psychiatry', 'psychology', 'behavioral', 'mental health'];
          if (!behavioralTerms.some(t => taxonomyDesc.includes(t))) return false;
        }

        // Geriatric-heavy filter
        if (filters.geriatricHeavy) {
          const volume = utilization?.total_medicare_beneficiaries || 0;
          const intensity = volume > 0 ? (utilization?.total_services || 0) / volume : 0;
          if (volume < 200 || intensity < 8) return false;
        }

        return true;
      })
      .sort((a, b) => (b.score?.score || 0) - (a.score?.score || 0));
  }, [providers, locations, taxonomies, scores, utilizations, listMembers, filters]);

  const handleSaveList = async () => {
    if (!listName.trim()) {
      alert('Please enter a list name');
      return;
    }

    const listData = {
      name: listName,
      description: listDescription,
      filters: filters,
      provider_count: filteredResults.length,
    };

    const newList = await createListMutation.mutateAsync(listData);

    // Create list members in bulk
    const memberBatch = filteredResults.slice(0, 1000).map(result => ({
      lead_list_id: newList.id,
      npi: result.provider.npi,
      status: 'New',
    }));
    for (let i = 0; i < memberBatch.length; i += 25) {
      await base44.entities.LeadListMember.bulkCreate(memberBatch.slice(i, i + 25));
    }

    alert(`List "${listName}" saved with ${filteredResults.length} providers`);
    setSaveDialogOpen(false);
    setListName('');
    setListDescription('');
  };

  const handleExportCSV = async () => {
    // Log export to audit trail
    const user = await base44.auth.me();
    await base44.entities.AuditEvent.create({
      event_type: 'export',
      user_email: user.email,
      details: {
        action: 'csv_export',
        entity: 'lead_list',
        row_count: filteredResults.length,
        file_name: `lead-list-${new Date().toISOString().split('T')[0]}.csv`,
        filters: filters,
      },
    });

    const headers = ['NPI', 'Name', 'Specialty', 'City', 'State', 'ZIP', 'Phone', 'Score', 'Patient Fingerprint'];
    const rows = filteredResults.map(result => {
      const { provider, location, taxonomy, score, utilization } = result;
      const name = provider.entity_type === 'Organization' 
        ? provider.organization_name 
        : `${provider.first_name} ${provider.last_name}`;
      
      const volume = utilization?.total_medicare_beneficiaries || 0;
      const intensity = volume > 0 ? (utilization?.total_services || 0) / volume : 0;
      const fingerprint = volume >= 300 ? 'High Volume' : intensity >= 10 ? 'Complex Care' : 'Standard';

      return [
        provider.npi,
        name,
        taxonomy?.[0]?.taxonomy_description || '',
        location?.city || '',
        location?.state || '',
        location?.zip || '',
        location?.phone || '',
        score?.score || 0,
        fingerprint,
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStatusChange = async (npi, newStatus) => {
    if (!currentListId) {
      alert('Please save this list first to track status');
      return;
    }

    const member = listMembers.find(m => m.npi === npi);
    if (member) {
      await updateMemberMutation.mutateAsync({
        id: member.id,
        data: { ...member, status: newStatus },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <div className="lg:col-span-2">
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <PageHeader
          title="Lead List Builder"
          subtitle="Build targeted provider lists with advanced filters"
          icon={Users}
          breadcrumbs={[{ label: 'Sales & Outreach' }, { label: 'Lead Lists', page: 'LeadLists' }, { label: 'Builder' }]}
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div />
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-teal-600 hover:bg-teal-700">
                <Save className="w-4 h-4 mr-2" />
                Save List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Lead List</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>List Name</Label>
                  <Input
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    placeholder="e.g., PA Family Medicine High-Volume"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={listDescription}
                    onChange={(e) => setListDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="text-sm text-gray-600">
                  This will save {filteredResults.length} providers
                </div>
                <Button onClick={handleSaveList} className="w-full">
                  Save List
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        </div>
        <ComplianceDisclaimer />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <LeadListFilters
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters({
              state: 'PA',
              county: '',
              zip: '',
              radius: '',
              specialty: '',
              minScore: '',
              maxScore: '',
              minVolume: '',
              requireMedicare: false,
              behavioralHealth: false,
              geriatricHeavy: false,
            })}
          />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Results
                </div>
                <span className="text-base font-normal text-gray-600">
                  {filteredResults.length} providers
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LeadResultsTable
                results={filteredResults}
                onStatusChange={handleStatusChange}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}