// Which campaign touched a marketing-book account. First touch is the earliest
// link, last touch is the latest, and any campaign between them influenced
// the account. One campaign is both first and last. Visits, referrals and
// admissions count only on or after that campaign's touch date.

const ROLE_LABELS = {
  both: 'First and last touch',
  first: 'First touch',
  last: 'Last touch',
  influenced: 'Influenced',
};

export function touchRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function touchKey(accountId, campaignId) {
  return `${String(accountId)}:${String(campaignId)}`;
}

/** Map of "accountId:campaignId" to first | last | both | influenced. */
export function attributeTouches(touches) {
  const byAccount = new Map();
  for (const touch of touches || []) {
    const key = String(touch.account_id);
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(touch);
  }
  const roles = new Map();
  for (const [accountId, rows] of byAccount) {
    const sorted = rows.toSorted((a, b) => {
      const byDate = String(a.touched_on || '').localeCompare(String(b.touched_on || ''));
      if (byDate !== 0) return byDate;
      return Number(a.campaign_id) - Number(b.campaign_id);
    });
    sorted.forEach((row, index) => {
      const isFirst = index === 0;
      const isLast = index === sorted.length - 1;
      const role = isFirst && isLast ? 'both' : isFirst ? 'first' : isLast ? 'last' : 'influenced';
      roles.set(touchKey(accountId, row.campaign_id), role);
    });
  }
  return roles;
}

export function roleFor(touches, accountId, campaignId) {
  return attributeTouches(touches).get(touchKey(accountId, campaignId)) || null;
}

/**
 * Accounts a campaign touched, with work logged on or after the touch.
 * Activity before the touch stays on the account and off this campaign.
 */
export function campaignAccountResults({ campaignId, touches = [], accounts = [], activities = [], referrals = [] }) {
  const roles = attributeTouches(touches);
  const accountsById = new Map(accounts.map((account) => [String(account.id), account]));
  return touches
    .filter((touch) => String(touch.campaign_id) === String(campaignId))
    .map((touch) => {
      const since = String(touch.touched_on || '');
      const account = accountsById.get(String(touch.account_id));
      const visits = activities.filter((activity) => (
        String(activity.account_id) === String(touch.account_id)
        && activity.done
        && (activity.kind === 'visit' || activity.kind === 'call')
        && String(activity.activity_date || '') >= since
      )).length;
      const related = referrals.filter((referral) => (
        String(referral.account_id) === String(touch.account_id)
        && String(referral.received_on || '') >= since
      ));
      return {
        touchId: touch.id,
        accountId: touch.account_id,
        accountName: account?.name || 'Account',
        city: account?.city || '',
        role: roles.get(touchKey(touch.account_id, touch.campaign_id)) || 'influenced',
        touchedOn: touch.touched_on,
        visits,
        referrals: related.length,
        admissions: related.filter((referral) => referral.outcome === 'admitted').length,
      };
    })
    .toSorted((a, b) => a.accountName.localeCompare(b.accountName) || String(a.touchedOn).localeCompare(String(b.touchedOn)));
}
