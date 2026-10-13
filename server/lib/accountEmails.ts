// Plain-text emails about accounts. Links always use PUBLIC_APP_URL (see
// appBaseUrl in ./accounts), never the request's Host header.
import type { MailMessage } from "./mailer";

const PRODUCT = "CareMetric Healthcare Advisors";

function lines(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p) => p !== false && p != null).join("\n");
}

export function signupPendingEmail(to: string, newUser: { email: string; full_name: string | null; organization?: string | null }, base: string): MailMessage {
  const who = newUser.full_name ? `${newUser.full_name} <${newUser.email}>` : newUser.email;
  const org = newUser.organization ? ` for ${newUser.organization}` : "";
  return {
    to,
    subject: `${PRODUCT}: ${newUser.email} is waiting for approval`,
    text: lines(
      `${who} created a ${PRODUCT} account${org} and is waiting for approval.`,
      "",
      `Review it under Admin Settings → Users: ${base}/AdminSettings`,
      "",
      "If you don't recognize this person, leave the request or delete it.",
    ),
  };
}

/** To the admins who run the Stripe account: an organization completed a second checkout while it still paid for the first. */
export function duplicateSubscriptionEmail(to: string, org: { id: number; name: string }, subscriptions: { kept: string; previous: string }): MailMessage {
  // The name is whatever the customer typed at signup: one line, of a length a subject can carry.
  const name = org.name.replace(/\s+/g, " ").trim().slice(0, 80) || `organization #${org.id}`;
  return {
    to,
    subject: `${PRODUCT}: ${name} is paying for two subscriptions`,
    text: lines(
      `${name} (organization #${org.id}) completed a second Stripe checkout while its first subscription was still active, so both are billing.`,
      "",
      `Tracked now:  ${subscriptions.kept}`,
      `Earlier one:  ${subscriptions.previous} (still billing, no longer tracked here)`,
      "",
      "Nothing was cancelled or refunded: the customer paid for both. In Stripe, decide which one to keep, then cancel the other and refund or credit it.",
      "The same entry is in Security Audit (billing, duplicate_subscription).",
    ),
  };
}

export function approvedEmail(to: string, base: string): MailMessage {
  return {
    to,
    subject: `Your ${PRODUCT} account is approved`,
    text: lines(`An administrator approved your ${PRODUCT} account.`, "", `Sign in: ${base}/login`),
  };
}

export function resetEmail(to: string, link: string): MailMessage {
  return {
    to,
    subject: `Reset your ${PRODUCT} password`,
    text: lines(
      `Someone asked to reset the password for ${to}.`,
      "",
      `Choose a new password here (the link works once and expires in 1 hour):`,
      link,
      "",
      "If this wasn't you, ignore this email; your password hasn't changed.",
    ),
  };
}

export function inviteEmail(to: string, link: string, inviter: string | null): MailMessage {
  return {
    to,
    subject: `You're invited to ${PRODUCT}`,
    text: lines(
      `${inviter || "An administrator"} invited you to ${PRODUCT}.`,
      "",
      "Set your password to finish creating your account (the link expires in 7 days):",
      link,
    ),
  };
}
