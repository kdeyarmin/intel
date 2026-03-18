import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  HelpCircle, Download, Search, LayoutDashboard, Users, Upload, Bot,
  Megaphone, Zap, TrendingUp, Sparkles
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import HelpSection from '../components/help/HelpSection';

const GUIDE_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Zap,
    color: 'text-amber-400',
    content: [
      { heading: 'Welcome to CareMetric AI', text: 'CareMetric AI is a Medicare provider intelligence platform designed for home health, hospice, and post-acute care organizations. It helps you identify, score, and engage referral sources using public CMS data and AI-powered enrichment.' },
      { heading: 'First Steps', text: '1. **Dashboard** — Start here to see your system health, database counts, and recent activity.\n2. **Import Data** — Go to Admin → Data Center to import NPPES, CMS Utilization, Referral, and other Medicare datasets.\n3. **Browse Providers** — View imported providers under Providers → All Providers.\n4. **Build Lead Lists** — Use Sales & Outreach → Lead Builder to create targeted lists based on specialty, geography, and score.\n5. **Run Outreach** — Create campaigns in Sales & Outreach → Campaigns to engage your top leads.' },
      { heading: 'User Roles', text: '**Admin** — Full access to all features including data imports, crawler, enrichment, scoring rules, and system configuration.\n\n**Sales Rep** — Access to providers, lead lists, campaigns, analytics, and reports. Cannot access admin-only features like data imports or the NPPES crawler.' },
    ]
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    color: 'text-cyan-400',
    content: [
      { heading: 'Overview', text: 'The Dashboard is your home base. It displays key metrics including total providers, locations, email coverage, recent imports, and system health indicators.' },
      { heading: 'Key Sections', text: '• **System Health Strip** — Shows database record counts and system status at a glance.\n• **Database Overview** — Breakdown of providers, locations, taxonomies, and utilization records.\n• **Email Health** — Coverage percentage of providers with verified email addresses.\n• **Proactive Alerts** — AI-generated notifications about data quality issues or opportunities.\n• **Recent Activity** — Audit log of recent imports, exports, and scoring runs.' },
    ]
  },
  {
    id: 'providers',
    title: 'Providers & Locations',
    icon: Users,
    color: 'text-blue-400',
    content: [
      { heading: 'All Providers', text: 'Browse, search, and filter your provider database. Use the search bar to find providers by NPI, name, or specialty. Click any provider to see their full profile including contact info, utilization data, referral patterns, and lead score.' },
      { heading: 'Provider Detail', text: 'Each provider profile includes:\n• **Basic Profile** — Name, NPI, specialty, credentials, contact info\n• **Score Breakdown** — CareMetric Referral Propensity Score with factor analysis\n• **Utilization Insights** — Medicare claims volume, service intensity\n• **Referral Summary** — Referral patterns and network connections\n• **Locations** — Practice addresses and phone numbers\n• **AI Enrichment** — Website, email, LinkedIn, and other discovered data' },
      { heading: 'Organizations', text: 'View organization-type providers (NPI-2) like hospitals, clinics, and agencies. Filter by state, type, or search by name.' },
      { heading: 'Locations', text: 'Browse all practice locations. Filter by state, location type (Practice/Mailing), or primary status. Export to CSV for external use.' },
      { heading: 'Territory Map', text: 'Interactive geographic visualization of your provider data. Filter by state, specialty, and score to identify market density and gaps.' },
    ]
  },
  {
    id: 'sales-outreach',
    title: 'Sales & Outreach',
    icon: Megaphone,
    color: 'text-purple-400',
    content: [
      { heading: 'Lead Lists', text: 'View and manage saved lead lists. Each list contains providers matching specific criteria with their current status (New, Contacted, Qualified, Not a fit).' },
      { heading: 'Lead Builder', text: 'Create targeted lead lists by combining filters:\n• **Geography** — State, ZIP code, radius\n• **Specialty** — Taxonomy codes and descriptions\n• **Score Range** — Minimum/maximum CareMetric score\n• **Volume** — Minimum Medicare beneficiaries or referrals\n• **Medicare Status** — Active enrollment filter' },
      { heading: 'Email Bot', text: '(Admin only) AI-powered email discovery and verification tool. Searches the web for provider email addresses, validates deliverability, and tracks quality scores. Run single searches or batch operations.' },
      { heading: 'Campaigns', text: 'Create and manage outreach campaigns:\n1. Click "New Campaign" and fill in campaign details\n2. Select your target audience from existing lead lists\n3. Design your email template with personalization tokens\n4. Launch and track open rates, responses, and conversions in the Analytics tab' },
    ]
  },
  {
    id: 'analytics',
    title: 'Analytics & Reports',
    icon: TrendingUp,
    color: 'text-emerald-400',
    content: [
      { heading: 'Advanced Analytics', text: 'Deep-dive analytics with trend analysis, comparative panels, predictive models, and drill-down tables. Use the dashboard builder to create custom visualizations.' },
      { heading: 'CMS Data', text: 'Explore raw CMS datasets including Medicare Advantage Inpatient, HHA Statistics, Inpatient DRG, Utilization, Referrals, Part D, and SNF data. Filter by year and dataset type.' },
      { heading: 'Referral Network', text: 'Visualize referral relationships between providers. Identify hub providers, network gaps, and geographic clustering. Use AI recommendations to find new referral targets.' },
      { heading: 'Custom Reports', text: 'Build custom reports by selecting data sources, metrics, filters, and chart types. Save reports for reuse and schedule automated delivery.' },
    ]
  },
  {
    id: 'data-import',
    title: 'Data Import (Admin)',
    icon: Upload,
    color: 'text-orange-400',
    content: [
      { heading: 'Data Center', text: 'Central hub for all data imports. Choose from supported import types:\n• **NPPES Registry** — National Provider Identifier data\n• **CMS Utilization** — Medicare claims and service data\n• **CMS Referrals** — Provider-to-provider referral patterns\n• **Medicare Part D** — Prescription drug utilization\n• **Medicare HHA Stats** — Home Health Agency statistics\n• **Medicare MA Inpatient** — Medicare Advantage hospital data\n• **Medicare SNF Stats** — Skilled Nursing Facility data\n• And more...' },
      { heading: 'How to Import', text: '1. Go to Admin → Data Center\n2. Select the import category and type\n3. Upload your CSV/Excel file or use the auto-download URL\n4. Review the column mapping (AI-assisted)\n5. Validate the data (dry run recommended first)\n6. Click Import to process the data\n7. Monitor progress in Admin → Import Monitor' },
      { heading: 'Import Monitor', text: 'Track all import batches with real-time progress. View success/failure rates, error samples, and retry failed imports. Filter by status, type, or date range.' },
    ]
  },
  {
    id: 'nppes-crawler',
    title: 'NPPES Crawler (Admin)',
    icon: Bot,
    color: 'text-teal-400',
    content: [
      { heading: 'Overview', text: 'The NPPES Crawler automatically pulls provider data from the National Plan and Provider Enumeration System API, processing one state at a time.' },
      { heading: 'Manual Mode', text: 'Click "Start Crawl" to begin browser-based crawling. You can pause, resume, or stop at any time. The page must remain open.' },
      { heading: 'Auto Mode', text: 'Click "Start Auto-Crawler" for server-side crawling that runs independently — you can close the browser. The system processes all states sequentially and handles retries automatically.' },
      { heading: 'Settings', text: 'Configure crawler parameters in NPPES Crawler → Settings:\n• **API Batch Size** — Records per API request (max 200)\n• **API Delay** — Pause between requests to avoid rate limiting\n• **Concurrency** — Parallel workers for faster processing\n• **Max Crawl Duration** — Time limit per state before saving partial results\n• **Entity Types** — Choose Individual (NPI-1), Organization (NPI-2), or both' },
    ]
  },
  {
    id: 'enrichment',
    title: 'Enrichment & Quality (Admin)',
    icon: Sparkles,
    color: 'text-pink-400',
    content: [
      { heading: 'Enrichment Hub', text: 'Enhance provider records with additional data:\n• **AI Enrichment** — Discovers websites, emails, LinkedIn profiles, and additional practice details\n• **Bulk Operations** — Enrich multiple providers at once\n• **Review Queue** — Review and approve AI-suggested changes before applying' },
      { heading: 'Data Quality', text: 'Monitor and maintain data integrity:\n• **Quality Score** — Overall data completeness and accuracy rating\n• **Alerts** — Automated detection of quality drops, missing data, and inconsistencies\n• **Cleaning Rules** — Define and apply data standardization rules\n• **Scan History** — Track quality metrics over time' },
      { heading: 'Scoring Rules', text: 'Configure the CareMetric Referral Propensity Score (0–100):\n• **Specialty Match** — Weight for target specialties\n• **Medicare Participation** — Active enrollment bonus\n• **Patient Volume** — Beneficiary count factor\n• **Geographic Priority** — Location-based weighting\n• **Practice Type** — Solo/small group preference\n\nAdjust weights and recalculate scores for all providers.' },
    ]
  },
  {
    id: 'ai-assistant',
    title: 'AI Assistant',
    icon: Bot,
    color: 'text-violet-400',
    content: [
      { heading: 'Overview', text: 'The AI Assistant helps you interact with your data using natural language. Ask questions about providers, get market insights, or request data analysis.' },
      { heading: 'Example Queries', text: '• "Show me the top 10 providers in Pennsylvania by score"\n• "How many providers have verified emails?"\n• "What specialties have the highest referral volume?"\n• "Create a lead list of family medicine providers in Philadelphia"\n• "Summarize the data quality for our provider database"' },
    ]
  },
];

