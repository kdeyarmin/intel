import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

let dashboardStatsCache: { data: any; timestamp: number } | null = null;
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000;
let cmsAnalyticsCache: { data: any; timestamp: number } | null = null;
const CMS_CACHE_TTL = 10 * 60 * 1000;

router.post("/:functionName", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { functionName } = req.params;

  try {
    switch (functionName) {
      case "getDashboardStats": {
        if (dashboardStatsCache && (Date.now() - dashboardStatsCache.timestamp < DASHBOARD_CACHE_TTL)) {
          return res.json(dashboardStatsCache.data);
        }
        const { pool: dbPool } = await import("../db");

        const client = await dbPool.connect();
        try {
          await client.query("SET statement_timeout = '5s'");

          const fastCounts = await client.query(`
            SELECT
              (SELECT reltuples::bigint FROM pg_class WHERE relname = 'providers') AS providers,
              (SELECT reltuples::bigint FROM pg_class WHERE relname = 'provider_locations') AS locations,
              (SELECT reltuples::bigint FROM pg_class WHERE relname = 'cms_referrals') AS referrals,
              (SELECT reltuples::bigint FROM pg_class WHERE relname = 'provider_service_utilization') AS utilization,
              (SELECT reltuples::bigint FROM pg_class WHERE relname = 'provider_taxonomies') AS taxonomies,
              (SELECT reltuples::bigint FROM pg_class WHERE relname = 'medicare_facilities') AS facilities
          `);
          const est = fastCounts.rows[0] || {};
          const totalProviders = Number(est.providers || 0);
          const totalLocations = Number(est.locations || 0);
          const totalReferrals = Number(est.referrals || 0);
          const totalUtilization = Number(est.utilization || 0);
          const totalTaxonomies = Number(est.taxonomies || 0);
          const totalFacilities = Number(est.facilities || 0);

          const safeQ = async (text: string) => {
            try { return (await client.query(text)).rows; }
            catch (e: any) { console.warn(`[getDashboardStats] query failed: ${e.message?.substring(0, 80)}`); return []; }
          };

          const emailSample = await safeQ(`
            SELECT count(*) AS total_sample,
              count(*) FILTER (WHERE email IS NOT NULL) AS with_email,
              count(*) FILTER (WHERE email IS NULL) AS without_email,
              count(*) FILTER (WHERE email_searched_at IS NOT NULL) AS searched,
              count(*) FILTER (WHERE email_validation_status = 'valid') AS valid_email,
              count(*) FILTER (WHERE email_validation_status = 'risky') AS risky_email,
              count(*) FILTER (WHERE email_validation_status = 'invalid') AS invalid_email,
              count(*) FILTER (WHERE (first_name IS NULL OR first_name = '') AND (organization_name IS NULL OR organization_name = '')) AS needs_enrichment,
              count(*) FILTER (WHERE status = 'Deactivated') AS deactivated
            FROM (SELECT email, email_searched_at, email_validation_status, first_name, organization_name, status
              FROM providers LIMIT 2000) s
          `);
          const topStatesRows = await safeQ(`
            SELECT state, count(*) AS count
            FROM (SELECT state FROM provider_locations WHERE state IS NOT NULL LIMIT 10000) s
            GROUP BY state ORDER BY count DESC LIMIT 5
          `);
          const importRows = await safeQ(`SELECT count(*) FILTER (WHERE status IN ('processing','validating','pending')) AS active,
            count(*) FILTER (WHERE status = 'completed') AS completed,
            count(*) FILTER (WHERE status = 'failed') AS failed FROM import_batches`);
          const alertRows = await safeQ(`SELECT count(*) AS count FROM data_quality_alerts WHERE status = 'new'`);
          const scanRows = await safeQ(`SELECT * FROM data_quality_scans ORDER BY created_date DESC LIMIT 1`);
          const batchRows = await safeQ(`SELECT created_date FROM import_batches WHERE status = 'completed' ORDER BY created_date DESC LIMIT 1`);
          const phoneSample = await safeQ(`
            SELECT count(*) AS count
            FROM (SELECT phone FROM provider_locations LIMIT 2000) s
            WHERE phone IS NULL OR phone = ''
          `);
          const utilYearRows = await safeQ(`
            SELECT data_year FROM provider_service_utilization ORDER BY id DESC LIMIT 1
          `);

          const ps = emailSample[0] || {};
          const sampleSize = Number(ps.total_sample || 1);
          const scaleFactor = sampleSize > 0 ? totalProviders / sampleSize : 1;
          const scaleUp = (v: any) => Math.round(Number(v || 0) * scaleFactor);
          const withEmail = scaleUp(ps.with_email);
          const withoutEmail = scaleUp(ps.without_email);

          const topStates = topStatesRows.map((r: any) => [r.state, Number(r.count)]);

          const icRow = importRows[0] || {};
          const lastRefresh = batchRows.length > 0 ? batchRows[0].created_date : null;

          let dataQuality = null;
          if (scanRows.length > 0) {
            const scan = scanRows[0] as any;
            const summary = scan.results_summary as any;
            let score = 0;
            if (summary && typeof summary.score === "number") {
              score = summary.score;
            } else if (scan.total_records > 0) {
              score = Math.round(((scan.total_records - (scan.issues_found || 0)) / scan.total_records) * 100);
            }
            dataQuality = { score };
          }

          const phoneSampleCount = Number(phoneSample[0]?.count || 0);
          const phoneScale = totalLocations / 5000;
          const uyRow = utilYearRows[0] || {};

          const result = {
            totalProviders,
            totalLocations,
            totalReferrals,
            totalUtilization,
            totalTaxonomies,
            totalFacilities,
            emailStats: {
              withEmail,
              needsEnrichment: withoutEmail,
              searched: scaleUp(ps.searched),
              isEstimated: scaleFactor > 1.5,
              valid: scaleUp(ps.valid_email),
              risky: scaleUp(ps.risky_email),
              invalid: scaleUp(ps.invalid_email),
            },
            topStates,
            imports: {
              active: Number(icRow.active || 0),
              completed: Number(icRow.completed || 0),
              failed: Number(icRow.failed || 0),
            },
            openAlerts: Number(alertRows[0]?.count || 0),
            dataQuality,
            lastRefresh,
            proactiveInsights: {
              needsEnrichment: scaleUp(ps.needs_enrichment),
              deactivatedProviders: scaleUp(ps.deactivated),
              noPhoneLocations: Math.round(phoneSampleCount * phoneScale),
              latestUtilYear: Number(uyRow.data_year || 0),
            },
            samples: {
              providers: [],
              utilizations: [],
              referrals: [],
              locations: [],
            },
            isEstimatedCounts: scaleFactor > 1.5,
          };

          dashboardStatsCache = { data: result, timestamp: Date.now() };
          return res.json(result);
        } finally {
          try { await client.query("RESET statement_timeout"); } catch {}
          client.release();
        }
      }

      case "getDataHealthAlerts": {
        const { db } = await import("../db");
        const { leadScores, providers, providerLocations, providerTaxonomies } = await import("../db/schema");
        const { sql, eq, inArray, isNotNull, desc } = await import("drizzle-orm");

        const highScores = await db.select().from(leadScores)
          .where(sql`score >= 80`)
          .orderBy(desc(leadScores.score))
          .limit(100);

        if (highScores.length === 0) {
          return res.json({ alerts: [] });
        }

        const scoreNpis = highScores.map((s: any) => s.npi).filter(Boolean);
        const matchedProviders = scoreNpis.length > 0
          ? await db.select().from(providers).where(inArray(providers.npi, scoreNpis))
          : [];
        const matchedLocations = scoreNpis.length > 0
          ? await db.select().from(providerLocations).where(inArray(providerLocations.npi, scoreNpis))
          : [];
        const matchedTaxonomies = scoreNpis.length > 0
          ? await db.select().from(providerTaxonomies).where(inArray(providerTaxonomies.npi, scoreNpis))
          : [];

        const alerts: any[] = [];
        for (const scoreItem of highScores) {
          const npi = (scoreItem as any).npi;
          const prov = matchedProviders.find((p: any) => p.npi === npi);
          if (!prov) continue;

          const locs = matchedLocations.filter((l: any) => l.npi === npi);
          const taxs = matchedTaxonomies.filter((t: any) => t.npi === npi);

          const hasEmail = !!(prov as any).email;
          const hasPhone = locs.some((l: any) => !!l.phone) || !!(prov as any).cell_phone;
          const hasSpecialty = taxs.some((t: any) => !!t.taxonomy_description);

          const missing: string[] = [];
          if (!hasEmail) missing.push('Email');
          if (!hasPhone) missing.push('Phone');
          if (!hasSpecialty) missing.push('Specialty');

          if (missing.length > 0) {
            alerts.push({
              npi,
              name: (prov as any).entity_type === 'Individual'
                ? `${(prov as any).first_name || ''} ${(prov as any).last_name || ''}`.trim()
                : (prov as any).organization_name || npi,
              score: (scoreItem as any).score,
              missing,
            });
          }
        }

        return res.json({ alerts: alerts.sort((a, b) => b.score - a.score).slice(0, 50) });
      }

      case "getCMSAnalytics": {
        if (cmsAnalyticsCache && (Date.now() - cmsAnalyticsCache.timestamp < CMS_CACHE_TTL)) {
          return res.json(cmsAnalyticsCache.data);
        }
        const { db } = await import("../db");
        const { sql } = await import("drizzle-orm");

        const safeMvQuery = async (queryFn: () => Promise<any>, fallback: any = []) => {
          try { return await queryFn(); }
          catch (e: any) { console.warn(`[getCMSAnalytics] View query failed: ${e.message?.slice(0, 150)}`); return fallback; }
        };

        const [
          topServicesResult,
          topReferredResult,
          facilityTypesResult,
          tableEstimates,
          utilSummaryResult,
          aggregateDatasetsResult,
        ] = await Promise.all([
          safeMvQuery(() => db.execute(sql`SELECT * FROM mv_cms_util_by_type ORDER BY total_payments DESC NULLS LAST LIMIT 20`)),
          safeMvQuery(() => db.execute(sql`SELECT * FROM mv_cms_top_referrals ORDER BY referral_records DESC LIMIT 15`)),
          safeMvQuery(() => db.execute(sql`SELECT * FROM mv_cms_facility_types ORDER BY record_count DESC LIMIT 15`)),
          safeMvQuery(() => db.execute(sql`
            SELECT relname, reltuples::bigint AS est
            FROM pg_class
            WHERE relname IN ('provider_service_utilization','cms_referrals','medicare_facilities')
          `)),
          safeMvQuery(() => db.execute(sql`
            SELECT count(*) AS types,
              sum(provider_count) AS providers,
              sum(total_payments) AS total_payments,
              sum(total_services) AS total_services
            FROM mv_cms_util_by_type
          `)),
          safeMvQuery(() => db.execute(sql`
            SELECT facility_type, count(*) AS record_count, 
              count(DISTINCT state) AS state_count,
              max(data_year) AS latest_year
            FROM medicare_facilities
            WHERE facility_type IN (
              'market_saturation_county', 'market_saturation_cbsa',
              'medicare_fee_for_service_enrollment', 'medicare_monthly_enrollment',
              'nppes_registry', 'provider_taxonomy_crosswalk'
            )
            GROUP BY facility_type
          `)),
        ]);

        const topServices = ((topServicesResult as any).rows || topServicesResult) || [];
        const topReferred = ((topReferredResult as any).rows || topReferredResult) || [];
        const facilityTypes = ((facilityTypesResult as any).rows || facilityTypesResult) || [];
        const estRows = ((tableEstimates as any).rows || tableEstimates) || [];
        const estMap: any = {};
        estRows.forEach((r: any) => { estMap[r.relname] = Number(r.est || 0); });
        const utilSummary = (((utilSummaryResult as any).rows || utilSummaryResult) || [])[0] || {};
        const aggregateDatasets = ((aggregateDatasetsResult as any).rows || aggregateDatasetsResult) || [];

        const cmsResult = {
          utilization: {
            topServices: topServices.map((r: any) => ({
              service_type: r.service_type,
              provider_count: Number(r.provider_count || 0),
              total_services: Number(r.total_services || 0),
              total_payments: Number(r.total_payments || 0),
              total_beneficiaries: Number(r.total_beneficiaries || 0),
            })),
            summary: {
              unique_service_types: Number(utilSummary.types || 0),
              unique_providers: Number(utilSummary.providers || 0),
              total_payments: Number(utilSummary.total_payments || 0),
              total_services: Number(utilSummary.total_services || 0),
            },
          },
          referrals: {
            topReferred: topReferred.map((r: any) => ({
              npi: r.referred_npi,
              referral_records: Number(r.referral_records || 0),
            })),
            totalRecords: estMap.cms_referrals || 0,
          },
          facilities: {
            byType: facilityTypes.map((r: any) => ({
              type: r.facility_type,
              count: Number(r.record_count || 0),
            })),
          },
          tableCounts: {
            provider_service_utilization: estMap.provider_service_utilization || 0,
            cms_referrals: estMap.cms_referrals || 0,
            medicare_facilities: estMap.medicare_facilities || 0,
          },
          aggregateDatasets: aggregateDatasets.map((r: any) => ({
            facility_type: r.facility_type,
            record_count: Number(r.record_count || 0),
            state_count: Number(r.state_count || 0),
            latest_year: r.latest_year || null,
          })),
        };
        cmsAnalyticsCache = { data: cmsResult, timestamp: Date.now() };
        return res.json(cmsResult);
      }

      case "getReferralNetworkData": {
        const { db } = await import("../db");
        const { sql } = await import("drizzle-orm");

        let enrichedRows: any[] = [];
        try {
          const mvExists = await db.execute(sql`SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_cms_top_referrals' LIMIT 1`);
          const mvRows = (mvExists as any).rows || mvExists || [];
          if (mvRows.length > 0) {
            const enrichedResult = await db.execute(sql`
              WITH top_refs AS (
                SELECT referred_npi AS npi, referral_records
                FROM mv_cms_top_referrals
                ORDER BY referral_records DESC
                LIMIT 500
              )
              SELECT t.npi, t.referral_records,
                p.first_name, p.last_name, p.organization_name, p.entity_type,
                pl.state, pl.city,
                pt.taxonomy_description AS specialty
              FROM top_refs t
              LEFT JOIN providers p ON p.npi = t.npi
              LEFT JOIN LATERAL (
                SELECT pl2.state, pl2.city FROM provider_locations pl2 WHERE pl2.npi = t.npi LIMIT 1
              ) pl ON true
              LEFT JOIN LATERAL (
                SELECT pt2.taxonomy_description FROM provider_taxonomies pt2 WHERE pt2.npi = t.npi AND pt2.is_primary = true LIMIT 1
              ) pt ON true
            `);
            enrichedRows = ((enrichedResult as any).rows || enrichedResult) || [];
          }
        } catch (e: any) {
          console.warn(`[ReferralNetwork] Query failed: ${e.message?.slice(0, 200)}`);
        }

        if (enrichedRows.length === 0) {
          try {
            const fallbackResult = await db.execute(sql`
              SELECT p.npi, p.first_name, p.last_name, p.organization_name, p.entity_type,
                pl.state, pl.city,
                pt.taxonomy_description AS specialty,
                psu.total_services AS referral_records
              FROM provider_service_utilization psu
              JOIN providers p ON p.npi = psu.npi
              LEFT JOIN LATERAL (
                SELECT pl2.state, pl2.city FROM provider_locations pl2 WHERE pl2.npi = p.npi LIMIT 1
              ) pl ON true
              LEFT JOIN LATERAL (
                SELECT pt2.taxonomy_description FROM provider_taxonomies pt2 WHERE pt2.npi = p.npi AND pt2.is_primary = true LIMIT 1
              ) pt ON true
              WHERE psu.total_services IS NOT NULL
              ORDER BY psu.total_services DESC
              LIMIT 500
            `);
            enrichedRows = ((fallbackResult as any).rows || fallbackResult) || [];
          } catch (e2: any) {
            console.warn(`[ReferralNetwork] Fallback query failed: ${e2.message?.slice(0, 200)}`);
          }
        }

        const totalReferrals = enrichedRows.reduce((s: number, r: any) => s + Number(r.referral_records || 0), 0);

        const nodes = enrichedRows.map((r: any) => ({
          npi: r.npi,
          label: r.entity_type === 'Individual'
            ? `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.npi
            : r.organization_name || r.npi,
          entityType: r.entity_type || 'Unknown',
          state: r.state || '',
          city: r.city || '',
          specialty: r.specialty || '',
          referralCount: Number(r.referral_records || 0),
        }));

        return res.json({
          nodes,
          edges: [],
          typeBreakdown: {
            total: totalReferrals,
          },
        });
      }

      case "getTerritoryData": {
        const { db } = await import("../db");
        const { sql } = await import("drizzle-orm");
        const stateParam = req.body?.state || 'PA';
        const limitParam = Math.min(Number(req.body?.limit) || 500, 1000);

        const locResult = await db.execute(sql`
          SELECT DISTINCT ON (pl.npi) pl.npi, pl.city, pl.state, pl.zip, pl.address_1,
            p.first_name, p.last_name, p.organization_name, p.entity_type
          FROM provider_locations pl
          INNER JOIN providers p ON p.npi = pl.npi
          WHERE pl.state = ${stateParam}
          ORDER BY pl.npi, pl.id
          LIMIT ${limitParam}
        `);
        const baseRows = ((locResult as any).rows || locResult) || [];
        const npis = baseRows.map((r: any) => r.npi).filter(Boolean);

        let taxMap: Record<string, any> = {};
        let utilMap: Record<string, any> = {};
        if (npis.length > 0) {
          const npiParams = sql.join(npis.map((n: string) => sql`${n}`), sql`, `);
          const [taxResult, utilResult] = await Promise.all([
            db.execute(sql`SELECT DISTINCT ON (npi) npi, taxonomy_description, taxonomy_code FROM provider_taxonomies WHERE npi IN (${npiParams}) AND is_primary = true ORDER BY npi, id`),
            db.execute(sql`SELECT DISTINCT ON (npi) npi, total_medicare_payment_amt, total_unique_benes, total_services, data_year FROM provider_service_utilization WHERE npi IN (${npiParams}) ORDER BY npi, data_year DESC`),
          ]);
          ((taxResult as any).rows || taxResult || []).forEach((r: any) => { taxMap[r.npi] = r; });
          ((utilResult as any).rows || utilResult || []).forEach((r: any) => { utilMap[r.npi] = r; });
        }

        const result = baseRows.map((r: any) => {
          const tax = taxMap[r.npi];
          const util = utilMap[r.npi];
          return { ...r, specialty: tax?.taxonomy_description, taxonomy_code: tax?.taxonomy_code, total_medicare_payment_amt: util?.total_medicare_payment_amt, total_unique_benes: util?.total_unique_benes, total_services: util?.total_services, data_year: util?.data_year };
        });
        result.sort((a: any, b: any) => (Number(b.total_unique_benes) || 0) - (Number(a.total_unique_benes) || 0));

        const rows = result;

        const statesResult = await db.execute(sql`
          SELECT state, COUNT(*)::int AS cnt
          FROM provider_locations
          WHERE state IS NOT NULL AND state != ''
          GROUP BY state
          ORDER BY cnt DESC
          LIMIT 60
        `);
        const statesList = ((statesResult as any).rows || statesResult) || [];

        return res.json({
          providers: rows.map((r: any) => ({
            npi: r.npi,
            firstName: r.first_name,
            lastName: r.last_name,
            organizationName: r.organization_name,
            entityType: r.entity_type || 'Unknown',
            city: r.city || '',
            state: r.state || '',
            zip: r.zip || '',
            address: r.address_1 || '',
            specialty: r.specialty || '',
            taxonomyCode: r.taxonomy_code || '',
            totalMedicarePayment: Number(r.total_medicare_payment_amt || 0),
            totalBeneficiaries: Number(r.total_unique_benes || 0),
            totalServices: Number(r.total_services || 0),
            dataYear: r.data_year || '',
          })),
          availableStates: statesList.map((s: any) => ({ state: s.state, count: Number(s.cnt) })),
          totalInState: rows.length,
        });
      }

      case "getDataHealthMetrics": {
        const { db } = await import("../db");
        const { providers, dataQualityAlerts, dataQualityScans } = await import("../db/schema");
        const { sql } = await import("drizzle-orm");

        const [providerCount] = await db.select({ count: sql<number>`count(*)` }).from(providers);
        const [alertCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityAlerts);
        const [scanCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityScans);

        return res.json({
          total_providers: providerCount.count,
          total_alerts: alertCount.count,
          total_scans: scanCount.count,
          data_completeness: 0,
          data_accuracy: 0,
        });
      }

      case "nppesCrawler": {
        const { handleNppesCrawler } = await import("../functions/nppesCrawler");
        const result = await handleNppesCrawler(req.body, req.user);
        if (result.error && !result.success) {
          return res.status(result.error === "Forbidden" ? 403 : 400).json(result);
        }
        return res.json(result);
      }

      case "triggerImport": {
        const { handleTriggerImport } = await import("../functions/triggerImport");
        try {
          const result = await handleTriggerImport(req.body, req.user);
          return res.json(result);
        } catch (e: any) {
          const status = e.status || 500;
          return res.status(status).json({
            error: e.message,
            conflict: e.conflict,
            existing_batch_id: e.existing_batch_id,
            started_at: e.started_at,
          });
        }
      }

      case "getCMSDatasetCatalog": {
        const { getCMSDatasetCatalog } = await import("../functions/triggerImport");
        return res.json(await getCMSDatasetCatalog());
      }

      case "importNPPESFlatFile": {
        const { handleImportNPPESFlatFile } = await import("../functions/importNPPESFlatFile");
        try {
          const result = await handleImportNPPESFlatFile(req.body);
          return res.json(result);
        } catch (e: any) {
          return res.status(e.status || 500).json({ error: e.message });
        }
      }

      case "validateDataQuality": {
        const { handleValidateDataQuality } = await import("../functions/stubs");
        return res.json(await handleValidateDataQuality(req.body));
      }
      case "runDataQualityScan": {
        const { handleRunDataQualityScan } = await import("../functions/stubs");
        return res.json(await handleRunDataQualityScan(req.body));
      }
      case "enrichProviderWithAI": {
        const { handleEnrichProviderWithAI } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderWithAI(req.body));
      }
      case "emailSearchBot": {
        const { handleEmailSearchBot } = await import("../functions/emailSearchBot");
        return res.json(await handleEmailSearchBot(req.body));
      }
      case "analyzeReferralPathways": {
        const { handleAnalyzeReferralPathways } = await import("../functions/stubs");
        return res.json(await handleAnalyzeReferralPathways(req.body));
      }
      case "matchProvidersToLocations": {
        const { handleMatchProvidersToLocations } = await import("../functions/stubs");
        return res.json(await handleMatchProvidersToLocations(req.body));
      }
      case "generateScheduledReport": {
        const { handleGenerateScheduledReport } = await import("../functions/stubs");
        return res.json(await handleGenerateScheduledReport(req.body));
      }
      case "testCMSUrl": {
        const { handleTestCMSUrl } = await import("../functions/stubs");
        return res.json(await handleTestCMSUrl(req.body));
      }
      case "predictImportFormat": {
        const { handlePredictImportFormat } = await import("../functions/stubs");
        return res.json(await handlePredictImportFormat(req.body));
      }
      case "testCMSApiConnector": {
        const { handleTestCMSApiConnector } = await import("../functions/stubs");
        return res.json(await handleTestCMSApiConnector(req.body));
      }
      case "enrichProviderThirdParty": {
        const { handleEnrichProviderThirdParty } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderThirdParty(req.body));
      }
      case "enrichBulkServerSide": {
        const { handleEnrichBulkServerSide } = await import("../functions/stubs");
        return res.json(await handleEnrichBulkServerSide(req.body));
      }
      case "getEnrichmentCandidateCount": {
        const { handleGetIntelCandidateCount } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleGetIntelCandidateCount());
      }
      case "proactiveScanServerSide": {
        const { handleProactiveScanServerSide } = await import("../functions/stubs");
        return res.json(await handleProactiveScanServerSide(req.body));
      }
      case "enrichmentJobStart":
      case "intelJobStart": {
        const { handleIntelJobStart } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleIntelJobStart(req.body));
      }
      case "enrichmentJobStop":
      case "intelJobStop": {
        const { handleIntelJobStop } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleIntelJobStop());
      }
      case "enrichmentJobStatus":
      case "intelJobStatus": {
        const { handleIntelJobStatus } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleIntelJobStatus());
      }
      case "getIntelCandidateCount": {
        const { handleGetIntelCandidateCount } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleGetIntelCandidateCount());
      }
      case "verifyProviderEmail": {
        const { handleVerifyProviderEmail } = await import("../functions/stubs");
        return res.json(await handleVerifyProviderEmail(req.body));
      }
      case "bulkVerifyEmails": {
        const { handleBulkVerifyEmails } = await import("../functions/stubs");
        return res.json(await handleBulkVerifyEmails(req.body));
      }
      case "enrichProviderMedicareData": {
        const { handleEnrichProviderMedicareData } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderMedicareData(req.body));
      }
      case "validateProviderNPI": {
        const { handleValidateProviderNPI } = await import("../functions/stubs");
        return res.json(await handleValidateProviderNPI(req.body));
      }
      case "enrichProviderDEAData": {
        const { handleEnrichProviderDEAData } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderDEAData(req.body));
      }
      case "cleanProviderData": {
        const { handleCleanProviderData } = await import("../functions/stubs");
        return res.json(await handleCleanProviderData(req.body));
      }
      case "analyzeProviderNetwork": {
        const { handleAnalyzeProviderNetwork } = await import("../functions/stubs");
        return res.json(await handleAnalyzeProviderNetwork(req.body));
      }
      case "reconcileProviderData": {
        const { handleReconcileProviderData } = await import("../functions/reconciliation");
        return res.json(await handleReconcileProviderData(req.body));
      }
      case "cleanupAllImports": {
        const { db } = await import("../db");
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`UPDATE import_batches SET status = 'cancelled', updated_date = NOW() WHERE status IN ('processing', 'validating', 'paused', 'failed')`);
        await db.execute(sql`DELETE FROM import_batches WHERE status = 'cancelled'`);
        await db.execute(sql`DELETE FROM nppes_queue_items`);
        const remaining = await db.execute(sql`SELECT status, count(*)::int as cnt FROM import_batches GROUP BY status ORDER BY status`);
        const rows = Array.isArray(remaining) ? remaining : (remaining as any)?.rows || [];
        return res.json({ success: true, message: "All non-completed imports and queue items deleted", remaining: rows });
      }
      case "generateHyperPersonalizedMessages": {
        const { handleGenerateHyperPersonalizedMessages } = await import("../functions/stubs");
        return res.json(await handleGenerateHyperPersonalizedMessages(req.body));
      }
      case "trackCampaignMetrics": {
        const { handleTrackCampaignMetrics } = await import("../functions/stubs");
        return res.json(await handleTrackCampaignMetrics(req.body));
      }
      case "sendCampaignMessages": {
        const { handleSendCampaignMessages } = await import("../functions/stubs");
        return res.json(await handleSendCampaignMessages(req.body));
      }
      case "calculateOutreachScore": {
        const { handleCalculateOutreachScore } = await import("../functions/stubs");
        return res.json(await handleCalculateOutreachScore(req.body));
      }
      case "analyzeImportedDataset": {
        const { handleAnalyzeImportedDataset } = await import("../functions/stubs");
        return res.json(await handleAnalyzeImportedDataset(req.body));
      }
      case "getFacilityDetail": {
        const { handleGetFacilityDetail } = await import("../functions/facilityDetail");
        return res.json(await handleGetFacilityDetail(req.body));
      }
      case "listFacilities": {
        const { handleListFacilities } = await import("../functions/facilityDetail");
        return res.json(await handleListFacilities(req.body));
      }
      case "getProviderCMSData": {
        const { handleGetProviderCMSData } = await import("../functions/facilityDetail");
        return res.json(await handleGetProviderCMSData(req.body));
      }

      case "importAgentChat": {
        const { message, history } = req.body;
        const { db } = await import("../db");
        const { importBatches } = await import("../db/schema");
        const { sql, eq, inArray, desc } = await import("drizzle-orm");

        const batchRows = await db.select({
          id: importBatches.id,
          import_type: importBatches.import_type,
          status: importBatches.status,
          imported_rows: importBatches.imported_rows,
          total_rows: importBatches.total_rows,
          error_count: importBatches.error_count,
          created_date: importBatches.created_date,
        }).from(importBatches)
          .orderBy(desc(importBatches.created_date))
          .limit(20);

        const systemPrompt = `You are the CareMetric AI Import Manager. You help monitor and troubleshoot data import jobs.

Current import batches (most recent 20):
${JSON.stringify(batchRows, null, 2)}

You can answer questions about:
- Import job status (active, completed, failed, paused)
- Error counts and failure reasons
- Import progress and row counts
- General data import troubleshooting

Be concise and helpful. Use markdown formatting for readability.`;

        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();

        const chatMessages = (history || [])
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .map((m: any) => ({ role: m.role, content: m.content }));

        if (!chatMessages.length || chatMessages[chatMessages.length - 1]?.content !== message) {
          chatMessages.push({ role: 'user' as const, content: message });
        }

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          messages: chatMessages,
        });

        const reply = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');

        return res.json({ reply });
      }

      case "getCountyIntelligence": {
        const { handleGetCountyIntelligence } = await import("../functions/countyIntelligence");
        return res.json(await handleGetCountyIntelligence(req.body));
      }

      case "getAvailableStatesCounties": {
        const { handleGetAvailableStatesCounties } = await import("../functions/countyIntelligence");
        return res.json(await handleGetAvailableStatesCounties(req.body));
      }

      case "getComprehensiveReport": {
        const { handleGetComprehensiveReport } = await import("../functions/comprehensiveReport");
        return res.json(await handleGetComprehensiveReport(req.body));
      }

      default:
        return res.status(404).json({
          message: `Function '${functionName}' not found.`,
        });
    }
  } catch (e: any) {
    const statusCode = e.status || 500;
    console.error(`[Function ${functionName} Error]`, e.message);
    res.status(statusCode).json({ message: e.message });
  }
});

export default router;
