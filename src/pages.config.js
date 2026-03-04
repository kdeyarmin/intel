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
import APIConnectors from './pages/APIConnectors';
import AdminSettings from './pages/AdminSettings';
import AdvancedAnalytics from './pages/AdvancedAnalytics';
import AuditLog from './pages/AuditLog';
import CMSAnalytics from './pages/CMSAnalytics';
import CMSDataSources from './pages/CMSDataSources';
import Campaigns from './pages/Campaigns';
import CustomReports from './pages/CustomReports';
import Dashboard from './pages/Dashboard';
import DataCenter from './pages/DataCenter';
import DataQuality from './pages/DataQuality';
import EmailSearchBot from './pages/EmailSearchBot';
import EnrichmentHub from './pages/EnrichmentHub';
import Help from './pages/Help';
import ImportAnalytics from './pages/ImportAnalytics';
import ImportMonitoring from './pages/ImportMonitoring';
import ImportOverview from './pages/ImportOverview';
import LeadListBuilder from './pages/LeadListBuilder';
import LeadLists from './pages/LeadLists';
import LocationDetail from './pages/LocationDetail';
import Locations from './pages/Locations';
import MAInpatientDashboard from './pages/MAInpatientDashboard';
import NPPESCrawler from './pages/NPPESCrawler';
import NPPESCrawlerDashboard from './pages/NPPESCrawlerDashboard';
import NPPESCrawlerSettings from './pages/NPPESCrawlerSettings';
import OrganizationDetail from './pages/OrganizationDetail';
import Organizations from './pages/Organizations';
import ProjectManagement from './pages/ProjectManagement';
import ProviderDetail from './pages/ProviderDetail';
import ProviderLocationMatching from './pages/ProviderLocationMatching';
import ProviderOutreach from './pages/ProviderOutreach';
import Providers from './pages/Providers';
import ReconciliationDashboard from './pages/ReconciliationDashboard';
import ReferralNetworkIntelligence from './pages/ReferralNetworkIntelligence';
import ReferralPathwayAnalysis from './pages/ReferralPathwayAnalysis';
import ScoringRules from './pages/ScoringRules';
import TerritoryIntelligence from './pages/TerritoryIntelligence';
import Utilization from './pages/Utilization';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIAssistant": AIAssistant,
    "APIConnectors": APIConnectors,
    "AdminSettings": AdminSettings,
    "AdvancedAnalytics": AdvancedAnalytics,
    "AuditLog": AuditLog,
    "CMSAnalytics": CMSAnalytics,
    "CMSDataSources": CMSDataSources,
    "Campaigns": Campaigns,
    "CustomReports": CustomReports,
    "Dashboard": Dashboard,
    "DataCenter": DataCenter,
    "DataQuality": DataQuality,
    "EmailSearchBot": EmailSearchBot,
    "EnrichmentHub": EnrichmentHub,
    "Help": Help,
    "ImportAnalytics": ImportAnalytics,
    "ImportMonitoring": ImportMonitoring,
    "ImportOverview": ImportOverview,
    "LeadListBuilder": LeadListBuilder,
    "LeadLists": LeadLists,
    "LocationDetail": LocationDetail,
    "Locations": Locations,
    "MAInpatientDashboard": MAInpatientDashboard,
    "NPPESCrawler": NPPESCrawler,
    "NPPESCrawlerDashboard": NPPESCrawlerDashboard,
    "NPPESCrawlerSettings": NPPESCrawlerSettings,
    "OrganizationDetail": OrganizationDetail,
    "Organizations": Organizations,
    "ProjectManagement": ProjectManagement,
    "ProviderDetail": ProviderDetail,
    "ProviderLocationMatching": ProviderLocationMatching,
    "ProviderOutreach": ProviderOutreach,
    "Providers": Providers,
    "ReconciliationDashboard": ReconciliationDashboard,
    "ReferralNetworkIntelligence": ReferralNetworkIntelligence,
    "ReferralPathwayAnalysis": ReferralPathwayAnalysis,
    "ScoringRules": ScoringRules,
    "TerritoryIntelligence": TerritoryIntelligence,
    "Utilization": Utilization,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};