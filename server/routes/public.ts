import { Router, Request, Response } from "express";
import { rateLimit } from "../middleware/rateLimit";
import { handleUnsubscribeToken } from "../functions/outreach";
import { escapeHtml } from "../functions/outreachHelpers";
import { sendMail, MailerNotConfiguredError } from "../lib/mailer";

// Unauthenticated endpoints: unsubscribe links in outreach emails, and the
// landing page's demo-request form.
const router = Router();

function page(title: string, message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1729;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
main{max-width:420px;background:#141d30;border:1px solid #334155;border-radius:12px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{color:#94a3b8;line-height:1.5;margin:0}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

async function unsubscribe(req: Request, res: Response) {
  const token = String(req.query.t || req.body?.t || "");
  try {
    const email = await handleUnsubscribeToken(token);
    if (!email) {
      return res.status(400).type("html").send(page("Link not recognised", "This unsubscribe link is invalid or incomplete."));
    }
    return res.type("html").send(page("You're unsubscribed", `${email} won't receive any more outreach emails from CareMetric.`));
  } catch (e: any) {
    console.error("[unsubscribe] failed:", e?.message);
    return res.status(500).type("html").send(page("Something went wrong", "Please try the link again in a few minutes."));
  }
}

// GET from the link in the email; POST for mail clients' one-click unsubscribe
// (List-Unsubscribe-Post), which sends the same URL.
router.get("/unsubscribe", rateLimit("unsubscribe", 60, 60_000), unsubscribe);
router.post("/unsubscribe", rateLimit("unsubscribe", 60, 60_000), unsubscribe);

const CARE_SETTINGS: Record<string, string> = {
  home_health: "Home health",
  hospice: "Hospice",
  snf: "Skilled nursing",
  irf: "Inpatient rehab",
  health_system: "Health system / hospital",
  marketing_agency: "Healthcare marketing / agency",
  other: "Other",
};

function field(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Landing-page demo requests are emailed to the sales inbox
// (DEMO_REQUEST_TO, default sales@caremetricintel.com).
export async function demoRequest(req: Request, res: Response) {
  const body = req.body || {};
  const fullName = field(body.fullName, 120);
  const workEmail = field(body.workEmail, 200);
  const organization = field(body.organization, 200);
  const territory = field(body.territory, 300);
  const notes = field(body.notes, 2000);
  const settingKey = field(body.businessLine, 40);
  const setting = CARE_SETTINGS[settingKey] || settingKey || "Not given";

  if (!fullName || !organization || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
    return res.status(400).json({ message: "Please enter your name, organization, and a valid work email." });
  }

  const lines: Array<[string, string]> = [
    ["Name", fullName],
    ["Work email", workEmail],
    ["Organization", organization],
    ["Care setting", setting],
    ["Territory", territory || "Not given"],
    ["Notes", notes || "None"],
  ];
  const text = lines.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html = `<h2>New CareMetric Intel demo request</h2><table>${lines
    .map(([k, v]) => `<tr><th align="left" style="padding:4px 12px 4px 0">${escapeHtml(k)}</th><td style="white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>`;

  try {
    await sendMail({
      to: process.env.DEMO_REQUEST_TO || "sales@caremetricintel.com",
      fromName: "CareMetric Intel",
      subject: `Demo request: ${organization}`,
      text,
      html,
    });
    return res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof MailerNotConfiguredError) {
      console.error("[demo-request] mailer not configured:", e.missing);
    } else {
      console.error("[demo-request] send failed:", e?.message);
    }
    return res.status(503).json({ message: "Your request could not be sent right now." });
  }
}

router.post("/demo-request", rateLimit("demo_request", 5, 10 * 60_000), demoRequest);

export default router;
