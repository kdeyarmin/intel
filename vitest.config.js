import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Self-contained vitest config (kept separate from vite.config.js so the build
// config is untouched). Provides the '@' alias and the React plugin so component
// tests can import app components. Most tests run in the default 'node'
// environment; component tests opt into jsdom via a `// @vitest-environment jsdom`
// docblock at the top of the file.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    setupFiles: ['./tests/setup.js'],
    include: [
      'tests/CentralSupportCard.test.jsx',
      'tests/EmailValidationBadge.test.jsx',
      'tests/GlobalSearchDialog.test.jsx',
      'tests/LeadLists.test.jsx',
      'tests/MaintenanceHealthPanel.test.jsx',
      'tests/OrgAffiliatedProvidersCard.test.jsx',
      'tests/Organizations.test.jsx',
      'tests/ProviderDetail.test.jsx',
      'tests/Providers.test.jsx',
      'tests/ScoreBreakdown.test.jsx',
      'tests/ScoringRules.test.jsx',
      'tests/a11y.test.jsx',
      'tests/a11yStatic.test.ts',
      'tests/accounts.test.ts',
      'tests/acsDemographics.test.ts',
      'tests/adminCallSites.test.ts',
      'tests/adminUsers.test.ts',
      'tests/aiEmailSave.test.ts',
      'tests/aiPredictiveOutreachCard.test.jsx',
      'tests/analyzeImportedDataset.test.ts',
      'tests/apiClientAuth.test.js',
      'tests/appLayoutNav.test.ts',
      'tests/appLayoutSidebar.test.jsx',
      'tests/assistantLoop.test.ts',
      'tests/assistantModel.test.ts',
      'tests/assistantPage.test.jsx',
      'tests/assistantRoutes.test.ts',
      'tests/assistantStreamHook.test.jsx',
      'tests/assistantTools.test.ts',
      'tests/auditRecord.test.ts',
      'tests/auditSanitize.test.ts',
      'tests/authContextOutage.test.jsx',
      'tests/authRoutes.test.ts',
      'tests/authScreens.test.jsx',
      'tests/authValidation.test.ts',
      'tests/autoImportCMSData.test.ts',
      'tests/autoRetryClaim.test.ts',
      'tests/autoRetryFailedImports.test.ts',
      'tests/billingCheckout.test.ts',
      'tests/billingEventOrder.test.ts',
      'tests/billingNotices.test.ts',
      'tests/billingPage.test.jsx',
      'tests/bootIndexes.test.ts',
      'tests/bulkVerifyEmails.test.ts',
      'tests/businessLine.test.js',
      'tests/callSheets.test.ts',
      'tests/campaignBuilder.test.jsx',
      'tests/campaignOutcomes.test.ts',
      'tests/campaignPrepareScope.test.ts',
      'tests/campaignSend.test.ts',
      'tests/catalogBackoff.test.ts',
      'tests/censusGeography.test.ts'
    ],
  },
});
