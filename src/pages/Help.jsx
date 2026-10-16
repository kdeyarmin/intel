import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  HelpCircle, Download, Search, Zap, Brain, MapPin, BarChart3, Target, Upload, Database, Shield,
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import HelpSection from '../components/help/HelpSection';
import CentralSupportCard from '../components/help/CentralSupportCard';
import {
  buildCareMetricIntelSupportUrl,
  isVerifiedCareMetricIntelProduction,
  resolveCentralSupportActivation,
} from '../lib/centralSupport';

const GUIDE_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Zap,
    color: 'text-amber-400',
    content: [
      { page: 'Dashboard', heading: 'Welcome to CareMetric Intel', text: 'CareMetric Intel is a provider intelligence app for home health, hospice and post-acute teams. It brings together public CMS data — the NPPES provider registry, Medicare utilization and payments, Medicare shared-patient patterns and Medicare facility datasets — with your own lead scores, lead lists and outreach.\n\nStart on the **Dashboard** for record counts, data health and recent activity.' },
      { page: 'Dashboard', heading: 'Your account', text: 'New accounts need approval: after signing up you\'ll see a waiting screen until an administrator approves you. Owners invite the people in their own organization, by link.\n\nThere are three roles:\n• **Member** — the directory, facilities, analytics, territory, AI Assistant, reports and lead lists.\n• **Owner** — a member who also manages the organization: its people, plan and billing, security audit and campaigns.\n• **Platform admin** (CareMetric staff) — everything, plus data imports, the NPPES crawler, provider intelligence, scoring rules and every organization\'s accounts.\n\nForgot your password? Use **Forgot password** on the sign-in page (when email is set up) or ask an owner for a reset link. **Account** at the bottom of the sidebar changes your password or signs you out on every device.' },
      { page: 'Dashboard', heading: 'What data is this and how fresh is it?', text: 'Everything in CareMetric comes from public sources: the **NPPES** provider registry, Medicare public use files from **data.cms.gov** and **Care Compare**, and U.S. Census geography. No patient-level data is used; CMS suppresses counts under 11 before publishing, and figures here are CareMetric analytics derived from those files, not CMS publications.\n\nEach dataset carries a **data year** (the period it describes) and an import date. The line at the bottom of data pages summarises what is loaded and when it was last refreshed; admins see the full table on **Data Center › Dataset catalog**. CMS publishes most files once a year (for example the Hospital Service Area file each summer and post-acute utilization in late summer), Care Compare files quarterly, and the NPPES registry weekly. A daily check of the CMS catalogs flags datasets with a newer release, and schedules set to **on release** import them automatically.' },
      { page: 'Dashboard', heading: 'Finding your way', text: 'The sidebar has five sections: **Overview**, **Directory**, **Analytics**, **Sales & Outreach** and **Administration** (admins only). Related pages share one sidebar entry and switch with tabs at the top of the page — for example **Territory & County**, or **Data Center** with its Dataset catalog and Import monitor.\n\nThe **Business** menu on the Dashboard and in the sidebar picks a line of business: home health, hospice, nursing home, personal care home, hospital, or DME. Reports, facilities, the county view, the market table, and call sheets then open on that line. **All lines** shows everything again.\n\nPress **Ctrl+K** (⌘K on a Mac) anywhere to search. On the directory pages (Providers, Organizations, Locations, Facilities), Territory & County, Referral Network and Lead Lists, filters and tabs are kept in the page address, so you can bookmark or share the view and Back returns to it. Other pages, such as the Lead Builder, start fresh each visit. Old links to pages that moved still work.' },
    ],
  },
  {
    id: 'search-directory',
    title: 'Search & Directory',
    icon: Search,
    color: 'text-cyan-400',
    content: [
      { page: 'Providers', heading: 'Searching', text: 'Search (Ctrl+K) and the directory pages search the whole database on the server:\n• **People** by last name — "Smith", "John Smith" or "Smith, John".\n• **Organizations** by any part of the name — "Mercy" finds "Mercy Hospital of Pittsburgh".\n• **NPIs** — the full 10 digits, or the first few.\n• **Places** (Locations page) — a ZIP or ZIP+4, "Pittsburgh, PA", or a state. A city on its own needs a state.\n\nVery common names return the first matches; add a state or more letters to narrow them.' },
      { page: 'Providers', heading: 'Providers and organizations', text: '**All Providers** lists individuals and organizations with state, type and specialty filters. **Organizations** lists organization NPIs. Opening any provider shows its profile: identity and specialties, practice locations, Medicare utilization, shared-patient partners, lead score, linked facilities and outreach history. Organizations also show affiliated providers.\n\nThe **Report** tab builds a report from the sections you tick (all are ticked to start): profile, locations, specialties, Medicare utilization, referrals sent and received, affiliations, linked facilities, quality ratings, ownership details, cost report summaries, additional quality measures, lead score and enrichments. Ownership shows reported names, percentages and roles; cost reports show available revenue, expenses, beds and visits; additional quality is a curated snapshot, not every measure. These sections use linked CCN, NPI or enrollment records where available, keep each dataset\'s latest release, and say when data is missing rather than inventing values. **Print** gives a clean, branded layout (choose Save as PDF in the print dialog), and **Download PDF** saves a branded PDF directly; each counts as one export against your organization\'s daily allowance.' },
      { page: 'Locations', heading: 'Locations', text: 'Find practice and mailing addresses by NPI, ZIP, "City, ST" or state. Each location opens its provider and nearby details.' },
      { page: 'Facilities', heading: 'Facilities', text: 'One page lists Medicare facilities by type — hospitals, home health agencies, hospices, nursing homes, inpatient rehab, long-term care hospitals, DME suppliers and community health centers. Pick the type at the top, then search by name or filter by state. A facility\'s page summarizes its imported CMS records (up to 500 per facility, with the first 50 rows of each dataset listed) and links to the matching provider when there is one. Its **Report** tab builds the same printable report for the facility: profile, CMS records, quality ratings, ownership details, cost report summaries, additional quality measures and, when it has a linked NPI, that provider\'s sections too. Financial periods and CMS quality units may differ across datasets; the report does not sum ownership interests or combine financial totals.\n\nThe **DME report** tab exports DME suppliers to CSV or Excel; finding supplier emails is admin-only.' },
    ],
  },
  {
    id: 'ai-assistant',
    title: 'AI Assistant',
    icon: Brain,
    color: 'text-violet-400',
    content: [
      { page: 'AIAssistant', heading: 'What it can do', text: 'Ask questions in plain English. The assistant looks the answer up in the app\'s data — providers and their profiles, counties and states, referral networks, dashboard numbers and your lead lists — and links to the pages it used. It says when a figure is an estimate or comes from a sample, and treats "Unscored" as no score rather than zero.\n\nExamples:\n• "Who are the highest-scored cardiologists in Allegheny County, PA?"\n• "Summarize Franklin County, OH."\n• "Who does NPI 1234567890 share the most patients with?"\n• "What do my lead lists look like?"' },
      { page: 'AIAssistant', heading: 'Making a lead list', text: 'Ask the assistant to make a list from providers it found. It shows a **proposed lead list** card with the providers; nothing is created until you press **Create list** (or **Cancel**). Proposals expire after 24 hours. The assistant can\'t change or delete anything else.' },
      { page: 'AIAssistant', heading: 'Conversations and limits', text: 'Conversations are saved for you only; rename or delete them from the list, and use **Load older conversations** at the bottom to see earlier ones. Press **Stop** to end an answer early. The assistant answers one of your questions at a time, so wait for an answer to finish before asking in another conversation. Each person can ask a few questions a minute and has a daily usage limit; an answer that reaches the limit stops early. A conversation holds up to 40 questions. Answers can be wrong — check important figures on the linked pages.\n\nIf the page says the assistant isn\'t set up, an admin needs to add the Anthropic API key to the server.' },
    ],
  },
  {
    id: 'territory',
    title: 'Territory & County',
    icon: MapPin,
    color: 'text-teal-400',
    content: [
      { page: 'TerritoryIntelligence', heading: 'Territory map', text: 'Shows providers in a state on a map, starting with the highest lead scores. Filter by specialty group, entity type, score range and patient volume; color markers by score; switch on the heat map or volume density. Providers without a score are shown as **Unscored**, never as zero, and drop out when you set a score range.\n\nThe **County density** tab ranks counties by practice locations and links to each county.' },
      { page: 'CountyIntelligence', heading: 'County view', text: 'Pick a state and a county to see providers practicing there, top specialties, the highest-scored providers, Medicare facilities, the strongest shared-patient pairs and top Medicare services. In large counties the page counts **practice locations** instead of providers (a provider with several offices counts more than once) and the details describe a sample; totals marked "≈" are estimates.' },
      { page: 'MarketIntelligence', heading: 'Market tab and county table', text: 'Every county view has a **Market** tab: Medicare beneficiaries and the Medicare Advantage share (Medicare Monthly Enrollment), residents aged 85 and over and dual-eligibles, home health, hospice and skilled nursing use and supply (CMS Market Saturation), standardized spend per beneficiary and readmissions (Medicare Geographic Variation), how many hospitals serve the county\'s residents, the population aged 65 and over and 85 and over, people 65+ living alone and median household income (Census ACS 5-year estimates, bundled with the app), and the state-licensed personal care and assisted living homes and beds once a licensing export is imported. **Market Intelligence** (Territory › Market) puts every county of a state in one sortable table, with a CSV download; the Territory map\'s county density tab can colour counties by any of the same metrics.\n\nThese figures come from the daily market rollups, which need the enrollment, saturation, variation and Hospital Service Area files imported; each view says which vintage it used and when it was computed.' },
      { page: 'CountyIntelligence', heading: 'Hospital sources and competitors', text: '**Hospital sources** lists the hospitals whose Medicare inpatients live in the county (CMS Hospital Service Area: the patient\'s ZIP of residence by hospital), with each hospital\'s share of the county\'s cases and, where CMS publishes it, its post-discharge spend to skilled nursing, home health and hospice (Medicare Hospital Spending by Claim). That mix is a proxy for where a hospital\'s patients go next, not a count of transfers. A hospital\'s own page shows the counties and ZIP areas its patients come from.\n\n**Competitors** ranks the post-acute providers located in the county by the Medicare beneficiaries they served (Post-Acute Care Utilization by Provider) for skilled nursing, home health, hospice, inpatient rehab and long-term care hospitals, with payments, dual-eligible share and risk scores, year-over-year trend, and the home health agencies and hospices whose Care Compare service areas cover the county\'s ZIP codes. A facility\'s own page shows its rank and share in its county and state.\n\n**Referral sources** ranks the county\'s clinicians by a referral index with the chronic-condition mix of their patients and their hospital affiliations; filter by eligibility or specialty group and add the top clinicians to a lead list in one step. Once an admin has imported **Home Health Certifications** (Data Center; a small file read from CMS\'s Physician & Other Practitioners by Provider and Service), the index rests mainly on the Medicare patients a clinician certified for home health in that file\'s year (HCPCS G0180), so the clinicians who actually start home health episodes rank first. CMS counts patients for each care setting and lists a setting only above 10, so the figure adds up the settings (a patient certified in two counts in both), and a clinician shown as ≤10 is not listed in any of them (10 or fewer in each, or none). Without that file the index counts Medicare volume, patient risk score and Order & Referring eligibility (which almost every physician has), a weaker guide to who refers. Certifications show who certifies home health; they are not confirmed referrals to any one agency.' },
      { page: 'CountyIntelligence', heading: 'What market share means here', text: 'Market share is a provider\'s share of the Medicare fee-for-service beneficiaries served by all providers of that setting **located in the same county** (or state), from the CMS Post-Acute Care Utilization files. It describes Original Medicare only: Medicare Advantage, Medicaid and private-pay patients are not in the files, so a county with a high Medicare Advantage share is under-counted. Home health agencies and hospices serve patients beyond their home county, which is why the service-area coverage list is shown alongside. CMS suppresses counts under 11 before publishing, and all of these figures are CareMetric analytics derived from public CMS data rather than CMS publications.' },
      { page: 'TerritoryIntelligence', heading: 'About the geography', text: 'Counties and ZIP areas come from the 2020 U.S. Census. A provider is placed at the center of its ZIP area (or of its 3-digit ZIP region or state when the ZIP isn\'t a Census ZIP area), so map positions are approximate. A ZIP area belongs to the county holding most of its land.' },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics & Networks',
    icon: BarChart3,
    color: 'text-blue-400',
    content: [
      { page: 'ReferralNetworkIntelligence', heading: 'Referral Network', text: 'Maps Medicare shared-patient patterns — how many patients two providers both saw — for a state, a lead list or one provider. These are patterns, not confirmed referrals. The view shows the busiest providers and their strongest connections; hubs are the most connected providers. Large networks are trimmed to the busiest part, and the page says when it is.' },
      { page: 'CMSAnalytics', heading: 'CMS Data', text: 'Summaries of Medicare utilization by service type, the providers others share the most Medicare patients with (the **Top Referred-To Providers** chart; shared patients, not confirmed referrals) and facility datasets. They are computed in the background (roughly daily), and each section shows when it was last refreshed; admins can refresh them.' },
      { page: 'CustomReports', heading: 'Reports and analytics', text: '**Reports** is a catalog of named briefs. **Expansion** ranks counties for home health, hospice, or skilled nursing, including where use rose while billing providers did not. **Acquisition** lists the largest agencies, hospices, or nursing homes located in a state, with census and payer mix for nursing homes. **Hospital relationships** shows which hospitals discharge a county’s residents and how their Medicare spend splits across those settings. **Referral development** is the clinician call list for home health or hospice. Open a county from an expansion report for the hospitals and providers already there. **Builder** still saves charts and emails them on a schedule to up to 25 people with an active account (or an address on a domain an admin has approved). **Analytics** has trend and comparison views. **Utilization** explores Medicare services and payments by provider.' },
    ],
  },
  {
    id: 'sales',
    title: 'Lead Lists & Outreach',
    icon: Target,
    color: 'text-green-400',
    content: [
      { page: 'LeadLists', heading: 'Lead lists', text: 'Lead lists hold the providers you\'re working, each with a status (New, Contacted, Qualified, Not a fit). Add providers from any provider page, from search results, from the AI Assistant, or with the Lead Builder. Open a list to update statuses or export it; owners can also start a campaign from it.' },
      { page: 'CallSheets', heading: 'Call sheets', text: '**Lead Lists › Call sheets** is the working list for a county. Create a sheet, then add the hospitals, home health agencies, hospices, nursing homes, clinicians, DME suppliers and licensed homes in that county. Each account keeps a status (Not scheduled, Call, Visit, or Account), a next date and your notes. **Schedule** shows the calls and visits. **Chart of accounts** shows the ones you marked Account. Print the view you are on. Adding the same accounts again does not erase notes.\n\n**Lead Lists › Marketing** is the book you keep month to month. Add an account (or import a CSV — map the columns and review the preview before anything is saved; a template is on that screen), then the administrator, director of nursing, business office, social services and the other people you call, including their email. Search and filter the book, save a view, and set a stage (Prospect, Working, Customer, Inactive). Tags, phone, website and NPI live on the account; an NPI opens the provider. Log a visit, a call or a note, schedule the next visit, and log each referral without a patient name. Mark a referral admitted or lost. Each row shows engagement from the work you logged (an account with no calls and no referrals stays “No activity”) and a data-quality flag when the phone, a contact, an email, or a recent call is missing. Possible duplicates — the same name with a different legal suffix, or the same NPI — can be merged. Select rows to set their stage together, or export the book. **Month end** shows sales calls, calls per referral, the share of referrals that became admissions, who referred more or less than the month before, and who to put on next month’s schedule. From a provider page, **Add to marketing book** puts that NPI on the book once. Link a campaign on the account to record which campaign touched it. **Campaigns** then lists the accounts that campaign reached, and the visits, referrals and admissions dated on or after that touch. The earliest campaign is first touch, the latest is last touch, and any campaign between them influenced the account. Linking a campaign does not send email.' },
      { page: 'LeadListBuilder', heading: 'Lead Builder', text: 'Filter providers by state, city, ZIP, specialty text, score range, Medicare patient volume, Medicare participation and behavioral-health or geriatric focus, then save the matches as a list.\n\nThe builder only filters the 500 most recently added providers, so it can miss matches. To list a specialty or area across the whole database, ask the AI Assistant. The Territory map shows a bounded sample: up to 500 providers for a state (highest scores first) or a specialty.' },
      { page: 'ProviderOutreach', heading: 'Campaigns (owners)', text: 'Owners create email campaigns for a lead list, review and send them, and track deliveries, opens, clicks, responses and bounces. Only owners (and platform admins) can send; members don\'t see Campaigns. Every email carries an unsubscribe link that is honoured automatically.' },
      { page: 'ProviderIntelligence', heading: 'Provider intelligence (admin)', text: 'Finds and checks provider contact details: AI-assisted email search, email verification (by checking the domain\'s mail servers), NPI validation and enrichment of provider records. Suggested changes are reviewed before they\'re applied.' },
    ],
  },
  {
    id: 'data',
    title: 'Data Imports (Admin)',
    icon: Upload,
    color: 'text-orange-400',
    content: [
      { page: 'DataCenter', heading: 'Importing state-licensed homes', text: 'Personal care homes and assisted living residences are licensed by states and never appear in CMS files. Pick **State-Licensed Homes** in the Data Center, upload the state\'s licensing export as a CSV (or give an https link) and set the state, the license type the file holds (if its rows don\'t say) and the export\'s year. Columns are matched by name: name, address, city, ZIP, license number, license type, capacity, status, licensee and phone are recognised under their usual spellings. Each home gets its county from its ZIP; re-importing a newer export updates the same homes and removes the ones it no longer lists. They then show on **Facilities › Licensed Homes**, on County Intel\'s **Competitors** tab and in the county profile\'s licensed homes and beds. For Pennsylvania, the DHS personal care home and assisted living directories are the source.' },
      { page: 'DataCenter', heading: 'Importing data', text: 'Go to **Data Center**, choose a dataset (NPPES, Medicare utilization, shared-patient patterns, facility datasets and more), then either let the app download it from CMS or upload a file. Column mapping is suggested for you. Large imports run in the background and can be paused and resumed.' },
      { page: 'ImportMonitoring', heading: 'Import monitor', text: 'Tracks every import with live progress, history, validation rules, alerts, performance and schedules (tabs at the top). Imports that fail for temporary reasons, such as a network error or rate limit, are retried automatically; the **Health** tab shows success rates, top errors and the retry pipeline, and warns when scheduled maintenance has stopped running. Its **Needs attention** list (platform admins) names datasets whose newer release hasn\'t been imported within a week, datasets marked importing whose import has ended or stopped moving, schedules failing three times in a row, a maintenance run that is overdue or had failing workers, and analytics rollups that are overdue (two days, or nine for the weekly lead scoring refresh); platform admins also get that list by email at most once a day while anything is open.' },
      { page: 'CMSDataSources', heading: 'Dataset catalog', text: 'Lists the CMS datasets the app knows about, with their sources and how recently each was imported.' },
    ],
  },
  {
    id: 'crawler',
    title: 'NPPES Crawler (Admin)',
    icon: Database,
    color: 'text-sky-400',
    content: [
      { page: 'NPPESCrawler', heading: 'Crawler', text: 'Pulls provider records from the NPPES API one state at a time on the server, so you can close the page while it runs. Start, pause or resume it and watch each state\'s progress.' },
      { page: 'NPPESCrawlerSettings', heading: 'Settings', text: 'On the **Settings** tab: records per request (up to 200), the pause between requests, parallel workers, the time limit per state, and whether to crawl individuals, organizations or both.' },
    ],
  },
  {
    id: 'admin',
    title: 'Administration',
    icon: Shield,
    color: 'text-red-400',
    content: [
      { page: 'AdminSettings', heading: 'Users and your organization', text: 'Every account belongs to an organization: the one created when its first owner signed up. Under **Admin Settings → Users** an owner sees their organization\'s people: invite people by link (up to the plan\'s seat limit), make someone an owner or a member, disable or re-enable accounts, create password reset links and sign someone out everywhere. Owners manage people, billing and campaigns; members use everything else. You can\'t change your own account here. Account activity is recorded.\n\nPlatform admins (CareMetric staff) see every organization, approve new sign-ups (one that subscribes is approved by its payment), run imports and maintenance, and are the only ones who can make other platform admins.' },
      { page: 'Billing', heading: 'Plan, billing and territory', text: 'Under **Admin Settings → Billing** an owner sees the organization\'s plan and status, the trial or billing period, seats used, and today\'s usage against the plan\'s quotas (AI requests, exports and outreach emails per day). Choose or change a plan with secure checkout, or open the billing portal for payment methods and invoices. A county pack covers a chosen set of counties and a state plan one state: pick them here, and the County, Market, Territory and referral-source views answer only for that territory (anything else says it is outside the plan, and until an owner has chosen the places those views stay locked). Changing plans updates the subscription in place; the difference is prorated on the next invoice. New organizations start with a free trial; a failed payment shows as payment due until it is fixed.' },
      { page: 'ScoringRules', heading: 'Scoring rules', text: 'The CareMetric score (0–100) weights specialty match, Medicare participation, patient volume, service intensity, geographic priority, practice type and behavioral-health potential. Adjust the weights (they should total 100%); the **Geographic Priority** rule\'s conditions name the states that are scored and any priority counties, and the **Specialty Match** rule lists the specialty groups that count as a match.\n\nScores are computed on the server for every individual provider with a practice location in those states, from the NPPES taxonomy (by NUCC code), the CMS Order & Referring list, Physician & Other Practitioners by Provider volumes and facility affiliations. **Recalculate scores** runs the job in the background (it takes a few minutes per state) and it also runs weekly after imports. Each score keeps its breakdown and reasons, shown on provider pages; providers outside the scored states show as Unscored.' },
      { page: 'DataQuality', heading: 'Data quality', text: 'Validation rules, quality alerts and scan history for the provider data, with an assistant for investigating issues. **Reconciliation** compares records with external sources, and **Provider Matching** links providers to facilities.' },
      { page: 'SecurityAudit', heading: 'Security audit', text: 'Under **Admin Settings → Security audit**: sign-ins, account changes, exports and other recorded actions for your organization, with filters.' },
      { page: 'Billing', heading: 'Terms, privacy and data use', text: 'Signing up accepts the Terms of Service and Privacy Policy, linked from the sign-in page (/terms, /privacy). The data-use page (/data-use) lists every source behind the app and what the figures are: CareMetric analytics derived from public CMS, NPPES and Census files (never presented as CMS data), Medicare fee-for-service only unless noted, counts under 11 suppressed, no patient-level data, and shared-patient patterns that are not confirmed referrals. Every export carries that source line. Use the data for your own organization\'s research and outreach within your plan\'s territory; don\'t resell or republish it.' },
    ],
  },
];

