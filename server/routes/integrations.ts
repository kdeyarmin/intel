import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import sgMail from "@sendgrid/mail";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { CLAUDE_MODELS } from "../lib/aiModels";

const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

router.post("/ai/invoke", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { prompt, response_json_schema, model, max_tokens } = req.body;
    if (!prompt) return res.status(400).json({ message: "prompt is required" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "ANTHROPIC_API_KEY not configured" });

    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = response_json_schema
      ? `You must respond with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}. Do not include any text before or after the JSON.`
      : undefined;

    const message = await anthropic.messages.create({
      model: model || CLAUDE_MODELS.SONNET,
      max_tokens: max_tokens || 4096,
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

router.post("/email/send", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { to, from, subject, body, html } = req.body;
    if (!to || !subject) return res.status(400).json({ message: "to and subject are required" });

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "SENDGRID_API_KEY not configured" });

    sgMail.setApiKey(apiKey);

    const msg = {
      to,
      from: from || process.env.SENDGRID_FROM_EMAIL || "noreply@caremetric.com",
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

router.post("/file/upload", authMiddleware, upload.single("file"), async (req: AuthRequest, res: Response) => {
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

export default router;
