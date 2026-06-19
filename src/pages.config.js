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
import React, { lazy } from 'react';
import __Layout from './Layout.jsx';

const pageLoaders = {
    AIAssistant: () => import('./pages/AIAssistant.jsx'),
    APIConnectors: () => import('./pages/APIConnectors.jsx'),
    AdminSettings: () => import('./pages/AdminSettings.jsx'),
    AdvancedAnalytics: () => import('./pages/AdvancedAnalytics.jsx'),
    CMSAnalytics: () => import('./pages/CMSAnalytics.jsx'),
    CMSDataSources: () => import('./pages/CMSDataSources.jsx'),
    CountyIntelligence: () => import('./pages/CountyIntelligence.jsx'),
    CustomReports: () => import('./pages/CustomReports.jsx'),
    Dashboard: () => import('./pages/Dashboard.jsx'),
    DataCenter: () => import('./pages/DataCenter.jsx'),
    DataQuality: () => import('./pages/DataQuality.jsx'),
    CommunityHealthCenters: () => import('./pages/CommunityHealthCenters.jsx'),
    DMESuppliers: () => import('./pages/DMESuppliers.jsx'),
    DMEProviderReport: () => import('./pages/DMEProviderReport.jsx'),
    ProviderIntelligence: () => import('./pages/ProviderIntelligence.jsx'),
    FacilityDetail: () => import('./pages/FacilityDetail.jsx'),
    Help: () => import('./pages/Help.jsx'),
    HomeHealthAgencies: () => import('./pages/HomeHealthAgencies.jsx'),
    Hospices: () => import('./pages/Hospices.jsx'),
    Hospitals: () => import('./pages/Hospitals.jsx'),
    InpatientRehab: () => import('./pages/InpatientRehab.jsx'),
    ImportMonitoring: () => import('./pages/ImportMonitoring.jsx'),
    LeadListBuilder: () => import('./pages/LeadListBuilder.jsx'),
    LeadLists: () => import('./pages/LeadLists.jsx'),
    LocationDetail: () => import('./pages/LocationDetail.jsx'),
    Locations: () => import('./pages/Locations.jsx'),
    LongTermCare: () => import('./pages/LongTermCare.jsx'),
    NursingHomes: () => import('./pages/NursingHomes.jsx'),
    NPPESCrawler: () => import('./pages/NPPESCrawler.jsx'),
    NPPESCrawlerSettings: () => import('./pages/NPPESCrawlerSettings.jsx'),
    Organizations: () => import('./pages/Organizations.jsx'),
    OrganizationDetail: () => import('./pages/OrganizationDetail.jsx'),
    ProviderDetail: () => import('./pages/ProviderDetail.jsx'),
    ProviderLocationMatching: () => import('./pages/ProviderLocationMatching.jsx'),
    ProviderOutreach: () => import('./pages/ProviderOutreach.jsx'),
    Providers: () => import('./pages/Providers.jsx'),
    ReconciliationDashboard: () => import('./pages/ReconciliationDashboard.jsx'),
    ReferralNetworkIntelligence: () => import('./pages/ReferralNetworkIntelligence.jsx'),
    ScoringRules: () => import('./pages/ScoringRules.jsx'),
    SecurityAudit: () => import('./pages/SecurityAudit.jsx'),
    TerritoryIntelligence: () => import('./pages/TerritoryIntelligence.jsx'),
    Utilization: () => import('./pages/Utilization.jsx'),
};

const pageLoaderAliases = {
    // Campaigns route is unified onto the OutreachCampaign-based ProviderOutreach page.
    Campaigns: pageLoaders.ProviderOutreach,
    EmailSearchBot: pageLoaders.ProviderIntelligence,
    EnrichmentHub: pageLoaders.ProviderIntelligence,
};

export const PAGE_LOADERS = {
    AIAssistant: pageLoaders.AIAssistant,
    APIConnectors: pageLoaders.APIConnectors,
    AdminSettings: pageLoaders.AdminSettings,
    AdvancedAnalytics: pageLoaders.AdvancedAnalytics,
    CMSAnalytics: pageLoaders.CMSAnalytics,
    CMSDataSources: pageLoaders.CMSDataSources,
    Campaigns: pageLoaderAliases.Campaigns,
    CountyIntelligence: pageLoaders.CountyIntelligence,
    CustomReports: pageLoaders.CustomReports,
    Dashboard: pageLoaders.Dashboard,
    DataCenter: pageLoaders.DataCenter,
    DataQuality: pageLoaders.DataQuality,
    CommunityHealthCenters: pageLoaders.CommunityHealthCenters,
    DMESuppliers: pageLoaders.DMESuppliers,
    DMEProviderReport: pageLoaders.DMEProviderReport,
    EmailSearchBot: pageLoaderAliases.EmailSearchBot,
    EnrichmentHub: pageLoaderAliases.EnrichmentHub,
    FacilityDetail: pageLoaders.FacilityDetail,
    ProviderIntelligence: pageLoaders.ProviderIntelligence,
    Help: pageLoaders.Help,
    HomeHealthAgencies: pageLoaders.HomeHealthAgencies,
    Hospices: pageLoaders.Hospices,
    Hospitals: pageLoaders.Hospitals,
    InpatientRehab: pageLoaders.InpatientRehab,
    ImportMonitoring: pageLoaders.ImportMonitoring,
    LeadListBuilder: pageLoaders.LeadListBuilder,
    LeadLists: pageLoaders.LeadLists,
    LocationDetail: pageLoaders.LocationDetail,
    Locations: pageLoaders.Locations,
    LongTermCare: pageLoaders.LongTermCare,
    NursingHomes: pageLoaders.NursingHomes,
    NPPESCrawler: pageLoaders.NPPESCrawler,
    NPPESCrawlerSettings: pageLoaders.NPPESCrawlerSettings,
    Organizations: pageLoaders.Organizations,
    OrganizationDetail: pageLoaders.OrganizationDetail,
    ProviderDetail: pageLoaders.ProviderDetail,
    ProviderLocationMatching: pageLoaders.ProviderLocationMatching,
    ProviderOutreach: pageLoaders.ProviderOutreach,
    Providers: pageLoaders.Providers,
    ReconciliationDashboard: pageLoaders.ReconciliationDashboard,
    ReferralNetworkIntelligence: pageLoaders.ReferralNetworkIntelligence,
    ScoringRules: pageLoaders.ScoringRules,
    SecurityAudit: pageLoaders.SecurityAudit,
    TerritoryIntelligence: pageLoaders.TerritoryIntelligence,
    Utilization: pageLoaders.Utilization,
};

const lazyPage = (loader) => {
    const LazyPage = lazy(loader);
    return function LazyRoutePage(props) {
        return React.createElement(LazyPage, props);
    };
};

export const preloadPage = (pageName) => PAGE_LOADERS[pageName]?.();

export const PAGES = Object.fromEntries(
    Object.entries(PAGE_LOADERS).map(([name, loader]) => [name, lazyPage(loader)])
);

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
    preloadPage,
};
