import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import sgMail from "@sendgrid/mail";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { CLAUDE_MODELS } from "../lib/aiModels";

// Only models the app actually uses may be requested. Prevents a caller from
// forcing the most expensive model or an arbitrary/invalid one.
const ALLOWED_MODELS = new Set<string>(Object.values(CLAUDE_MODELS));
const MAX_OUTPUT_TOKENS = 8192;
const MAX_PROMPT_CHARS = 200_000;

// Uploads are served back statically, so anything script-executable in a browser
// (html/svg/js) is an XSS-hosting vector. Restrict to data/document/image types.
const ALLOWED_UPLOAD_EXTS = new Set([
  ".csv", ".tsv", ".txt", ".json", ".xml",
  ".xls", ".xlsx", ".zip", ".gz", ".pdf",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_UPLOAD_EXTS.has(ext)) return cb(null, true);
    cb(new Error(`File type ${ext || "(none)"} is not allowed`));
  },
});

const router = Router();

router.post("/ai/invoke", authMiddleware, rateLimit("ai_invoke", 60, 60_000), async (req: AuthRequest, res: Response) => {
  try {
    const { prompt, response_json_schema, model, max_tokens } = req.body;
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ message: "prompt is required" });
    if (prompt.length > MAX_PROMPT_CHARS) {
      return res.status(400).json({ message: `prompt exceeds maximum length of ${MAX_PROMPT_CHARS} characters` });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "ANTHROPIC_API_KEY not configured" });

    // Reject unknown models rather than silently passing them to the API.
    const resolvedModel = model && ALLOWED_MODELS.has(model) ? model : CLAUDE_MODELS.SONNET;
    const resolvedMaxTokens = Math.min(
      Math.max(Number(max_tokens) || 4096, 1),
      MAX_OUTPUT_TOKENS,
    );

    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = response_json_schema
      ? `You must respond with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}. Do not include any text before or after the JSON.`
      : undefined;

    const message = await anthropic.messages.create({
      model: resolvedModel,
      max_tokens: resolvedMaxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = message.content.find((c: any) => c.type === "text");
    const text = textContent?.text || "";

    if (response_json_schema) {
      try {
        const parsed = JSON.parse(text);
        return res.json(parsed);
      } catch {
        return res.json({ raw_response: text });
      }
    }

    res.json({ response: text });
  } catch (e: any) {
    console.error("[AI Invoke Error]", e.message);
    res.status(500).json({ message: e.message });
  }
});

// Sender addresses the app is permitted to send from. Configured via
// SENDGRID_FROM_EMAIL (primary) and an optional comma-separated ALLOWED_FROM_EMAILS.
// A caller-supplied `from` is honoured only if it is on this list — otherwise we
// fall back to the configured default. This stops the endpoint being used as an
// open spoofing/spam relay through the app's SendGrid account.
function allowedFromAddresses(): string[] {
  const list = [
    process.env.SENDGRID_FROM_EMAIL,
    ...(process.env.ALLOWED_FROM_EMAILS || "").split(","),
  ]
    .map((s) => (s || "").trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : ["noreply@caremetric.com"];
}

function resolveFrom(requested?: string): string {
  const allowed = allowedFromAddresses();
  if (requested && allowed.includes(requested.trim().toLowerCase())) return requested.trim();
  return allowed[0];
}

router.post("/email/send", authMiddleware, rateLimit("email_send", 100, 60_000), async (req: AuthRequest, res: Response) => {
  try {
    const { to, from, subject, body, html } = req.body;
    if (!to || !subject) return res.status(400).json({ message: "to and subject are required" });

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "SENDGRID_API_KEY not configured" });

    sgMail.setApiKey(apiKey);

    const msg = {
      to,
      from: resolveFrom(from),
      subject,
      text: body || "",
      html: html || body || "",
    };

    await sgMail.send(msg);
    res.json({ success: true, message: "Email sent" });
  } catch (e: any) {
    console.error("[Email Send Error]", e.message);
    res.status(500).json({ message: e.message });
  }
});

const uploadSingle = upload.single("file");

router.post("/file/upload", authMiddleware, (req: AuthRequest, res: Response) => {
  uploadSingle(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ message: err.message || "File upload failed" });
    }
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const fileUrl = `/api/storage/${req.file.filename}`;
      res.json({
        url: fileUrl,
        file_url: fileUrl,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
});

export default router;
