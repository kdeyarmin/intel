// Emails to the people who run the Stripe account, for the billing events that need a person.
import { sendQuietly, type AccountDeps } from "./accountDeps";
import { duplicateSubscriptionEmail } from "./accountEmails";
import type { StripeEventResult } from "./billing";

/**
 * Tells the active admins that an organization is paying for two subscriptions, so the one that keeps billing is
 * found without anyone reading the audit trail (which has the entry either way). Nothing is cancelled: which one to
 * keep, and whether to refund the other, is a decision for a person. Returns how many admins were emailed. Never
 * throws: the webhook has answered Stripe by now, and a mail problem must not look like a billing one.
 */
export async function notifyDuplicateSubscription(
  deps: Pick<AccountDeps, "repo" | "sendMail" | "mailerConfigured">,
  org: { id: number; name: string },
  duplicate: NonNullable<StripeEventResult["duplicate_subscription"]>,
): Promise<number> {
  try {
    if (!deps.mailerConfigured()) return 0;
    let sent = 0;
    for (const admin of await deps.repo.activeAdmins()) {
      if (await sendQuietly(deps, duplicateSubscriptionEmail(admin.email, org, duplicate), "Duplicate subscription notice")) sent++;
    }
    return sent;
  } catch (e: any) {
    console.warn(`[billing] couldn't email the admins about organization ${org.id}'s second subscription:`, e?.message || e);
    return 0;
  }
}
