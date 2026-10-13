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
      'tests/centralSupport.test.ts',
      'tests/checkCMSDataApiUrls.test.ts',
      'tests/cmsCatalog.test.ts',
      'tests/cmsTypedTables.test.ts',
      'tests/cmsUpsert.test.ts',
      'tests/comparativeAnalysisPanel.test.ts',
      'tests/corsPolicy.test.ts',
      'tests/crashRegressions.test.jsx',
      'tests/csvImportStop.test.ts',
      'tests/dashboardDataQuality.test.ts',
      'tests/dataDestinationMap.test.ts',
      'tests/dataFreshnessNotes.test.ts',
      'tests/dataFreshnessPanel.test.jsx',
      'tests/dataFreshnessSummary.test.js',
      'tests/datasetRegistryDryRun.test.ts',
      'tests/dmeReport.test.ts',
      'tests/drizzleMigrations.test.ts',
      'tests/dualWriteFacilityRows.test.ts',
      'tests/emailCheckPanels.test.jsx',
      'tests/emailValidation.test.ts',
      'tests/entitiesBuildOrderBy.test.ts',
      'tests/entityAcl.test.ts',
      'tests/entityFields.test.ts',
      'tests/entityWriteAccess.test.ts',
      'tests/errorCategories.test.ts',
      'tests/exportQuota.test.jsx',
      'tests/exportsCounted.test.ts',
      'tests/externalDataDisplay.test.jsx',
      'tests/facilityDetailQuery.test.ts',
      'tests/facilityKeyMapping.test.ts',
      'tests/facilityListPage.test.jsx',
      'tests/facilityRowMapping.test.ts',
      'tests/functionResult.test.js',
      'tests/functionsAuthGuard.test.ts',
      'tests/functionsDispatch.test.ts',
      'tests/geoCache.test.ts',
      'tests/geographyRequired.test.ts',
      'tests/globalSearchRoles.test.jsx',
      'tests/healthMetrics.test.ts',
      'tests/helpInventory.test.ts',
      'tests/helpPage.test.jsx',
      'tests/hospiceIndexNote.test.ts',
      'tests/importCompletion.test.ts',
      'tests/importMedicareHHA.test.ts',
      'tests/importMedicareMAInpatient.test.ts',
      'tests/importMedicareSNF.test.ts',
      'tests/importPins.test.ts',
      'tests/importRecovery.test.ts',
      'tests/importRowFilters.test.ts',
      'tests/importSources.test.ts',
      'tests/importUrlGuard.test.ts'
    ],
  },
});
