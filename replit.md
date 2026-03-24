# CareMetric AI Intelligence

## Overview
CareMetric AI Intelligence is a React/Vite frontend application designed for healthcare provider intelligence, CRM, and analytics. It serves as a comprehensive data platform enabling provider management, lead generation, email campaigns, CMS analytics, and AI-driven insights to enhance healthcare provider strategies and outreach. The project's vision is to streamline healthcare data analysis and provider engagement, offering a robust toolset for market advantage and operational efficiency.

## User Preferences
The user prefers detailed explanations of changes and functionality. The user wants the agent to ask for confirmation before implementing major architectural changes or deleting significant portions of code. The user prefers iterative development with regular updates on progress. The user wants the agent to adhere to the established dark theme guidelines and responsive design patterns.

## System Architecture
The application is built with a React 18 + Vite 6 frontend, styled using TailwindCSS and Radix UI components, specifically leveraging `shadcn/ui`. State management is handled by TanStack React Query, and routing uses React Router v6. The backend is an Express.js API (port 3001) providing generic entity CRUD operations. Data persistence is managed by PostgreSQL with Drizzle ORM, encompassing 49 distinct tables. Authentication is JWT-based, utilizing bcrypt for password hashing. The system integrates AI capabilities via Anthropic Claude, email services through SendGrid, and file uploads via Multer. Frontend API client (`src/api/client.js`) mirrors the Base44 SDK interface for consistent interaction with backend entities, integrations, and functions.

**Key UI/UX decisions include:**
- **Dark Theme:** Strict adherence to a dark theme palette: `text-slate-300/400`, `bg-slate-800/900`. Accent colors use `bg-*-900/30 text-*-400 border-*-500/30`.
- **Responsive Design:** Page wrappers utilize `p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto`, with grids collapsing on smaller screens and tables supporting horizontal overflow.

**Core Technical Implementations and Features:**
- **Provider Management:** Comprehensive tools for managing providers, locations, and territory mapping.
- **Facility Pages:** Unified detail pages for 10 facility groups: Hospitals, Home Health, Hospice, SNF, Dialysis, IRF, LTCH, DME, FQHC, RHC. Each group has a searchable list page (with state filter) and a detail page consolidating all imported CMS data per facility. Backend: `server/functions/facilityDetail.ts` (getFacilityDetail, listFacilities, handleGetProviderCMSData). Pages: `Hospitals.jsx`, `HomeHealthAgencies.jsx`, `Hospices.jsx`, `NursingHomes.jsx`, `DialysisFacilities.jsx`, `InpatientRehab.jsx`, `LongTermCare.jsx`, `DMESuppliers.jsx`, `FQHCs.jsx`, `RuralHealthClinics.jsx`, `FacilityDetail.jsx`. All pages pass explicit Tailwind `iconCls` props (no dynamic class interpolation). DB indexes: `idx_medfac_type_name` (facility_type, facility_name), `idx_medfac_provider_id` (provider_id), `idx_medfac_type_state` (facility_type, state). Listing queries use a single "primary type" per group (e.g. `hospital_general_info` for hospitals) for performance. Indexes are built concurrently on app startup via background IIFE in `server/index.ts`.
- **Provider CMS Data:** `handleGetProviderCMSData` returns MIPS, clinician profile, group practice, physician utilization, Part D prescribing, DME referrals, drug spending, facility affiliations, telehealth trends, and ACO network data. Data is grouped into `clinician`, `utilization_cms`, and `network` (ACO) categories. Displayed via `MIPSPerformanceCard` and `ProviderCMSDataCard` on ProviderDetail's Clinical and Network tabs. ACO data (participants, organizations, financial results) appears in a dedicated network section. `cmsImportTypes.js` contains labels for all 90+ configured dataset types. FACILITY_TYPE_GROUPS maps ~70 dataset types to 10 facility groups, ensuring all quality, payment, staffing, ownership, and VBP data flows into the correct facility detail page.
- **Sales & Outreach:** Functionality for lead lists, provider intelligence, and multi-channel campaigns.
- **Analytics:** CMS data analysis, network insights, and custom reporting capabilities, including materialized views for performance.
- **AI Assistant & Enrichment:** AI-powered tools for data enrichment and insights.
- **Data Import System:** Robust import mechanisms for Medicare/CMS datasets, NPPES flat files, and ZIP imports with pause/resume, error handling, and stall detection.
- **Security:** JWT-based authentication with role-based access control (adminOnly middleware), sensitive field stripping, and file upload size limits. User entity is explicitly excluded from generic CRUD for security.
- **NPPES Crawler:** A dedicated crawler for the NPPES registry with actions for status, batch control, and queue processing.
- **Email Search Bot:** An AI-powered bot (Claude-based) for email discovery, validation, and automated saving to provider records.
- **Data Quality Scan:** Utilizes sampling for performance, runs 13 quality rules, and generates alerts with Claude AI integration for analysis and fixes.
- **Backend Functions:** A set of 29 backend functions, including optimized dashboard statistics, data health metrics, CMS dataset catalog, CMS analytics, referral network data, and territory data.

## External Dependencies
- **AI:** Anthropic Claude (via `/api/integrations/ai/invoke`)
- **Email:** SendGrid (via `/api/integrations/email/send`)
- **Database:** PostgreSQL (with Drizzle ORM)
- **File Upload:** Multer (for `/api/integrations/file/upload`)