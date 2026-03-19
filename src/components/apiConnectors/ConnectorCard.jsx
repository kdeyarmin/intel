import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2, Settings2, ShieldCheck, ShieldAlert, Key, Activity, Clock, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function ConnectorCard({ connector, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: connector.name || '',
    api_url: connector.api_url || '',
    api_key: connector.api_key || '',
    rate_limit_requests: connector.rate_limit_requests || 100,
    rate_limit_period: connector.rate_limit_period || 60,
    is_authorized: connector.is_authorized || false
  });

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await base44.functions.invoke('testCMSApiConnector', { connector_id: connector.id });
      if (response.data?.success) {
        onUpdate(response.data.connector);
        toast.success(response.data.connector.test_message || 'Connection test successful');
      } else {
        toast.error(response.data?.error || 'Test failed');
      }
    } catch (error) {
      toast.error('Test error: ' + error.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await base44.entities.CMSApiConnector.update(connector.id, formData);
      onUpdate(updated);
      setIsEditing(false);
      toast.success('Connector settings saved');
    } catch (error) {
      toast.error('Failed to save settings: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAuth = async (checked) => {
    const updatedData = { ...formData, is_authorized: checked };
    setFormData(updatedData);
    
    try {
      const updated = await base44.entities.CMSApiConnector.update(connector.id, { is_authorized: checked });
      onUpdate(updated);
      toast.success(checked ? 'Connection authorized' : 'Connection deauthorized');
    } catch (_error) {
      setFormData({ ...formData, is_authorized: !checked });
      toast.error('Failed to update status');
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg flex items-center gap-2">
            {connector.name}
            {connector.is_authorized ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800"><ShieldCheck className="w-3 h-3 mr-1" /> Authorized</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground"><ShieldAlert className="w-3 h-3 mr-1" /> Inactive</Badge>
            )}
          </CardTitle>
          <CardDescription className="font-mono text-xs text-muted-foreground break-all">
            {connector.api_url}
          </CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <Switch 
            checked={formData.is_authorized} 
            onCheckedChange={handleToggleAuth} 
            aria-label="Toggle authorization"
          />
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 pt-4">
        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input value={formData.api_url} onChange={e => setFormData({...formData, api_url: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>API Key (Optional)</Label>
              <Input type="password" value={formData.api_key} onChange={e => setFormData({...formData, api_key: e.target.value})} placeholder="••••••••••••" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rate Limit (Reqs)</Label>
                <Input type="number" value={formData.rate_limit_requests} onChange={e => setFormData({...formData, rate_limit_requests: parseInt(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>Per Period (Seconds)</Label>
                <Input type="number" value={formData.rate_limit_period} onChange={e => setFormData({...formData, rate_limit_period: parseInt(e.target.value)})} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1"><Activity className="w-4 h-4" /> Rate Limit</p>
              <p className="font-medium">{connector.rate_limit_requests} reqs / {connector.rate_limit_period}s</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1"><Key className="w-4 h-4" /> API Key</p>
              <p className="font-medium">{connector.api_key ? '••••••••' : 'None'}</p>
            </div>
            <div className="space-y-1 col-span-2 bg-slate-50 p-3 rounded-md dark:bg-slate-900">
              <p className="text-muted-foreground flex items-center gap-1 mb-1"><Clock className="w-4 h-4" /> Last Tested</p>
              <div className="flex items-center justify-between">
                <span>
                  {connector.last_tested_at ? formatDistanceToNow(new Date(connector.last_tested_at), { addSuffix: true }) : 'Never tested'}
                </span>
                {connector.test_status === 'success' && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Success</Badge>}
                {connector.test_status === 'failed' && <Badge variant="destructive">Failed</Badge>}
              </div>
              {connector.test_message && <p className="text-xs mt-1 text-slate-500 break-words">{connector.test_message}</p>}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between border-t bg-slate-50/50 pt-4 pb-4">
        {isEditing ? (
          <>
            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Settings2 className="w-4 h-4 mr-2" /> Configure
              </Button>
              <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting || !connector.is_authorized}>
                {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                Test API
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(connector.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}