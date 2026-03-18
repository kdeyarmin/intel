import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings, Save, RotateCcw, Zap, Server, Users, Building2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../components/shared/PageHeader';

const ALL_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

const DEFAULTS = {
  config_key: 'default',
  api_batch_size: 200,
  import_chunk_size: 50,
  max_retries: 3,
  api_delay_ms: 80,
  retry_backoff_ms: 2000,
  request_timeout_ms: 15000,
  crawl_entity_types: ['NPI-1', 'NPI-2'],
  max_crawl_duration_sec: 160,
  auto_retry_enabled: false,
  retry_delay_minutes: 60,
  retry_escalation_threshold: 3,
  escalation_tags: ['manual_review_required'],
  max_pages_per_query: 6,
  max_skip: 1000,
  concurrency: 4,
  crawl_all_states: true,
  selected_states: [],
};

const createDefaultForm = () => ({
  ...DEFAULTS,
  crawl_entity_types: [...DEFAULTS.crawl_entity_types],
  escalation_tags: [...DEFAULTS.escalation_tags],
  selected_states: [...DEFAULTS.selected_states],
});

export default function NPPESCrawlerSettings() {
  const [form, setForm] = useState(createDefaultForm);
  const [hasChanges, setHasChanges] = useState(false);
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['crawlerConfig'],
    queryFn: () => base44.entities.NPPESCrawlerConfig.filter({ config_key: 'default' }),
  });

  const existingConfig = configs[0];

  useEffect(() => {
    if (existingConfig) {
      setForm({
        ...createDefaultForm(),
        config_key: 'default',
        api_batch_size: existingConfig.api_batch_size ?? DEFAULTS.api_batch_size,
        import_chunk_size: existingConfig.import_chunk_size ?? DEFAULTS.import_chunk_size,
        max_retries: existingConfig.max_retries ?? DEFAULTS.max_retries,
        api_delay_ms: existingConfig.api_delay_ms ?? DEFAULTS.api_delay_ms,
        retry_backoff_ms: existingConfig.retry_backoff_ms ?? DEFAULTS.retry_backoff_ms,
        request_timeout_ms: existingConfig.request_timeout_ms ?? DEFAULTS.request_timeout_ms,
        crawl_entity_types: existingConfig.crawl_entity_types ?? DEFAULTS.crawl_entity_types,
        max_crawl_duration_sec: existingConfig.max_crawl_duration_sec ?? DEFAULTS.max_crawl_duration_sec,
        auto_retry_enabled: existingConfig.auto_retry_enabled ?? DEFAULTS.auto_retry_enabled,
        retry_delay_minutes: existingConfig.retry_delay_minutes ?? DEFAULTS.retry_delay_minutes,
        retry_escalation_threshold: existingConfig.retry_escalation_threshold ?? DEFAULTS.retry_escalation_threshold,
        escalation_tags: existingConfig.escalation_tags ?? DEFAULTS.escalation_tags,
        max_pages_per_query: existingConfig.max_pages_per_query ?? DEFAULTS.max_pages_per_query,
        max_skip: existingConfig.max_skip ?? DEFAULTS.max_skip,
        concurrency: existingConfig.concurrency ?? DEFAULTS.concurrency,
        crawl_all_states: existingConfig.crawl_all_states ?? DEFAULTS.crawl_all_states,
        selected_states: existingConfig.selected_states ?? DEFAULTS.selected_states,
      });
    }
  }, [existingConfig]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existingConfig) {
        await base44.entities.NPPESCrawlerConfig.update(existingConfig.id, data);
      } else {
        await base44.entities.NPPESCrawlerConfig.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crawlerConfig'] });
      setHasChanges(false);
      toast.success('Crawler settings saved');
    },
  });

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const toggleEntityType = (type) => {
    setForm(prev => {
      const current = prev.crawl_entity_types || [];
      const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
      setHasChanges(true);
      return { ...prev, crawl_entity_types: next };
    });
  };

  const resetDefaults = () => {
    setForm(createDefaultForm());
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Crawler Settings"
          subtitle="Configure NPPES crawler parameters"
          icon={Settings}
          breadcrumbs={[{ label: 'Admin' }, { label: 'NPPES Crawler', page: 'NPPESCrawler' }, { label: 'Settings' }]}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDefaults} className="gap-1.5">
            <RotateCcw className="w-4 h-4" />
            Reset Defaults
          </Button>
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={!hasChanges || saveMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700 gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {/* API Request Settings */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Zap className="w-4 h-4 text-amber-500" />
            API Request Settings
          </CardTitle>
          <CardDescription className="text-slate-400">Control how the crawler communicates with the NPPES API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingField
              label="API Batch Size"
              description="Results per API request (max 200)"
              value={form.api_batch_size}
              onChange={(v) => updateField('api_batch_size', clampInt(v, 10, 200))}
              min={10} max={200}
            />
            <SettingField
              label="API Delay (ms)"
              description="Pause between API calls to avoid rate limiting"
              value={form.api_delay_ms}
              onChange={(v) => updateField('api_delay_ms', clampInt(v, 0, 5000))}
              min={0} max={5000}
            />
            <SettingField
              label="Max Retries"
              description="Retry count for failed API requests"
              value={form.max_retries}
              onChange={(v) => updateField('max_retries', clampInt(v, 1, 10))}
              min={1} max={10}
            />
            <SettingField
              label="Retry Backoff (ms)"
              description="Base delay between retries (multiplied by attempt #)"
              value={form.retry_backoff_ms}
              onChange={(v) => updateField('retry_backoff_ms', clampInt(v, 500, 30000))}
              min={500} max={30000}
            />
            <SettingField
              label="Request Timeout (ms)"
              description="Timeout per individual API call"
              value={form.request_timeout_ms}
              onChange={(v) => updateField('request_timeout_ms', clampInt(v, 5000, 60000))}
              min={5000} max={60000}
            />
          </div>
        </CardContent>
      </Card>

      {/* Import Settings */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Server className="w-4 h-4 text-blue-500" />
            Import Settings
          </CardTitle>
          <CardDescription className="text-slate-400">Control how data is written to the database</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingField
              label="Import Chunk Size"
              description="Records per bulk database insert"
              value={form.import_chunk_size}
              onChange={(v) => updateField('import_chunk_size', clampInt(v, 10, 200))}
              min={10} max={200}
            />
            <SettingField
              label="Max Crawl Duration (sec)"
              description="Time limit before saving partial results"
              value={form.max_crawl_duration_sec}
              onChange={(v) => updateField('max_crawl_duration_sec', clampInt(v, 30, 300))}
              min={30} max={300}
            />
            <SettingField
              label="Max Pages Per Query"
              description="Max API pages to fetch per zip prefix before splitting (200 records/page)"
              value={form.max_pages_per_query}
              onChange={(v) => updateField('max_pages_per_query', clampInt(v, 1, 50))}
              min={1} max={50}
            />
            <SettingField
              label="Max Skip Records"
              description="Maximum records to skip (offset) for a single NPI API query"
              value={form.max_skip}
              onChange={(v) => updateField('max_skip', clampInt(v, 200, 5000))}
              min={200} max={5000}
            />
            <SettingField
              label="Concurrency"
              description="Number of parallel workers processing zip prefixes"
              value={form.concurrency}
              onChange={(v) => updateField('concurrency', clampInt(v, 1, 10))}
              min={1} max={10}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto-Retry Settings */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <RotateCcw className="w-4 h-4 text-orange-500" />
            Auto-Retry Settings
          </CardTitle>
          <CardDescription className="text-slate-400">Configure automatic retries for failed states</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
           <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-800/40 border-slate-700/50">
              <div className="space-y-0.5">
                <Label className="text-base text-slate-200">Enable Auto-Retry</Label>
                <p className="text-xs text-slate-500">Automatically re-queue failed states after delay</p>
              </div>
              <Switch 
                checked={form.auto_retry_enabled} 
                onCheckedChange={(v) => updateField('auto_retry_enabled', v)} 
              />
            </div>
            
            {form.auto_retry_enabled && (
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SettingField
                  label="Retry Delay (minutes)"
                  description="Wait time before retrying a failed state"
                  value={form.retry_delay_minutes}
                  onChange={(v) => updateField('retry_delay_minutes', clampInt(v, 5, 1440))}
                  min={5} max={1440}
                />
                <SettingField
                  label="Escalation Threshold"
                  description="Failed auto-retries before manual review escalation"
                  value={form.retry_escalation_threshold}
                  onChange={(v) => updateField('retry_escalation_threshold', clampInt(v, 1, 10))}
                  min={1} max={10}
                />
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-200">Escalation Tags</Label>
                  <Input
                    type="text"
                    value={form.escalation_tags?.join(', ') || ''}
                    onChange={(e) => updateField('escalation_tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    className="max-w-48"
                  />
                  <p className="text-xs text-slate-500">Comma-separated tags to add on escalation</p>
                </div>
               </div>
            )}
        </CardContent>
      </Card>

      {/* State Targeting */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <MapPin className="w-4 h-4 text-emerald-500" />
            Selective State Crawling
          </CardTitle>
          <CardDescription className="text-slate-400">Target specific states or crawl all states nationwide.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-800/40 border-slate-700/50">
            <div className="space-y-0.5">
              <Label className="text-base text-slate-200">Crawl All States</Label>
              <p className="text-xs text-slate-500">Disable to manually select specific states to crawl</p>
            </div>
            <Switch
              checked={form.crawl_all_states !== false}
              onCheckedChange={(v) => {
                updateField('crawl_all_states', v);
                if (v) updateField('selected_states', []);
              }}
            />
          </div>

          {form.crawl_all_states === false && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-200">Selected States</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_STATES.map(state => {
                  const isSelected = form.selected_states?.includes(state);
                  return (
                    <Badge
                      key={state}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer ${isSelected ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' : 'text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'}`}
                      onClick={() => {
                        const newStates = isSelected
                          ? form.selected_states.filter(s => s !== state)
                          : [...(form.selected_states || []), state];
                        updateField('selected_states', newStates);
                      }}
                    >
                      {state}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entity Type Filter */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Users className="w-4 h-4 text-violet-500" />
            Entity Types to Crawl
          </CardTitle>
          <CardDescription className="text-slate-400">Choose which provider types the crawler should fetch</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <EntityTypeToggle
              type="NPI-1"
              label="Individual Providers"
              description="Physicians, nurses, therapists, and other individual practitioners"
              icon={<Users className="w-5 h-5 text-blue-500" />}
              enabled={form.crawl_entity_types?.includes('NPI-1')}
              onToggle={() => toggleEntityType('NPI-1')}
            />
            <EntityTypeToggle
              type="NPI-2"
              label="Organizations"
              description="Hospitals, clinics, home health agencies, and other organizations"
              icon={<Building2 className="w-5 h-5 text-emerald-500" />}
              enabled={form.crawl_entity_types?.includes('NPI-2')}
              onToggle={() => toggleEntityType('NPI-2')}
            />
            {form.crawl_entity_types?.length === 0 && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                At least one entity type must be selected for the crawler to function.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Config Summary */}
      {existingConfig && (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Last updated: {new Date(existingConfig.updated_date).toLocaleString()}</span>
              <Badge variant="outline">Config ID: {existingConfig.id}</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SettingField({ label, description, value, onChange, min, max }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-200">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || min)}
        min={min}
        max={max}
        className="max-w-48"
      />
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  );
}

function EntityTypeToggle({ type, label, description, icon, enabled, onToggle }) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${enabled ? 'bg-slate-800/40 border-slate-600' : 'bg-slate-800/20 border-dashed border-slate-700'}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-200">{label}</p>
            <Badge variant="outline" className="text-[10px]">{type}</Badge>
          </div>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

function clampInt(val, min, max) {
  const n = parseInt(val) || min;
  return Math.max(min, Math.min(max, n));
}
