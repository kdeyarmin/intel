import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const ICON_MAP = {
  opportunity: TrendingUp,
  risk: AlertTriangle,
  insight: Lightbulb,
};
const COLOR_MAP = {
  opportunity: 'text-green-600 bg-green-50',
  risk: 'text-red-600 bg-red-50',
  insight: 'text-blue-600 bg-blue-50',
};

export default function LocationInsightsPanel({ summaryData }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare market analyst. Analyze these aggregated provider-location metrics and provide actionable insights.

DATA SUMMARY:
${JSON.stringify(summaryData, null, 2)}

Provide 4-6 insights. Each insight should have a type (opportunity, risk, or insight), a short title, and a description paragraph. Focus on:
- States/cities with high provider density but low referral volume (growth opportunity)
- Locations with declining provider counts (risk)
- Geographic areas with high referral potential
- Underserved areas that could benefit from expansion`,
      response_json_schema: {
        type: "object",
        properties: {
          insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["opportunity", "risk", "insight"] },
                title: { type: "string" },
                description: { type: "string" },
              }
            }
          }
        }
      }
    });
    setInsights(result.insights || []);
    setLoading(false);
  };

  return (
    <Card className="bg-gray-100">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          AI Location Insights
        </CardTitle>
        <Button
          size="sm"
          onClick={generateInsights}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {loading ? 'Analyzing...' : insights ? 'Refresh' : 'Generate'}
        </Button>
      </CardHeader>
      <CardContent>
        {!insights && !loading && (
          <p className="text-sm text-gray-400 text-center py-8">
            Click "Generate" to get AI-driven growth opportunities and risk analysis
          </p>
        )}
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-purple-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Analyzing location data...</span>
          </div>
        )}
        {insights && (
          <div className="space-y-3">
            {insights.map((item, i) => {
              const Icon = ICON_MAP[item.type] || Lightbulb;
              const colors = COLOR_MAP[item.type] || COLOR_MAP.insight;
              return (
                <div key={i} className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`p-1 rounded ${colors}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                    <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
                  </div>
                  <div className="text-sm text-gray-600 leading-relaxed prose prose-sm max-w-none">
                    <ReactMarkdown>{item.description}</ReactMarkdown>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}