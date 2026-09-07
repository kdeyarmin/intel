import { ExternalLink, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CENTRAL_SUPPORT_EMAIL,
  CENTRAL_SUPPORT_PHONE,
  CENTRAL_SUPPORT_PHONE_DISPLAY,
} from '@/lib/centralSupport';

export default function CentralSupportCard({ hubUrl }) {
  return (
    <Card className="bg-cyan-950/30 border-cyan-500/30" data-testid="central-support-card">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">CareMetric centralized support</p>
            <h2 className="text-xl font-semibold text-slate-100">Help, courses, tutorials, and software support</h2>
            <p className="text-sm text-slate-400">
              Open the shared CareMetric Help Center or use the central support contacts below. Do not include patient information or other protected health information.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm">
              <a href={`tel:${CENTRAL_SUPPORT_PHONE}`} className="inline-flex items-center gap-2 text-slate-300 hover:text-cyan-300">
                <Phone className="w-4 h-4" aria-hidden="true" />
                {CENTRAL_SUPPORT_PHONE_DISPLAY}
              </a>
              <a href={`mailto:${CENTRAL_SUPPORT_EMAIL}`} className="inline-flex items-center gap-2 text-slate-300 hover:text-cyan-300">
                <Mail className="w-4 h-4" aria-hidden="true" />
                {CENTRAL_SUPPORT_EMAIL}
              </a>
            </div>
          </div>
          {hubUrl && (
            <Button asChild className="bg-cyan-600 hover:bg-cyan-700 gap-2 min-h-11 shrink-0">
              <a href={hubUrl} target="_blank" rel="noopener noreferrer">
                Open CareMetric Help Center
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
