// Plain-text emails about accounts. Links always use PUBLIC_APP_URL (see
// appBaseUrl in ./accounts), never the request's Host header.
import type { MailMessage } from "./mailer";

const PRODUCT = "CareMetric AI";

function lines(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p) => p !== false && p != null).join("\n");
}

export function signupPendingEmail(to: string, newUser: { email: string; full_name: string | null }, base: string): MailMessage {
  const who = newUser.full_name ? `${newUser.full_name} <${newUser.email}>` : newUser.email;
  return {
    to,
    subject: `${PRODUCT}: ${newUser.email} is waiting for approval`,
    text: lines(
      `${who} created a ${PRODUCT} account and is waiting for approval.`,
      "",
      `Review it under Admin Settings → Users: ${base}/AdminSettings`,
      "",
      "If you don't recognize this person, leave the request or delete it.",
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
