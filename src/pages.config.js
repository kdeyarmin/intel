/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';
import AutoImports from './pages/AutoImports';
import BulkEmailExport from './pages/BulkEmailExport';
import Dashboard from './pages/Dashboard';
import DataImports from './pages/DataImports';
import ErrorReports from './pages/ErrorReports';
import ImportMonitoring from './pages/ImportMonitoring';
import ImportSchedule from './pages/ImportSchedule';
import LeadDiscoveryCopilot from './pages/LeadDiscoveryCopilot';
import LeadListBuilder from './pages/LeadListBuilder';
import LeadLists from './pages/LeadLists';
import LocationAnalytics from './pages/LocationAnalytics';
import Locations from './pages/Locations';
import ProviderDetail from './pages/ProviderDetail';
import ProviderLocationMatching from './pages/ProviderLocationMatching';
import Providers from './pages/Providers';
import ReferralNetworkIntelligence from './pages/ReferralNetworkIntelligence';
import ReferralPathwayAnalysis from './pages/ReferralPathwayAnalysis';
import Referrals from './pages/Referrals';
import ScoringRules from './pages/ScoringRules';
import TerritoryIntelligence from './pages/TerritoryIntelligence';
import Utilization from './pages/Utilization';
import NPPESImport from './pages/NPPESImport';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Analytics": Analytics,
    "AuditLog": AuditLog,
    "AutoImports": AutoImports,
    "BulkEmailExport": BulkEmailExport,
    "Dashboard": Dashboard,
    "DataImports": DataImports,
    "ErrorReports": ErrorReports,
    "ImportMonitoring": ImportMonitoring,
    "ImportSchedule": ImportSchedule,
    "LeadDiscoveryCopilot": LeadDiscoveryCopilot,
    "LeadListBuilder": LeadListBuilder,
    "LeadLists": LeadLists,
    "LocationAnalytics": LocationAnalytics,
    "Locations": Locations,
    "ProviderDetail": ProviderDetail,
    "ProviderLocationMatching": ProviderLocationMatching,
    "Providers": Providers,
    "ReferralNetworkIntelligence": ReferralNetworkIntelligence,
    "ReferralPathwayAnalysis": ReferralPathwayAnalysis,
    "Referrals": Referrals,
    "ScoringRules": ScoringRules,
    "TerritoryIntelligence": TerritoryIntelligence,
    "Utilization": Utilization,
    "NPPESImport": NPPESImport,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};