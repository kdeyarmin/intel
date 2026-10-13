import { Router, Request, Response } from "express";
import { rateLimit } from "../middleware/rateLimit";
import { handleUnsubscribeToken } from "../functions/outreach";
import { escapeHtml } from "../functions/outreachHelpers";

// Unauthenticated endpoints reached from outreach emails.
const router = Router();

function page(title: string, message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | CareMetric Intel</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1729;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
main{max-width:420px;background:#141d30;border:1px solid #334155;border-radius:12px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{color:#94a3b8;line-height:1.5;margin:0}a{color:#22d3ee}footer{margin-top:24px;font-size:12px;line-height:1.8;color:#94a3b8}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><footer>CareMetric Intel by CareMetric Healthcare Advisors<br><a href="https://caremetricintel.com/">caremetricintel.com</a><br><a href="mailto:support@caremetricintel.com">support@caremetricintel.com</a></footer></main></body></html>`;
}

async function unsubscribe(req: Request, res: Response) {
  const token = String(req.query.t || req.body?.t || "");
  try {
    const email = await handleUnsubscribeToken(token);
    if (!email) {
      return res.status(400).type("html").send(page("Link not recognised", "This unsubscribe link is invalid or incomplete."));
    }
    return res.type("html").send(page("You are unsubscribed", `${email} will no longer receive outreach emails through CareMetric Intel.`));
  } catch (e: any) {
    console.error("[unsubscribe] failed:", e?.message);
    return res.status(500).type("html").send(page("Unable to complete your request", "Please try this unsubscribe link again in a few minutes. If the issue continues, contact support@caremetricintel.com."));
  }
}

// GET from the link in the email; POST for mail clients' one-click unsubscribe
// (List-Unsubscribe-Post), which sends the same URL.
router.get("/unsubscribe", rateLimit("unsubscribe", 60, 60_000), unsubscribe);
router.post("/unsubscribe", rateLimit("unsubscribe", 60, 60_000), unsubscribe);

export default router;
