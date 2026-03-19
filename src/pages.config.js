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
 *   import Dashboard from './pages/Dashboard.jsx';
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
import AIAssistant from './pages/AIAssistant.jsx';
import APIConnectors from './pages/APIConnectors.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import AdvancedAnalytics from './pages/AdvancedAnalytics.jsx';
import AuditLog from './pages/AuditLog.jsx';
import CMSAnalytics from './pages/CMSAnalytics.jsx';
import CMSDataSources from './pages/CMSDataSources.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CustomReports from './pages/CustomReports.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DataCenter from './pages/DataCenter.jsx';
import DataQuality from './pages/DataQuality.jsx';
import EmailSearchBot from './pages/EmailSearchBot.jsx';
import EnrichmentHub from './pages/EnrichmentHub.jsx';
import Help from './pages/Help.jsx';
import ImportAnalytics from './pages/ImportAnalytics.jsx';
import ImportMonitoring from './pages/ImportMonitoring.jsx';
import ImportOverview from './pages/ImportOverview.jsx';
import LeadListBuilder from './pages/LeadListBuilder.jsx';
import LeadLists from './pages/LeadLists.jsx';
import LocationDetail from './pages/LocationDetail.jsx';
import Locations from './pages/Locations.jsx';
import MAInpatientDashboard from './pages/MAInpatientDashboard.jsx';
import NPPESCrawler from './pages/NPPESCrawler.jsx';
import NPPESCrawlerDashboard from './pages/NPPESCrawlerDashboard.jsx';
import NPPESCrawlerSettings from './pages/NPPESCrawlerSettings.jsx';
import OrganizationDetail from './pages/OrganizationDetail.jsx';
import Organizations from './pages/Organizations.jsx';
import ProjectManagement from './pages/ProjectManagement.jsx';
import ProviderDetail from './pages/ProviderDetail.jsx';
import ProviderLocationMatching from './pages/ProviderLocationMatching.jsx';
import ProviderOutreach from './pages/ProviderOutreach.jsx';
import Providers from './pages/Providers.jsx';
import ReconciliationDashboard from './pages/ReconciliationDashboard.jsx';
import ReferralNetworkIntelligence from './pages/ReferralNetworkIntelligence.jsx';
import ReferralPathwayAnalysis from './pages/ReferralPathwayAnalysis.jsx';
import ScoringRules from './pages/ScoringRules.jsx';
import SecurityAudit from './pages/SecurityAudit.jsx';
import TerritoryIntelligence from './pages/TerritoryIntelligence.jsx';
import Utilization from './pages/Utilization.jsx';
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
    "SecurityAudit": SecurityAudit,
    "TerritoryIntelligence": TerritoryIntelligence,
    "Utilization": Utilization,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};