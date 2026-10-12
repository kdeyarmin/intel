/**
 * A second Checkout that completes for an organization that already pays leaves the earlier subscription billing
 * with nothing tracking it. The audit trail records it; the active admins are also emailed so someone looks. Nothing
 * is cancelled automatically, and a mail problem never reaches the webhook's answer to Stripe.
 */
import { describe, expect, it, vi } from "vitest";
import { duplicateSubscriptionEmail } from "../server/lib/accountEmails";
import { notifyDuplicateSubscription } from "../server/lib/billingNotices";

const org = { id: 3, name: "Acme Home Care" };
const duplicate = { kept: "sub_new", previous: "sub_old" };

function fakeDeps(opts: { admins?: string[]; configured?: boolean; failFor?: string[]; adminLookupFails?: boolean } = {}) {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const deps = {
    repo: {
      activeAdmins: vi.fn(async () => {
        if (opts.adminLookupFails) throw new Error("connection terminated");
        return (opts.admins ?? ["ops@example.test", "owner@example.test"]).map((email) => ({ email }));
      }),
    },
    mailerConfigured: () => opts.configured ?? true,
    sendMail: vi.fn(async (msg: any) => {
      if (opts.failFor?.includes(msg.to)) throw new Error("mail provider down");
      sent.push(msg);
    }),
  };
  return { deps: deps as any, sent };
}

describe("duplicateSubscriptionEmail", () => {
  it("names the organization and both subscriptions, and says nothing was cancelled", () => {
    const mail = duplicateSubscriptionEmail("ops@example.test", org, duplicate);
    expect(mail.to).toBe("ops@example.test");
    expect(mail.subject).toContain("Acme Home Care");
    expect(mail.text).toContain("sub_new");
    expect(mail.text).toContain("sub_old");
    expect(mail.text).toMatch(/organization #3/);
    expect(mail.text).toMatch(/Nothing was cancelled or refunded/);
  });

  it("keeps a multi-line or oversized organization name out of the subject", () => {
    const mail = duplicateSubscriptionEmail("ops@example.test", { id: 3, name: `Acme\r\nBcc: someone@example.test ${"x".repeat(200)}` }, duplicate);
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject.length).toBeLessThan(140);
  });
});

describe("notifyDuplicateSubscription", () => {
  it("emails each active admin once", async () => {
    const { deps, sent } = fakeDeps();
    expect(await notifyDuplicateSubscription(deps, org, duplicate)).toBe(2);
    expect(sent.map((m) => m.to)).toEqual(["ops@example.test", "owner@example.test"]);
    expect(sent.every((m) => m.text.includes("sub_old") && m.text.includes("sub_new"))).toBe(true);
  });

  it("sends nothing when mail isn't configured, and doesn't look for admins", async () => {
    const { deps, sent } = fakeDeps({ configured: false });
    expect(await notifyDuplicateSubscription(deps, org, duplicate)).toBe(0);
    expect(sent).toEqual([]);
    expect(deps.repo.activeAdmins).not.toHaveBeenCalled();
  });

  it("still tells the other admins when one address fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, sent } = fakeDeps({ failFor: ["ops@example.test"] });
    expect(await notifyDuplicateSubscription(deps, org, duplicate)).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(["owner@example.test"]);
    warn.mockRestore();
  });

  it("answers 0 rather than throwing when the admins can't be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, sent } = fakeDeps({ adminLookupFails: true });
    await expect(notifyDuplicateSubscription(deps, org, duplicate)).resolves.toBe(0);
    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization 3's second subscription/), "connection terminated");
    warn.mockRestore();
  });

  it("has no admin to tell when none is active", async () => {
    const { deps, sent } = fakeDeps({ admins: [] });
    expect(await notifyDuplicateSubscription(deps, org, duplicate)).toBe(0);
    expect(sent).toEqual([]);
  });
});
