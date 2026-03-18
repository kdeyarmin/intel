import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Plus, Server } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import ConnectorCard from '@/components/apiConnectors/ConnectorCard';

export default function APIConnectors() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const { data: connectors, isLoading } = useQuery({
    queryKey: ['cms_api_connectors'],
    queryFn: () => base44.entities.CMSApiConnector.list('-created_date', 100),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (newConnector) => base44.entities.CMSApiConnector.create(newConnector),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms_api_connectors'] });
      setIsCreating(false);
      toast.success('New API connector added');
    },
    onError: (error) => {
      toast.error('Failed to add connector: ' + error.message);
      setIsCreating(false);
    }
  });

  const handleUpdate = (updatedConnector) => {
    queryClient.setQueryData(['cms_api_connectors'], (old) => 
      old.map(c => c.id === updatedConnector.id ? updatedConnector : c)
    );
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this connector? Data imports relying on it may fail.')) {
      try {
        await base44.entities.CMSApiConnector.delete(id);
        queryClient.invalidateQueries({ queryKey: ['cms_api_connectors'] });
        toast.success('Connector deleted');
      } catch (error) {
        toast.error('Failed to delete: ' + error.message);
      }
    }
  };

  const handleAddNew = () => {
    setIsCreating(true);
    createMutation.mutate({
      name: 'New Custom API',
      source_type: 'custom',
      api_url: 'https://api.example.com/v1',
      is_authorized: false,
      rate_limit_requests: 100,
      rate_limit_period: 60,
      test_status: 'untested'
    });
  };

  return (
    <div className="max-w-[120rem] mx-auto p-6 space-y-8">
      <PageHeader 
        title="API Connectors" 
        subtitle="Manage connections, API keys, and rate limits for CMS and external data sources."
        icon={Server}
        breadcrumbs={[
          { label: "Data Center", path: "/data-center" },
          { label: "API Connectors" }
        ]}
      >
        <Button onClick={handleAddNew} disabled={isCreating}>
          <Plus className="w-4 h-4 mr-2" />
          Add Custom Connector
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {connectors.map(connector => (
            <ConnectorCard 
              key={connector.id} 
              connector={connector} 
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {!isLoading && connectors.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-300">
          <Server className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No API Connectors</h3>
          <p className="text-slate-500 mb-4">You haven't configured any API connections yet.</p>
          <Button onClick={handleAddNew}>Add Your First Connector</Button>
        </div>
      )}
    </div>
  );
}