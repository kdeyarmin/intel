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
import CMSAnalytics from './pages/CMSAnalytics.jsx';
import CMSDataSources from './pages/CMSDataSources.jsx';
<<<<<<< HEAD
import Campaigns from './pages/Campaigns.jsx';
import CountyIntelligence from './pages/CountyIntelligence.jsx';
import CustomReports from './pages/CustomReports.jsx';
=======
import CountyIntelligence from './pages/CountyIntelligence.jsx';
import CustomReports from './pages/CustomReports.jsx';
// Campaigns route is unified onto the OutreachCampaign-based ProviderOutreach page.
>>>>>>> refs/remotes/origin/main
import Dashboard from './pages/Dashboard.jsx';
import DataCenter from './pages/DataCenter.jsx';
import DataQuality from './pages/DataQuality.jsx';
import CommunityHealthCenters from './pages/CommunityHealthCenters.jsx';
import DMESuppliers from './pages/DMESuppliers.jsx';
import ProviderIntelligence from './pages/ProviderIntelligence.jsx';
import FacilityDetail from './pages/FacilityDetail.jsx';
import Help from './pages/Help.jsx';
import HomeHealthAgencies from './pages/HomeHealthAgencies.jsx';
import Hospices from './pages/Hospices.jsx';
import Hospitals from './pages/Hospitals.jsx';
import InpatientRehab from './pages/InpatientRehab.jsx';
<<<<<<< HEAD
import ImportAnalytics from './pages/ImportAnalytics.jsx';
import ImportMonitoring from './pages/ImportMonitoring.jsx';
import ImportOverview from './pages/ImportOverview.jsx';
=======
import ImportMonitoring from './pages/ImportMonitoring.jsx';
>>>>>>> refs/remotes/origin/main
import LeadListBuilder from './pages/LeadListBuilder.jsx';
import LeadLists from './pages/LeadLists.jsx';
import LocationDetail from './pages/LocationDetail.jsx';
import Locations from './pages/Locations.jsx';
import LongTermCare from './pages/LongTermCare.jsx';
<<<<<<< HEAD
import MAInpatientDashboard from './pages/MAInpatientDashboard.jsx';
import NursingHomes from './pages/NursingHomes.jsx';
import NPPESCrawler from './pages/NPPESCrawler.jsx';
import NPPESCrawlerDashboard from './pages/NPPESCrawlerDashboard.jsx';
import NPPESCrawlerSettings from './pages/NPPESCrawlerSettings.jsx';
import OrganizationDetail from './pages/OrganizationDetail.jsx';
=======
import NursingHomes from './pages/NursingHomes.jsx';
import NPPESCrawler from './pages/NPPESCrawler.jsx';
import NPPESCrawlerSettings from './pages/NPPESCrawlerSettings.jsx';
>>>>>>> refs/remotes/origin/main
import Organizations from './pages/Organizations.jsx';
import ProviderDetail from './pages/ProviderDetail.jsx';
import ProviderLocationMatching from './pages/ProviderLocationMatching.jsx';
import ProviderOutreach from './pages/ProviderOutreach.jsx';
import Providers from './pages/Providers.jsx';
import ReconciliationDashboard from './pages/ReconciliationDashboard.jsx';
import ReferralNetworkIntelligence from './pages/ReferralNetworkIntelligence.jsx';
<<<<<<< HEAD
import ReferralPathwayAnalysis from './pages/ReferralPathwayAnalysis.jsx';
=======
>>>>>>> refs/remotes/origin/main
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
    "CMSAnalytics": CMSAnalytics,
    "CMSDataSources": CMSDataSources,
<<<<<<< HEAD
    "Campaigns": Campaigns,
=======
    "Campaigns": ProviderOutreach,
>>>>>>> refs/remotes/origin/main
    "CountyIntelligence": CountyIntelligence,
    "CustomReports": CustomReports,
    "Dashboard": Dashboard,
    "DataCenter": DataCenter,
    "DataQuality": DataQuality,
    "CommunityHealthCenters": CommunityHealthCenters,
    "DMESuppliers": DMESuppliers,
    "EmailSearchBot": ProviderIntelligence,
    "EnrichmentHub": ProviderIntelligence,
    "FacilityDetail": FacilityDetail,
    "ProviderIntelligence": ProviderIntelligence,
    "Help": Help,
    "HomeHealthAgencies": HomeHealthAgencies,
    "Hospices": Hospices,
    "Hospitals": Hospitals,
    "InpatientRehab": InpatientRehab,
<<<<<<< HEAD
    "ImportAnalytics": ImportAnalytics,
    "ImportMonitoring": ImportMonitoring,
    "ImportOverview": ImportOverview,
=======
    "ImportMonitoring": ImportMonitoring,
>>>>>>> refs/remotes/origin/main
    "LeadListBuilder": LeadListBuilder,
    "LeadLists": LeadLists,
    "LocationDetail": LocationDetail,
    "Locations": Locations,
    "LongTermCare": LongTermCare,
<<<<<<< HEAD
    "MAInpatientDashboard": MAInpatientDashboard,
    "NursingHomes": NursingHomes,
    "NPPESCrawler": NPPESCrawler,
    "NPPESCrawlerDashboard": NPPESCrawlerDashboard,
    "NPPESCrawlerSettings": NPPESCrawlerSettings,
    "OrganizationDetail": OrganizationDetail,
=======
    "NursingHomes": NursingHomes,
    "NPPESCrawler": NPPESCrawler,
    "NPPESCrawlerSettings": NPPESCrawlerSettings,
>>>>>>> refs/remotes/origin/main
    "Organizations": Organizations,
    "ProviderDetail": ProviderDetail,
    "ProviderLocationMatching": ProviderLocationMatching,
    "ProviderOutreach": ProviderOutreach,
    "Providers": Providers,
    "ReconciliationDashboard": ReconciliationDashboard,
    "ReferralNetworkIntelligence": ReferralNetworkIntelligence,
<<<<<<< HEAD
    "ReferralPathwayAnalysis": ReferralPathwayAnalysis,
=======
>>>>>>> refs/remotes/origin/main
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