import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();

vi.mock("../server/lib/mailer", () => {
  class MailerNotConfiguredError extends Error {
    missing: string[];
    constructor(missing: string[]) {
      super("not configured");
      this.missing = missing;
    }
  }
  return { sendMail, MailerNotConfiguredError };
});
vi.mock("../server/functions/outreach", () => ({ handleUnsubscribeToken: vi.fn() }));

const { demoRequest } = await import("../server/routes/public");

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

const valid = {
  fullName: "Jane Smith",
  workEmail: "jane@example.org",
  organization: "Example Hospice",
  businessLine: "hospice",
  territory: "Cambria County, PA",
  notes: "<b>Referral</b> growth",
};

describe("POST /api/public/demo-request", () => {
  beforeEach(() => sendMail.mockReset());

  it("emails the sales inbox with escaped HTML", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const res = mockRes();
    await demoRequest({ body: valid } as any, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe("sales@caremetricintel.com");
    expect(msg.subject).toBe("Demo request: Example Hospice");
    expect(msg.text).toContain("Care setting: Hospice");
    expect(msg.html).toContain("&lt;b&gt;Referral&lt;/b&gt;");
    expect(msg.html).not.toContain("<b>Referral</b>");
  });

  it("rejects a request without a valid work email", async () => {
    const res = mockRes();
    await demoRequest({ body: { ...valid, workEmail: "nope" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns 503 when email sending is unavailable", async () => {
    sendMail.mockRejectedValueOnce(new Error("SendGrid unavailable"));
    const res = mockRes();
    await demoRequest({ body: valid } as any, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
