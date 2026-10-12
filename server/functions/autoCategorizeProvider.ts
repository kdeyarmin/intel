// Port of base44/functions/autoCategorizeProvider/entry.ts
// Provider:create hook — categorises a newly created provider into a single
// short taxonomy/specialty string and stores it in providers.ai_category.
//
// Behavior preserved from Base44: AI integrations are PAUSED to save credits.
// The original short-circuits on its first line and returns
// `{ success: false, message: "AI integrations paused to save credits" }`
// before any LLM call. This port preserves that exactly: unless
// AI_FEATURES_ENABLED === "true", the hook logs that same message and returns
// without touching the API or the DB. The live path (gated behind the flag)
// mirrors server/functions/outreach.ts's aiStrategy: Anthropic HAIKU,
// max_tokens 200, text block extracted, try/catch with console.warn + null
// fallback.
//
// The original was a Deno.serve handler taking an event payload; ported to a
// plain async hook `(provider) => Promise<void>` for the Express route
// call-site. It never throws — all failures become console.warn so a hook
// failure can never break provider creation.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { providers } from "../db/schema";
import { CLAUDE_MODELS } from "../lib/aiModels";

const AI_ENABLED = process.env.AI_FEATURES_ENABLED === "true";
const PAUSED_MESSAGE = "AI integrations paused to save credits";

export async function autoCategorizeProvider(provider: { npi?: string; [k: string]: any }): Promise<void> {
  try {
    // Preserve the Base44 "paused" short-circuit exactly. The original
    // returns { success: false, message: "AI integrations paused to save credits" };
    // as a void hook we log the same message and return without doing anything.
    if (!AI_ENABLED) {
      console.warn(`[autoCategorizeProvider] ${PAUSED_MESSAGE}`);
      return;
    }

    if (!provider || typeof provider !== "object") {
      console.warn("[autoCategorizeProvider] No provider supplied, skipping.");
      return;
    }

    // If already categorized, skip (original: "Already categorized").
    if (provider.ai_category && String(provider.ai_category).trim() !== "") {
      return;
    }

    const category = await categorizeWithClaude(provider);
    if (!category) return;

    // Original updated by provider.id via the Base44 SDK. Fall back to npi
    // (the providers table's unique key) when id isn't available.
    if (provider.id != null) {
      await db.update(providers).set({ ai_category: category }).where(eq(providers.id, provider.id));
    } else if (provider.npi) {
      await db.update(providers).set({ ai_category: category }).where(eq(providers.npi, provider.npi));
    } else {
      console.warn("[autoCategorizeProvider] Provider has neither id nor npi; cannot persist ai_category.");
    }
  } catch (e: any) {
    console.warn("[autoCategorizeProvider] failed:", e?.message);
  }
}

/** Live path — mirrors server/functions/outreach.ts's aiStrategy pattern. */
async function categorizeWithClaude(provider: { [k: string]: any }): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[autoCategorizeProvider] ANTHROPIC_API_KEY not set, skipping.");
    return null;
  }
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Categorize this healthcare provider into a single short taxonomy or specialty string based on their data. Keep it concise (e.g. "Cardiologist", "General Hospital", "Nurse Practitioner"). Only return the category string, no quotes or extra text.\n\nData: ${JSON.stringify({
          credential: provider.credential,
          first_name: provider.first_name,
          last_name: provider.last_name,
          organization_name: provider.organization_name,
          entity_type: provider.entity_type,
        })}`,
      }],
    });
    const block = res.content.find((b: any) => b.type === "text");
    // Original normalization: trim and strip surrounding quotes.
    const text = block?.text?.trim().replace(/^"|"$/g, "") || null;
    return text;
  } catch (e: any) {
    console.warn("[autoCategorizeProvider] AI categorization failed:", e?.message);
    return null;
  }
}
