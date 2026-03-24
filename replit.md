# CareMetric AI Intelligence

## Overview
CareMetric AI Intelligence is a React/Vite frontend application designed to be a comprehensive healthcare provider data platform. Its primary purpose is to provide healthcare provider intelligence, CRM functionalities, and advanced analytics. The platform enables efficient provider management, lead generation, execution of email campaigns, analysis of CMS data, and leverages AI for insights and enrichment. The business vision is to empower healthcare organizations with data-driven decision-making, streamline outreach efforts, and enhance operational efficiency within the competitive healthcare market.

## User Preferences
I want iterative development. I want to be asked before making major changes. I prefer detailed explanations. I prefer simple language. I like functional programming. Do not make changes to the folder `functions/`.

## System Architecture
The application features a modern web architecture with a React 18 frontend built with Vite 6, styled using TailwindCSS and Radix UI components. The backend is an Express.js API (port 3001) providing generic entity CRUD routes. Data persistence is handled by PostgreSQL, utilizing Drizzle ORM for schema management across 49 tables. UI/UX emphasizes a dark theme, using `text-slate-300/400`, `bg-slate-800/900`, and specific accent colors like `bg-*-900/30 text-*-400 border-*-500/30`. Responsive design is ensured with consistent page wrappers (`p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto`) and adaptable grid/table layouts. Core features include a Dashboard with alerts, Provider Management (All Providers, Locations, Territory Map), Sales & Outreach (Lead Lists, Provider Intelligence, Campaigns), Analytics (CMS Data, Network, Reports), and AI Assistant tools. The system includes robust security measures such as JWT-based authentication with bcrypt hashing, role-based access control, and limited file upload sizes.

## External Dependencies
- **AI**: Anthropic Claude (via `/api/integrations/ai/invoke`)
- **Email**: SendGrid (via `/api/integrations/email/send`)
- **File Upload**: Multer (for `/api/integrations/file/upload`, storing files in `uploads/`)
- **Database**: PostgreSQL
- **UI Components**: shadcn/ui (built on Radix UI primitives)