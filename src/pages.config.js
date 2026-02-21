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
import AIAssistant from './pages/AIAssistant';
import AIInsights from './pages/AIInsights';
import AdvancedAnalytics from './pages/AdvancedAnalytics';
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';
import AutoImports from './pages/AutoImports';
import BulkEmailExport from './pages/BulkEmailExport';
import CMSAnalytics from './pages/CMSAnalytics';
import CustomReports from './pages/CustomReports';
import Dashboard from './pages/Dashboard';
import DataCenter from './pages/DataCenter';
import DataImports from './pages/DataImports';
import DataQuality from './pages/DataQuality';
import EmailSearchBot from './pages/EmailSearchBot';
import EnrichmentHub from './pages/EnrichmentHub';
import ErrorReports from './pages/ErrorReports';
import ImportHub from './pages/ImportHub';
import ImportSchedule from './pages/ImportSchedule';
import LeadListBuilder from './pages/LeadListBuilder';
import LeadLists from './pages/LeadLists';
import LocationAnalytics from './pages/LocationAnalytics';
import LocationDetail from './pages/LocationDetail';
import Locations from './pages/Locations';
import MAInpatientDashboard from './pages/MAInpatientDashboard';
import NPPESCrawler from './pages/NPPESCrawler';
import NPPESCrawlerDashboard from './pages/NPPESCrawlerDashboard';
import NPPESCrawlerSettings from './pages/NPPESCrawlerSettings';
import NPPESImport from './pages/NPPESImport';
import OrganizationDetail from './pages/OrganizationDetail';
import Organizations from './pages/Organizations';
import ProviderDetail from './pages/ProviderDetail';
import ProviderLocationMatching from './pages/ProviderLocationMatching';
import ProviderOutreach from './pages/ProviderOutreach';
import Providers from './pages/Providers';
import ReferralNetworkIntelligence from './pages/ReferralNetworkIntelligence';
import ReferralPathwayAnalysis from './pages/ReferralPathwayAnalysis';
import Referrals from './pages/Referrals';
import ScoringRules from './pages/ScoringRules';
import TerritoryIntelligence from './pages/TerritoryIntelligence';
import Utilization from './pages/Utilization';
import ImportMonitoring from './pages/ImportMonitoring';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIAssistant": AIAssistant,
    "AIInsights": AIInsights,
    "AdvancedAnalytics": AdvancedAnalytics,
    "Analytics": Analytics,
    "AuditLog": AuditLog,
    "AutoImports": AutoImports,
    "BulkEmailExport": BulkEmailExport,
    "CMSAnalytics": CMSAnalytics,
    "CustomReports": CustomReports,
    "Dashboard": Dashboard,
    "DataCenter": DataCenter,
    "DataImports": DataImports,
    "DataQuality": DataQuality,
    "EmailSearchBot": EmailSearchBot,
    "EnrichmentHub": EnrichmentHub,
    "ErrorReports": ErrorReports,
    "ImportHub": ImportHub,
    "ImportSchedule": ImportSchedule,
    "LeadListBuilder": LeadListBuilder,
    "LeadLists": LeadLists,
    "LocationAnalytics": LocationAnalytics,
    "LocationDetail": LocationDetail,
    "Locations": Locations,
    "MAInpatientDashboard": MAInpatientDashboard,
    "NPPESCrawler": NPPESCrawler,
    "NPPESCrawlerDashboard": NPPESCrawlerDashboard,
    "NPPESCrawlerSettings": NPPESCrawlerSettings,
    "NPPESImport": NPPESImport,
    "OrganizationDetail": OrganizationDetail,
    "Organizations": Organizations,
    "ProviderDetail": ProviderDetail,
    "ProviderLocationMatching": ProviderLocationMatching,
    "ProviderOutreach": ProviderOutreach,
    "Providers": Providers,
    "ReferralNetworkIntelligence": ReferralNetworkIntelligence,
    "ReferralPathwayAnalysis": ReferralPathwayAnalysis,
    "Referrals": Referrals,
    "ScoringRules": ScoringRules,
    "TerritoryIntelligence": TerritoryIntelligence,
    "Utilization": Utilization,
    "ImportMonitoring": ImportMonitoring,
}

export const pagesConfig = {
    mainPage: "AIAssistant",
    Pages: PAGES,
    Layout: __Layout,
};