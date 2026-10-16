import { describe, expect, it } from 'vitest';
import { attributeTouches, campaignAccountResults, roleFor, touchRoleLabel } from '../src/lib/crmAttribution';

const touches = [
  { id: 1, account_id: 10, campaign_id: 1, touched_on: '2026-01-15' },
  { id: 2, account_id: 10, campaign_id: 2, touched_on: '2026-03-01' },
  { id: 3, account_id: 10, campaign_id: 3, touched_on: '2026-06-01' },
  { id: 4, account_id: 11, campaign_id: 2, touched_on: '2026-04-01' },
];

describe('campaign attribution', () => {
  it('marks the earliest campaign first, the latest last, and the ones between influenced', () => {
    expect(roleFor(touches, 10, 1)).toBe('first');
    expect(roleFor(touches, 10, 2)).toBe('influenced');
    expect(roleFor(touches, 10, 3)).toBe('last');
    expect(roleFor(touches, 11, 2)).toBe('both');
    expect(touchRoleLabel('both')).toBe('First and last touch');
    expect(touchRoleLabel('influenced')).toBe('Influenced');
  });

  it('breaks a same-day tie by campaign id so the role is stable', () => {
    const sameDay = [
      { account_id: 1, campaign_id: 9, touched_on: '2026-05-01' },
      { account_id: 1, campaign_id: 4, touched_on: '2026-05-01' },
    ];
    const roles = attributeTouches(sameDay);
    expect(roles.get('1:4')).toBe('first');
    expect(roles.get('1:9')).toBe('last');
  });

  it('counts visits, referrals and admissions on or after the touch, and leaves earlier work out', () => {
    const rows = campaignAccountResults({
      campaignId: 2,
      touches,
      accounts: [
        { id: 10, name: 'Quiet Manor', city: 'Windber' },
        { id: 11, name: 'Acme Home Health', city: 'Erie' },
      ],
      activities: [
        { account_id: 10, kind: 'visit', done: true, activity_date: '2026-02-01' },
        { account_id: 10, kind: 'call', done: true, activity_date: '2026-03-02' },
        { account_id: 10, kind: 'visit', done: false, activity_date: '2026-03-20' },
        { account_id: 11, kind: 'visit', done: true, activity_date: '2026-04-02' },
      ],
      referrals: [
        { account_id: 10, received_on: '2026-01-20', outcome: 'admitted' },
        { account_id: 10, received_on: '2026-03-10', outcome: 'admitted' },
        { account_id: 10, received_on: '2026-05-01', outcome: 'open' },
        { account_id: 11, received_on: '2026-04-03', outcome: 'lost' },
      ],
    });

    expect(rows.map((row) => row.accountName)).toEqual(['Acme Home Health', 'Quiet Manor']);
    const quiet = rows.find((row) => row.accountName === 'Quiet Manor');
    expect(quiet).toMatchObject({ role: 'influenced', visits: 1, referrals: 2, admissions: 1, city: 'Windber' });
    const acme = rows.find((row) => row.accountName === 'Acme Home Health');
    expect(acme).toMatchObject({ role: 'both', visits: 1, referrals: 1, admissions: 0 });
  });
});
