import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  appendComplianceFooter,
  buildCampaignMetrics,
  buildMergeVars,
  buildUnsubscribeToken,
  classifyRecipient,
  computeOutreachScore,
  isRetryableSendError,
  renderTemplate,
  sendErrorReason,
  shouldAdvanceStatus,
  textToHtml,
  verifyUnsubscribeToken,
} from "../server/functions/outreachHelpers";
import { mapSendgridEvent, verifySendgridSignature } from "../server/lib/sendgridEvents";

describe("templates", () => {
  const vars = buildMergeVars(
    { entity_type: "Individual", first_name: "Ann", last_name: "Cardio", credential: "MD", npi: "1234567890" },
    { taxonomy_description: "Cardiovascular Disease" },
    { city: "Pittsburgh", state: "PA" },
  );

  it("builds merge fields, addressing physicians as Dr.", () => {
    expect(vars).toMatchObject({
      provider_name: "Dr. Ann Cardio",
      first_name: "Ann",
      specialty: "Cardiovascular Disease",
      location_city: "Pittsburgh",
      location_state: "PA",
    });
  });

  it("uses the organization name for organizations", () => {
    const org = buildMergeVars({ entity_type: "Organization", organization_name: "Mercy Clinic" });
    expect(org.provider_name).toBe("Mercy Clinic");
    expect(org.first_name).toBe("Mercy Clinic");
  });

  it("renders tokens with or without spaces and blanks unknown ones", () => {
    expect(renderTemplate("Hi {{first_name}} ({{ specialty }}){{unknown}}", vars)).toBe("Hi Ann (Cardiovascular Disease)");
  });

  it("escapes HTML when converting the text body", () => {
    expect(textToHtml("a < b & \"c\"\nnext")).toBe("a &lt; b &amp; &quot;c&quot;<br>next");
  });

  it("adds an unsubscribe link and postal address to both parts", () => {
    const out = appendComplianceFooter({ text: "Hello", html: "Hello" }, {
      physicalAddress: "1 Main St, Pittsburgh, PA",
      unsubscribeUrl: "https://app.example.org/api/public/unsubscribe?t=x&y=1",
    });
    expect(out.text).toContain("Unsubscribe: https://app.example.org/api/public/unsubscribe?t=x&y=1");
    expect(out.text).toContain("1 Main St, Pittsburgh, PA");
    expect(out.html).toContain('href="https://app.example.org/api/public/unsubscribe?t=x&amp;y=1"');
  });
});

describe("classifyRecipient", () => {
  it("skips missing, invalid, suppressed and duplicate addresses", () => {
    const seen = new Set<string>();
    const suppressed = new Set(["gone@clinic.org"]);
    expect(classifyRecipient({ email: null }, suppressed, seen)).toBe("no_email");
    expect(classifyRecipient({ email: "not-an-email" }, suppressed, seen)).toBe("invalid_email");
    expect(classifyRecipient({ email: "ok@clinic.org", email_validation_status: "invalid" }, suppressed, seen)).toBe("invalid_email");
    expect(classifyRecipient({ email: "Gone@Clinic.org" }, suppressed, seen)).toBe("suppressed");
    expect(classifyRecipient({ email: "dr@clinic.org" }, suppressed, seen)).toBe("ok");
    expect(classifyRecipient({ email: "DR@clinic.org " }, suppressed, seen)).toBe("duplicate");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips and normalises the address", () => {
    const token = buildUnsubscribeToken(" Dr@Clinic.org ", "secret");
    expect(verifyUnsubscribeToken(token, "secret")).toBe("dr@clinic.org");
  });

  it("rejects tampered tokens and the wrong secret", () => {
    const token = buildUnsubscribeToken("dr@clinic.org", "secret");
    const other = Buffer.from("someone@else.org").toString("base64url");
    expect(verifyUnsubscribeToken(`${other}.${token.split(".")[1]}`, "secret")).toBeNull();
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(verifyUnsubscribeToken("garbage", "secret")).toBeNull();
  });
});

describe("campaign metrics", () => {
  it("computes rates against messages actually sent", () => {
    const m = buildCampaignMetrics({
      total: 10, pending: 2, sending: 1, failed: 1, suppressed: 0,
      sent: 6, delivered: 5, opened: 3, clicked: 1, responded: 1, bounced: 1,
    });
    expect(m).toMatchObject({ total_recipients: 10, pending: 3, sent: 6, open_rate: 50, click_rate: 16.7, bounce_rate: 16.7 });
    expect(buildCampaignMetrics({ total: 0, pending: 0, sending: 0, failed: 0, suppressed: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, responded: 0, bounced: 0 }).open_rate).toBe(0);
  });

  it("never moves a message backwards", () => {
    expect(shouldAdvanceStatus("sent", "delivered")).toBe(true);
    expect(shouldAdvanceStatus("opened", "delivered")).toBe(false);
    expect(shouldAdvanceStatus("delivered", "bounced")).toBe(true);
    expect(shouldAdvanceStatus("bounced", "opened")).toBe(false);
  });
});

