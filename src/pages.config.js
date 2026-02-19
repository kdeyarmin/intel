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
import AuditLog from './pages/AuditLog';
import Dashboard from './pages/Dashboard';
import DataImports from './pages/DataImports';
import LeadDiscoveryCopilot from './pages/LeadDiscoveryCopilot';
import LeadListBuilder from './pages/LeadListBuilder';
import LeadLists from './pages/LeadLists';
import ProviderDetail from './pages/ProviderDetail';
import Providers from './pages/Providers';
import ReferralNetworkIntelligence from './pages/ReferralNetworkIntelligence';
import ReferralPathwayAnalysis from './pages/ReferralPathwayAnalysis';
import ScoringRules from './pages/ScoringRules';
import TerritoryIntelligence from './pages/TerritoryIntelligence';
import AutoImports from './pages/AutoImports';
import ImportSchedule from './pages/ImportSchedule';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AuditLog": AuditLog,
    "Dashboard": Dashboard,
    "DataImports": DataImports,
    "LeadDiscoveryCopilot": LeadDiscoveryCopilot,
    "LeadListBuilder": LeadListBuilder,
    "LeadLists": LeadLists,
    "ProviderDetail": ProviderDetail,
    "Providers": Providers,
    "ReferralNetworkIntelligence": ReferralNetworkIntelligence,
    "ReferralPathwayAnalysis": ReferralPathwayAnalysis,
    "ScoringRules": ScoringRules,
    "TerritoryIntelligence": TerritoryIntelligence,
    "AutoImports": AutoImports,
    "ImportSchedule": ImportSchedule,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};