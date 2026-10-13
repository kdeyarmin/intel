import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMailerStatus, sendMail } from "../server/lib/mailer";

describe("MAIL_TRANSPORT=outbox", () => {
  const saved = { ...process.env };
  let dir: string;
  beforeEach(() => {
    fs.mkdirSync(".data", { recursive: true });
    dir = fs.mkdtempSync(path.resolve(".data", "outbox-"));
    process.env.MAIL_TRANSPORT = "outbox";
    process.env.MAIL_OUTBOX_PATH = path.join(dir, "nested", "mail.jsonl");
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.ALLOWED_FROM_EMAILS;
  });
  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes messages to a JSONL file instead of sending them", async () => {
    expect(getMailerStatus().configured).toBe(true);
    const { messageId } = await sendMail({ to: "a@example.com", subject: "Hi", text: "Link: https://x/reset-password?token=abc" });
    await sendMail({ to: "b@example.com", subject: "Again", text: "two", attachments: [{ filename: "r.csv", content: "a,b", type: "text/csv" }] });
    const lines = fs.readFileSync(process.env.MAIL_OUTBOX_PATH!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ messageId, to: "a@example.com", from: "noreply@caremetricintel.com", subject: "Hi" });
    expect(lines[1].attachments).toEqual([{ filename: "r.csv", type: "text/csv" }]);
  });

  it("is refused in production", async () => {
    process.env.NODE_ENV = "production";
    expect(getMailerStatus()).toEqual({ configured: false, missing: ["MAIL_TRANSPORT=outbox is development-only"] });
    await expect(sendMail({ to: "a@example.com", subject: "x", text: "y" })).rejects.toThrow(/development-only/);
  });
});
