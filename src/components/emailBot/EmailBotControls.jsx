import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bot, Play, Loader2, Users } from 'lucide-react';

export default function EmailBotControls({
  batchSize, setBatchSize,
  skipSearched, setSkipSearched,
  onRunBatch, onRunSingle,
  singleNpi, setSingleNpi,
  isRunning,
  stats,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Batch Mode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Batch Email Search
          </CardTitle>
          <CardDescription>Search emails for multiple providers at once</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Batch Size (max providers per run)</Label>
            <Input
              type="number" min="1" max="50" value={batchSize}
              onChange={e => setBatchSize(parseInt(e.target.value) || 10)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Skip already searched</Label>
            <Switch checked={skipSearched} onCheckedChange={setSkipSearched} />
          </div>
          {stats && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px]">{stats.total} total</Badge>
              <Badge className="bg-green-100 text-green-700 text-[10px]">{stats.withEmail} have email</Badge>
              <Badge className="bg-slate-100 text-slate-600 text-[10px]">{stats.searched} searched</Badge>
              <Badge className="bg-blue-100 text-blue-700 text-[10px]">{stats.remaining} remaining</Badge>
            </div>
          )}
          <Button
            onClick={onRunBatch}
            disabled={isRunning}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isRunning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Run Batch Search</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Single NPI */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4 text-teal-600" />
            Single Provider Search
          </CardTitle>
          <CardDescription>Search email for a specific NPI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Provider NPI</Label>
            <Input
              placeholder="e.g., 1234567890"
              value={singleNpi}
              onChange={e => setSingleNpi(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Button
            onClick={onRunSingle}
            disabled={isRunning || !singleNpi.trim()}
            variant="outline"
            className="w-full"
          >
            {isRunning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
            ) : (
              <><Bot className="w-4 h-4 mr-2" /> Search This Provider</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}