// jsPDF's built-in fonts only cover Windows-1252; spell out the symbols the
// guide uses that it lacks.
const PDF_REPLACEMENTS = [[/→/g, '>'], [/≈/g, '~'], [/⌘/g, 'Cmd+']];
function pdfText(text) {
  return PDF_REPLACEMENTS.reduce((t, [re, to]) => t.replace(re, to), text);
}

export default function Help() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState(new Set(['getting-started']));
  const [generating, setGenerating] = useState(false);
  const centralSupportRuntime = {
    appId: import.meta.env.VITE_BASE44_APP_ID,
    environment: import.meta.env.VITE_DEPLOY_ENV,
    hostname: typeof window === 'undefined' ? '' : window.location.hostname,
    flag: import.meta.env.VITE_CENTRAL_SUPPORT_HUB_ENABLED,
    isDevelopment: import.meta.env.DEV === true,
  };
  const centralSupportIdentityVerified = isVerifiedCareMetricIntelProduction(centralSupportRuntime);
  const centralSupportEnabled = resolveCentralSupportActivation(centralSupportRuntime);
  const centralSupportUrl = centralSupportEnabled ? buildCareMetricIntelSupportUrl() : null;

  const toggleSection = (id) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedSections(new Set(GUIDE_SECTIONS.map(s => s.id)));
  const collapseAll = () => setExpandedSections(new Set());

  // While searching, show only matching topics (all of a section whose title
  // matches), with their sections open.
  const query = searchTerm.trim().toLowerCase();
  const filteredSections = GUIDE_SECTIONS
    .map(section => {
      if (!query || section.title.toLowerCase().includes(query)) return { section, topics: section.content };
      const topics = section.content.filter(c => c.heading.toLowerCase().includes(query) || c.text.toLowerCase().includes(query));
      return { section, topics };
    })
    .filter(({ topics }) => topics.length > 0);

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
      doc.text('CareMetric Intel', margin, 60);
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
          doc.text(pdfText(item.heading), margin, y);
          y += 7;

          doc.setTextColor(71, 85, 105);
          doc.setFontSize(9.5);
          const cleanText = pdfText(item.text.replace(/\*\*/g, ''));
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
      doc.text('CareMetric Intel — caremetricintel.com', margin, 285);
      doc.text('Data sources: CMS Medicare and NPPES provider files; U.S. Census Bureau geography', margin, 290);

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
        subtitle="Learn how to use CareMetric Intel — browse topics or download the full PDF guide"
        icon={HelpCircle}
        breadcrumbs={[{ label: 'Help' }]}
        actions={
          <Button onClick={generatePDF} disabled={generating} className="bg-cyan-700 hover:bg-cyan-600 text-white gap-2">
            <Download className="w-4 h-4" aria-hidden="true" />
            {generating ? 'Generating...' : 'Download PDF Guide'}
          </Button>
        }
      />

      {centralSupportIdentityVerified && <CentralSupportCard hubUrl={centralSupportUrl} />}

      {/* Search & controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <Input
            placeholder="Search help topics..."
            aria-label="Search help topics"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-[#141d30] border-slate-700/50 text-slate-200 placeholder:text-slate-400"
          />
        </div>
        {/* While searching every matching section is open, so these do nothing. */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll} disabled={Boolean(query)} className="text-xs">Expand All</Button>
          <Button variant="outline" size="sm" onClick={collapseAll} disabled={Boolean(query)} className="text-xs">Collapse All</Button>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {GUIDE_SECTIONS.slice(0, 5).map(section => {
          const Icon = section.icon;
          return (
            <button
              type="button"
              key={section.id}
              onClick={() => {
                setExpandedSections(prev => new Set([...prev, section.id]));
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="flex items-center gap-2 p-3 rounded-lg bg-[#141d30] border border-slate-700/50 hover:border-cyan-500/30 transition-colors text-left"
            >
              <Icon className={`w-4 h-4 ${section.color} shrink-0`} aria-hidden="true" />
              <span className="text-xs text-slate-300 truncate">{section.title}</span>
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {filteredSections.map(({ section, topics }) => (
          <HelpSection
            key={section.id}
            section={section}
            topics={topics}
            expanded={Boolean(query) || expandedSections.has(section.id)}
            locked={Boolean(query)}
            onToggle={() => toggleSection(section.id)}
            searchTerm={searchTerm}
          />
        ))}
        {filteredSections.length === 0 && (
          <Card className="bg-[#141d30] border-slate-700/50">
            <CardContent className="py-12 text-center">
              <Search className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
              <p className="text-slate-400">No topics match "{searchTerm}"</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
