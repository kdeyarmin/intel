import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function EnrichmentButton({ provider, onEnrichmentComplete }) {
  const [loading, setLoading] = useState(false);

  const needsEnrichment = !provider.website || 
                          !provider.credential || 
                          provider.ai_enrichment_status === 'pending';

  if (!needsEnrichment) {
    return null;
  }

  const handleEnrich = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('enrichProviderWithAI', {
        provider_id: provider.id
      });

      if (response.data.success) {
        toast.success(`Enriched ${response.data.enriched_fields.length} fields`);
        onEnrichmentComplete?.(response.data);
      }
    } catch (error) {
      toast.error('Enrichment failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleEnrich}
      disabled={loading}
      className="h-8 gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      {loading ? 'Enriching...' : 'AI Enrich Profile'}
    </Button>
  );
}