export default function Help() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState(new Set(['getting-started']));
  const [generating, setGenerating] = useState(false);

  const toggleSection = (id) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedSections(new Set(GUIDE_SECTIONS.map(s => s.id)));
  const collapseAll = () => setExpandedSections(new Set());

  const filteredSections = GUIDE_SECTIONS.filter(section => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return section.title.toLowerCase().includes(q) ||
      section.content.some(c => c.heading.toLowerCase().includes(q) || c.text.toLowerCase().includes(q));
  });

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      const addPage = () => { doc.addPage(); y = 20; };
      const checkPage = (needed = 20) => { if (y + needed > 275) addPage(); };

      // Title page
      doc.setFillColor(15, 23, 41);
      doc.rect(0, 0, 210, 297, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.text('CareMetric AI', margin, 60);
      doc.setFontSize(16);
      doc.setTextColor(0, 188, 212);
      doc.text('User Guide', margin, 72);
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184);
      doc.text('Medicare Provider Intelligence Platform', margin, 85);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 95);

      // Table of Contents
      addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 210, 297, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(18);
      doc.text('Table of Contents', margin, y);
      y += 12;
      doc.setFontSize(11);
      GUIDE_SECTIONS.forEach((section, idx) => {
        doc.setTextColor(71, 85, 105);
        doc.text(`${idx + 1}. ${section.title}`, margin + 4, y);
        y += 7;
      });

      // Content pages
      GUIDE_SECTIONS.forEach((section, sIdx) => {
        addPage();
        // Section title
        doc.setFillColor(241, 245, 249);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(15, 23, 41);
        doc.setFontSize(18);
        doc.text(`${sIdx + 1}. ${section.title}`, margin, 28);
        y = 50;

        section.content.forEach(item => {
          checkPage(30);
          doc.setTextColor(15, 23, 41);
          doc.setFontSize(12);
          doc.text(item.heading, margin, y);
          y += 7;

          doc.setTextColor(71, 85, 105);
          doc.setFontSize(9.5);
          const cleanText = item.text.replace(/\*\*/g, '').replace(/\n/g, '\n');
          const lines = doc.splitTextToSize(cleanText, contentWidth);
          lines.forEach(line => {
            checkPage(6);
            doc.text(line, margin, y);
            y += 5;
          });
          y += 4;
        });
      });

      // Footer on last page
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.text('CareMetric AI — www.CareMetric.ai', margin, 285);
      doc.text('Data Sources: CMS Medicare & NPPES National Provider files', margin, 290);

      doc.save('CareMetric_AI_User_Guide.pdf');
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Help & User Guide"
        subtitle="Learn how to use CareMetric AI — browse topics or download the full PDF guide"
        icon={HelpCircle}
        breadcrumbs={[{ label: 'Help' }]}
        actions={
          <Button onClick={generatePDF} disabled={generating} className="bg-cyan-600 hover:bg-cyan-700 gap-2">
            <Download className="w-4 h-4" />
            {generating ? 'Generating...' : 'Download PDF Guide'}
          </Button>
        }
      />

      {/* Search & controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search help topics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-[#141d30] border-slate-700/50 text-slate-200 placeholder:text-slate-500"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll} className="text-xs">Expand All</Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs">Collapse All</Button>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {GUIDE_SECTIONS.slice(0, 5).map(section => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => {
                setExpandedSections(prev => new Set([...prev, section.id]));
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="flex items-center gap-2 p-3 rounded-lg bg-[#141d30] border border-slate-700/50 hover:border-cyan-500/30 transition-colors text-left"
            >
              <Icon className={`w-4 h-4 ${section.color} shrink-0`} />
              <span className="text-xs text-slate-300 truncate">{section.title}</span>
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {filteredSections.map(section => (
          <HelpSection
            key={section.id}
            section={section}
            expanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            searchTerm={searchTerm}
          />
        ))}
        {filteredSections.length === 0 && (
          <Card className="bg-[#141d30] border-slate-700/50">
            <CardContent className="py-12 text-center">
              <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No topics match "{searchTerm}"</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}