describe("computeOutreachScore", () => {
  const base = {
    status: "Active", email: "dr@clinic.org", emailValidationStatus: "valid", hasPhone: true,
    beneficiaries: 2000, referralPartners: 50, messagesSent: 0, opened: 0, responded: 0, bounced: 0,
    hasSpecialty: true, hasLocation: true, hasCredential: true,
  };

  it("scores a reachable, high-volume, well-connected provider near the top", () => {
    const r = computeOutreachScore(base);
    expect(r.score).toBe(95);
    expect(r.components).toEqual({ reachability: 35, volume: 25, network: 20, engagement: 5, completeness: 10 });
    expect(r.strategy).toMatch(/High priority/);
  });

  it("stays within 0–100 and rewards engagement", () => {
    const r = computeOutreachScore({ ...base, messagesSent: 2, opened: 1, responded: 1 });
    expect(r.score).toBe(100);
    expect(r.strategy).toMatch(/Warm lead/);
  });

  it("treats an opted-out address as unreachable by email", () => {
    const r = computeOutreachScore({ ...base, emailSuppressed: true });
    expect(r.components.reachability).toBe(10);
    expect(r.factors).toContain("Email has opted out of outreach");
    expect(r.strategy).toMatch(/Don't email/);
  });

  it("scores deactivated NPIs as 0", () => {
    expect(computeOutreachScore({ ...base, status: "Deactivated" }).score).toBe(0);
  });

  it("asks for contact details when there are none", () => {
    const r = computeOutreachScore({ ...base, email: null, hasPhone: false, beneficiaries: null, referralPartners: 0 });
    expect(r.components.reachability).toBe(0);
    expect(r.strategy).toMatch(/Find contact details/);
  });
});

describe("send errors", () => {
  it("retries only when SendGrid refused the whole request", () => {
    expect(isRetryableSendError({ code: 401 })).toBe(true);
    expect(isRetryableSendError({ code: 403 })).toBe(true);
    expect(isRetryableSendError({ response: { statusCode: 429 } })).toBe(true);
    expect(isRetryableSendError({ code: 400 })).toBe(false);
    expect(isRetryableSendError(new Error("socket hang up"))).toBe(false);
  });

  it("prefers SendGrid's own error message", () => {
    expect(sendErrorReason({ message: "Bad Request", response: { body: { errors: [{ message: "Invalid to address" }] } } }))
      .toBe("Invalid to address");
    expect(sendErrorReason({})).toBe("Send failed");
  });
});

describe("SendGrid event webhook", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const body = JSON.stringify([{ event: "open", message_id: "12", email: "dr@clinic.org", timestamp: 1790000000 }]);
  const timestamp = "1790000001";
  const signature = crypto.sign("sha256", Buffer.from(timestamp + body), { key: privateKey, dsaEncoding: "der" }).toString("base64");

  it("accepts a correctly signed payload", () => {
    expect(verifySendgridSignature(publicKeyB64, Buffer.from(body), signature, timestamp)).toBe(true);
  });

  it("rejects a modified body, a different timestamp or a missing signature", () => {
    expect(verifySendgridSignature(publicKeyB64, Buffer.from(body.replace("open", "click")), signature, timestamp)).toBe(false);
    expect(verifySendgridSignature(publicKeyB64, Buffer.from(body), signature, "1790000002")).toBe(false);
    expect(verifySendgridSignature(publicKeyB64, Buffer.from(body), undefined, timestamp)).toBe(false);
    expect(verifySendgridSignature("not-a-key", Buffer.from(body), signature, timestamp)).toBe(false);
  });

  it("maps events to message updates and suppressions", () => {
    expect(mapSendgridEvent({ event: "open", message_id: "12", timestamp: 1790000000 })).toMatchObject({
      messageId: 12, status: "opened", timestampColumn: "opened_at",
    });
    expect(mapSendgridEvent({ event: "bounce", message_id: "12", email: "x@y.org", reason: "550 no such user" })).toMatchObject({
      status: "bounced", suppressReason: "bounced", error: "550 no such user",
    });
    expect(mapSendgridEvent({ event: "spamreport", message_id: "12", email: "x@y.org" })).toMatchObject({ suppressReason: "spam_report", status: null });
    expect(mapSendgridEvent({ event: "processed", message_id: "12" })).toBeNull();
    expect(mapSendgridEvent({ event: "open" })).toBeNull();
  });
});
