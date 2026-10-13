import { describe, expect, it } from "vitest";
import { approvedEmail, duplicateSubscriptionEmail, inviteEmail, resetEmail, signupPendingEmail } from "../server/lib/accountEmails";
import { appendComplianceFooter } from "../server/functions/outreachHelpers";

const to = "user@example.org";
const base = "https://caremetricintel.com";
const link = `${base}/reset-password?token=test-token`;

describe("CareMetric Intel account emails", () => {
  it.each([
    ["pending approval", signupPendingEmail(to, { email: to, full_name: "Jane", organization: "Example Care" }, base)],
    ["approved", approvedEmail(to, base)],
    ["password reset", resetEmail(to, link)],
    ["invitation", inviteEmail(to, link, "An owner")],
    ["duplicate subscription", duplicateSubscriptionEmail(to, { id: 1, name: "Example Care" }, { kept: "sub_new", previous: "sub_old" })],
  ])("brands the %s email and attributes its operator", (_, message) => {
    expect(message.to).toBe(to);
    expect(message.fromName).toBe("CareMetric Intel");
    expect(message.subject).toContain("CareMetric Intel");
    expect(message.text).toContain("CareMetric Intel by CareMetric Healthcare Advisors");
    expect(message.text).toContain("https://caremetricintel.com/");
    expect(message.text).toContain("support@caremetricintel.com");
    expect(`${message.subject} ${message.text}`).not.toMatch(/CareMetric\s+AI|caremetric\.(ai|com)\b/);
  });

  it("preserves secure account action links and expiry guidance", () => {
    expect(approvedEmail(to, base).text).toContain(`${base}/login`);
    expect(resetEmail(to, link).text).toContain(link);
    expect(resetEmail(to, link).text).toContain("expires in 1 hour");
    expect(inviteEmail(to, link, null).text).toContain(link);
    expect(inviteEmail(to, link, null).text).toContain("expires in 7 days");
  });

  it("defaults outreach attribution to the company while honoring the sender", () => {
    const options = { physicalAddress: "123 Example Street", unsubscribeUrl: `${base}/api/public/unsubscribe?t=test` };
    const company = appendComplianceFooter({ text: "Hello", html: "<p>Hello</p>" }, options);
    expect(company.text).toContain("CareMetric Healthcare Advisors");
    expect(company.html).toContain("CareMetric Healthcare Advisors");
    expect(company.text).toContain(options.unsubscribeUrl);
    const customer = appendComplianceFooter({ text: "Hello", html: "<p>Hello</p>" }, { ...options, senderName: "Example Care" });
    expect(customer.text).toContain("Example Care is reaching out");
    expect(customer.text).not.toContain("CareMetric Healthcare Advisors is reaching out");
  });
});
