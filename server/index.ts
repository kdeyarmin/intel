import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { importBatches } from "./db/schema";
import authRoutes from "./routes/auth";
import entityRoutes from "./routes/entities";
import integrationRoutes from "./routes/integrations";
import functionRoutes from "./routes/functions";

const app = express();

// In production the SPA is served same-origin, so cross-origin requests should be
// limited to an explicit allowlist (ALLOWED_ORIGINS, comma-separated). In dev we
// reflect the request origin for convenience (Vite on a different port).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      // Same-origin / non-browser requests have no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) {
        // In production with empty allowlist, reject cross-origin requests
        return callback(new Error("Not allowed by CORS"));
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api/storage", express.static(path.resolve("uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/entities", entityRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/functions", functionRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve("dist");
  app.use(express.static(distPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = parseInt(process.env.PORT || process.env.API_PORT || "3001");
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[CareMetric API] Server running on port ${PORT}`);
  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    console.warn(`[CareMetric API] WARNING: ALLOWED_ORIGINS is not configured in production — cross-origin requests will be rejected. Set ALLOWED_ORIGINS to enable access from your frontend domain.`);
  }

  async function safeStartupQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        if (attempt === 3) {
          console.warn(`[CareMetric API] ${label} failed after 3 attempts: ${e.message}`);
          return fallback;
        }
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
    return fallback;
  }

  try {
    const { users } = await import("./db/schema");
    const bcryptLib = await import("bcryptjs");

    const adminEmail = process.env.ADMIN_EMAIL || "admin@caremetric.local";
    // No real credential is committed to source. Production requires ADMIN_PASSWORD;
    // dev falls back to a clearly non-secret placeholder that should be changed.
    const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? null : "changeme-dev-only");
    const adminFullName = process.env.ADMIN_FULL_NAME || "CareMetric Admin";

    const [existingAdmin] = await safeStartupQuery(
      () => db.select().from(users).where(eq(users.email, adminEmail)).limit(1),
      [] as any[], "check admin"
    );
    if (!existingAdmin) {
      if (!adminPassword) {
        console.warn(`[CareMetric API] No admin user exists and ADMIN_PASSWORD is not set in production — skipping admin seed. Set ADMIN_EMAIL and ADMIN_PASSWORD secrets to seed the first admin.`);
      } else {
        const hash = await bcryptLib.default.hash(adminPassword, 10);
        await safeStartupQuery(
          () => db.insert(users).values({
            email: adminEmail,
            password_hash: hash,
            role: "admin",
            full_name: adminFullName,
          }),
          undefined, "seed admin"
        );
        console.log(`[CareMetric API] Admin user seeded (${adminEmail})`);
        if (!process.env.ADMIN_PASSWORD) {
          console.warn("[CareMetric API] ADMIN_PASSWORD not set — used built-in dev default. Do not deploy without setting ADMIN_PASSWORD.");
        }
      }
    }
    const { and } = await import("drizzle-orm");

    const isCrawler = (b: any) => b.import_type === "nppes_registry" && b.file_name?.startsWith("crawler_");

    const activeBatches = await safeStartupQuery(
      () => db.select().from(importBatches).where(inArray(importBatches.status, ["processing", "validating"])),
      [] as any[], "fetch active batches"
    );

    const failedCrawlerBatches = await safeStartupQuery(
      () => db.select().from(importBatches).where(and(
        eq(importBatches.import_type, "nppes_registry"),
        eq(importBatches.status, "failed"),
      )),
      [] as any[], "fetch failed crawlers"
    );
    const resumableFailedCrawlers = failedCrawlerBatches.filter(b => isCrawler(b) && ((b as any).imported_rows > 0));
    const emptyFailedCrawlers = failedCrawlerBatches.filter(b => isCrawler(b) && !((b as any).imported_rows > 0));

    const crawlerActive = activeBatches.filter(isCrawler);
    const cmsActive = activeBatches.filter(b => !isCrawler(b));

    if (emptyFailedCrawlers.length > 0) {
      console.log(`[CareMetric API] Resetting ${emptyFailedCrawlers.length} empty failed crawler batch(es) to paused`);
      const { nppesQueueItems } = await import("./db/schema");
      for (const batch of emptyFailedCrawlers) {
        await safeStartupQuery(
          () => db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, batch.id)),
          undefined, `pause empty crawler ${batch.id}`
        );
        await safeStartupQuery(
          () => db.update(nppesQueueItems)
            .set({ status: "pending", updated_date: new Date() })
            .where(and(eq(nppesQueueItems.batch_id, batch.id), eq(nppesQueueItems.status, "failed"))),
          undefined, `reset queue ${batch.id}`
        );
      }
    }

    if (crawlerActive.length > 0 || resumableFailedCrawlers.length > 0) {
      const allCrawlerIds = [...crawlerActive, ...resumableFailedCrawlers];
      console.log(`[CareMetric API] Recovering ${allCrawlerIds.length} NPPES crawler batch(es)`);

      const { nppesQueueItems } = await import("./db/schema");
      for (const batch of crawlerActive) {
        await safeStartupQuery(
          () => db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, batch.id)),
          undefined, `pause crawler ${batch.id}`
        );
        await safeStartupQuery(
          () => db.update(nppesQueueItems)
            .set({ status: "pending", updated_date: new Date() })
            .where(and(eq(nppesQueueItems.batch_id, batch.id), inArray(nppesQueueItems.status, ["processing"]))),
          undefined, `reset processing ${batch.id}`
        );
      }

      for (const batch of resumableFailedCrawlers) {
        await safeStartupQuery(
          () => db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, batch.id)),
          undefined, `pause failed crawler ${batch.id}`
        );
        await safeStartupQuery(
          () => db.update(nppesQueueItems)
            .set({ status: "pending", updated_date: new Date() })
            .where(and(eq(nppesQueueItems.batch_id, batch.id), eq(nppesQueueItems.status, "failed"))),
          undefined, `reset failed items ${batch.id}`
        );
      }

      setTimeout(async () => {
        try {
          const { handleNppesCrawler, startCrawlerWatchdog } = await import("./functions/nppesCrawler");
          await handleNppesCrawler({ action: "batch_resume" }, { role: "admin" });
          console.log(`[CareMetric API] NPPES crawler batches resumed`);
          startCrawlerWatchdog();
        } catch (e: any) {
          console.error(`[CareMetric API] NPPES auto-resume failed:`, e.message);
        }
      }, 5000);
    }

    if (cmsActive.length > 0) {
      console.log(`[CareMetric API] Recovering ${cmsActive.length} CMS import batch(es)`);
      const { handleAutoImportCMSData } = await import("./functions/triggerImport");

      for (let i = 0; i < cmsActive.length; i++) {
        const batch = cmsActive[i] as any;
        const resumeOffset = batch.retry_params?.resume_offset || batch.total_rows || 0;
        const fileUrl = batch.retry_params?.file_url;
        const year = batch.data_year || 2024;

        if (fileUrl) {
          await db.update(importBatches).set({ updated_date: new Date() }).where(eq(importBatches.id, batch.id));
          setTimeout(() => {
            handleAutoImportCMSData({
              import_type: batch.import_type,
              file_url: fileUrl,
              year,
              batch_id: batch.id,
              dry_run: false,
              resume_offset: resumeOffset,
            }).catch((e: any) => console.error(`[CareMetric API] CMS batch ${batch.id} resume failed:`, e.message));
          }, 10000 + i * 5000);
          console.log(`  - Batch ${batch.id} (${batch.import_type}) resuming from offset ${resumeOffset} (delay ${10 + i * 5}s)`);
        } else {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: [{ row: 0, message: "No file_url stored — cannot auto-resume" }],
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch.id));
          console.log(`  - Batch ${batch.id} (${batch.import_type}) failed — no file_url for resume`);
        }
      }
    }

    if (activeBatches.length === 0 && resumableFailedCrawlers.length === 0) {
      console.log(`[CareMetric API] No imports to recover`);
    }

    try {
      const { startCrawlerWatchdog } = await import("./functions/nppesCrawler");
      startCrawlerWatchdog();
    } catch (_) {}

    try {
      const { cleanupOrphanedEmailTasks } = await import("./functions/emailSearchBot");
      await cleanupOrphanedEmailTasks();
      const { cleanupOrphanedEnrichmentTasks } = await import("./functions/stubs");
      await cleanupOrphanedEnrichmentTasks();
      const { cleanupOrphanedIntelTasks } = await import("./functions/providerIntelligenceBot");
      await cleanupOrphanedIntelTasks();
    } catch (e: any) {
      console.error(`[CareMetric API] Background task cleanup error:`, e.message);
    }

    (async () => {
      try {
        const { pool: dbPool } = await import("./db");
        const existingIdx = await dbPool.query(`
          SELECT c2.relname as indexname, i.indisvalid
          FROM pg_index i
          JOIN pg_class c ON c.oid = i.indrelid
          JOIN pg_class c2 ON c2.oid = i.indexrelid
          WHERE c.relname = 'medicare_facilities' AND c2.relname != 'medicare_facilities_pkey'
        `).catch(() => ({ rows: [] }));
        
        for (const idx of existingIdx.rows) {
          if (!idx.indisvalid) {
            console.log(`[DB Index] Dropping invalid index ${idx.indexname}`);
            const dropClient = await dbPool.connect();
            try {
              await dropClient.query("SET statement_timeout = '120000'");
              await dropClient.query(`DROP INDEX IF EXISTS ${idx.indexname}`);
              console.log(`[DB Index] Dropped ${idx.indexname}`);
            } catch (e: any) {
              console.warn(`[DB Index] Drop ${idx.indexname} failed:`, e.message?.substring(0, 80));
            } finally {
              await dropClient.query("RESET statement_timeout").catch(() => {});
              dropClient.release();
            }
          } else {
            console.log(`[DB Index] ${idx.indexname} is valid`);
          }
        }

        const indexes = [
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medfac_type_name ON medicare_facilities (facility_type, facility_name)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medfac_provider_id ON medicare_facilities (provider_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medfac_type_state ON medicare_facilities (facility_type, state)",
          // Unique backstops enforcing each table's natural key. Built CONCURRENTLY
          // and best-effort: a build FAILS (and is logged) while duplicate rows
          // still exist, so run scripts/dedupe-existing-imports.sql once first.
          // The importers use onConflictDoNothing(), so once these exist re-imports
          // and resumes become idempotent at the DB level — closing the gap the
          // capped (20k) in-app dedup lookup can leave open.
          "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_medfac_type_provider ON medicare_facilities (facility_type, provider_id) WHERE provider_id IS NOT NULL",
          "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_medfac_type_name ON medicare_facilities (facility_type, md5(lower(facility_name))) WHERE provider_id IS NULL AND facility_name IS NOT NULL",
          "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_cms_referrals_npi_year ON cms_referrals (npi, data_year)",
          "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_psu_natural ON provider_service_utilization (npi, hcpcs_code, place_of_service, data_year)",
          "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_prov_loc_natural ON provider_locations (npi, location_type, left(coalesce(zip,''),5), md5(lower(btrim(coalesce(address_1,'')))))",
          "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_prov_tax_natural ON provider_taxonomies (npi, taxonomy_code)",
        ];
        for (const ddl of indexes) {
          const idxName = ddl.match(/IF NOT EXISTS (\S+)/)?.[1] || "unknown";
          try {
            const client = await dbPool.connect();
            try {
              await client.query("SET statement_timeout = '0'");
              console.log(`[DB Index] Building ${idxName}...`);
              await client.query(ddl);
              console.log(`[DB Index] Created ${idxName}`);
            } finally {
              // Don't leave this pooled connection with statement_timeout disabled.
              await client.query("RESET statement_timeout").catch(() => {});
              client.release();
            }
          } catch (e: any) {
            if (e.message?.includes("already exists")) {
              console.log(`[DB Index] ${idxName} already exists`);
            } else {
              console.warn(`[DB Index] ${idxName} failed:`, e.message?.substring(0, 200));
            }
          }
        }
        console.log(`[DB Index] Background index creation complete`);
      } catch (e: any) {
        console.warn(`[DB Index] Background index creation failed:`, e.message?.substring(0, 100));
      }
    })();
  } catch (e: any) {
    console.error(`[CareMetric API] Startup recovery error:`, e.message);
  }
});

async function gracefulShutdown(signal: string) {
  console.log(`[CareMetric API] ${signal} received — saving in-progress import state`);
  try {
    const activeBatches = await db.select({ id: importBatches.id, import_type: importBatches.import_type })
      .from(importBatches)
      .where(inArray(importBatches.status, ["processing", "validating"]))
      .limit(20);

    for (const batch of activeBatches) {
      await db.update(importBatches).set({
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch.id));
      console.log(`  - Marked batch ${batch.id} (${batch.import_type}) for recovery`);
    }
  } catch (e: any) {
    console.error(`[CareMetric API] Shutdown save failed:`, e.message);
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
