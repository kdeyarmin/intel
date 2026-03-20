import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import authRoutes from "./routes/auth";
import entityRoutes from "./routes/entities";
import integrationRoutes from "./routes/integrations";
import functionRoutes from "./routes/functions";

const app = express();

app.use(cors({ origin: true, credentials: true }));
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

const PORT = parseInt(process.env.API_PORT || "3001");
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[CareMetric API] Server running on port ${PORT}`);

  try {
    const { db } = await import("./db");
    const { importBatches } = await import("./db/schema");
    const { eq, inArray, lt, and } = await import("drizzle-orm");

    const STALL_THRESHOLD_MS = 15 * 60 * 1000;
    const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);

    const stalled = await db.select().from(importBatches)
      .where(and(
        inArray(importBatches.status, ["processing", "validating"]),
        lt(importBatches.updated_date, cutoff),
      ));

    if (stalled.length > 0) {
      console.log(`[CareMetric API] Found ${stalled.length} stalled import(s), marking as failed`);
      for (const batch of stalled) {
        await db.update(importBatches).set({
          status: "failed",
          error_samples: [
            ...(Array.isArray((batch as any).error_samples) ? (batch as any).error_samples : []),
            { row: 0, message: "Job stalled due to inactivity — automatically marked as failed after 15 minutes with no progress" },
          ],
          updated_date: new Date(),
        }).where(eq(importBatches.id, batch.id));
        console.log(`  - Batch ${batch.id} (${batch.import_type}) marked failed: stalled since ${batch.updated_date}`);
      }
    }
  } catch (e: any) {
    console.error(`[CareMetric API] Stall detection error:`, e.message);
  }
});

export default app;
