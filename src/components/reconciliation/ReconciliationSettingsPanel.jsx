import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Save, Loader2, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ReconciliationSettingsPanel() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    config_key: 'default',
    nppes_endpoint: 'https://npiregistry.cms.hhs.gov/api/?version=2.1',
    pecos_endpoint: '',
    pecos_api_key: '',
    cms_endpoint: '',
    cms_api_key: '',
    enable_ai_fallback: true
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['reconciliationSettings'],
    queryFn: async () => {
      const res = await base44.entities.ReconciliationSettings.filter({ config_key: 'default' });
      return res[0] || null;
    }
  });

  const { data: recentLogs } = useQuery({
    queryKey: ['apiInteractionLogs'],
    queryFn: () => base44.entities.ApiInteractionLog.list('-created_date', 10),
    refetchInterval: 10000
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        config_key: 'default',
        nppes_endpoint: settings.nppes_endpoint || 'https://npiregistry.cms.hhs.gov/api/?version=2.1',
        pecos_endpoint: settings.pecos_endpoint || '',
        pecos_api_key: settings.pecos_api_key || '',
        cms_endpoint: settings.cms_endpoint || '',
        cms_api_key: settings.cms_api_key || '',
        enable_ai_fallback: settings.enable_ai_fallback ?? true
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settings?.id) {
        return await base44.entities.ReconciliationSettings.update(settings.id, data);
      } else {
        return await base44.entities.ReconciliationSettings.create(data);
      }
    },
    onSuccess: () => {
      toast.success('API Settings saved successfully');
      queryClient.invalidateQueries({ queryKey: ['reconciliationSettings'] });
    },
    onError: (err) => {
      toast.error('Failed to save settings: ' + err.message);
    }
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>External API Configuration</CardTitle>
          <CardDescription>Configure endpoints and credentials for data reconciliation sources.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-medium text-slate-200 border-b border-slate-700 pb-2">NPPES Registry</h3>
              <div className="space-y-2">
                <Label>API Endpoint URL</Label>
                <Input 
                  name="nppes_endpoint" 
                  value={formData.nppes_endpoint} 
                  onChange={handleChange} 
                  placeholder="https://npiregistry.cms.hhs.gov/api/?version=2.1"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-slate-200 border-b border-slate-700 pb-2">PECOS System</h3>
              <div className="space-y-2">
                <Label>API Endpoint URL</Label>
                <Input 
                  name="pecos_endpoint" 
                  value={formData.pecos_endpoint} 
                  onChange={handleChange} 
                  placeholder="https://pecos.cms.hhs.gov/api/v1/provider"
                />
              </div>
              <div className="space-y-2">
                <Label>API Key / Bearer Token</Label>
                <Input 
                  type="password"
                  name="pecos_api_key" 
                  value={formData.pecos_api_key} 
                  onChange={handleChange} 
                  placeholder="Leave empty if not required"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-slate-200 border-b border-slate-700 pb-2">CMS API</h3>
              <div className="space-y-2">
                <Label>API Endpoint URL</Label>
                <Input 
                  name="cms_endpoint" 
                  value={formData.cms_endpoint} 
                  onChange={handleChange} 
                  placeholder="https://data.cms.gov/api/..."
                />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input 
                  type="password"
                  name="cms_api_key" 
                  value={formData.cms_api_key} 
                  onChange={handleChange} 
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-slate-200 border-b border-slate-700 pb-2">AI Settings</h3>
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div>
                  <p className="font-medium text-slate-200">AI Web Search Fallback</p>
                  <p className="text-xs text-slate-400">Use AI to search the internet if API fails or is not configured.</p>
                </div>
                <Switch 
                  checked={formData.enable_ai_fallback} 
                  onCheckedChange={(c) => setFormData(p => ({ ...p, enable_ai_fallback: c }))} 
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Recent API Interactions
          </CardTitle>
          <CardDescription>Live log of data fetching attempts during reconciliation.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs?.length > 0 ? (
            <div className="space-y-3">
              {recentLogs.map(log => (
                <div key={log.id} className="p-3 bg-slate-800/30 border border-slate-700/50 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="uppercase text-xs font-mono">{log.source}</Badge>
                      <span className="text-sm font-medium text-slate-200">NPI: {log.npi}</span>
                      <span className="text-xs text-slate-400">• {new Date(log.created_date).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-slate-400 truncate max-w-md" title={log.endpoint}>{log.endpoint}</p>
                    {log.error_message && <p className="text-xs text-red-400 mt-1">{log.error_message}</p>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-400">{log.response_time_ms}ms</span>
                    {log.is_success ? (
                      <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/20">HTTP {log.status_code}</Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/20">HTTP {log.status_code || 'ERROR'}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">No recent API interactions logged.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}