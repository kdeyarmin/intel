// Ready-made report math. Every figure is a published county count or a
// ratio of two of them. Nothing here is a weighted "opportunity score."

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export const GROWTH_SETTINGS = {
  hha: {
    key: 'hha',
    label: 'Home health',
    noun: 'agencies',
    one: 'agency',
    users: 'hha_users',
    usersPct: 'hha_users_pct',
    billing: 'hha_providers',
    located: 'hha_agencies',
    spend: 'std_per_capita_hha',
    usersChange: 'hha_users_change_pct',
    billingChange: 'hha_providers_change_pct',
  },
  hospice: {
    key: 'hospice',
    label: 'Hospice',
    noun: 'hospices',
    one: 'hospice',
    users: 'hospice_users',
    usersPct: 'hospice_users_pct',
    billing: 'hospice_providers',
    located: 'hospice_agencies',
    spend: 'std_per_capita_hospice',
    usersChange: 'hospice_users_change_pct',
    billingChange: 'hospice_providers_change_pct',
  },
  snf: {
    key: 'snf',
    label: 'Skilled nursing',
    noun: 'facilities',
    one: 'facility',
    users: 'snf_users',
    usersPct: 'snf_users_pct',
    billing: 'snf_providers',
    located: 'snf_facilities',
    spend: 'std_per_capita_snf',
    usersChange: 'snf_users_change_pct',
    billingChange: 'snf_providers_change_pct',
  },
};

export function median(values) {
  const xs = values.filter((n) => n != null).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** One row per county for a setting. `demandOutpacedSupply` is users up and billing providers not up. */
export function countyGrowthRows(counties, settingKey) {
  const s = GROWTH_SETTINGS[settingKey];
  if (!s) return [];
  return (counties || []).map((c) => {
    const v = c.values || {};
    const vol = c.volume || {};
    const users = num(vol[s.users]);
    const billing = num(v[s.billing]);
    const usersChange = num(vol[s.usersChange]);
    const billingChange = num(vol[s.billingChange]);
    return {
      fips: c.fips,
      name: c.name,
      benes: num(v.benes),
      ma: num(v.ma_penetration),
      users,
      usersPct: num(v[s.usersPct]),
      billing,
      located: num(v[s.located]),
      spend: num(v[s.spend]),
      usersChange,
      billingChange,
      usersPerProvider: users != null && billing != null && billing > 0 ? users / billing : null,
      alone: num(v.living_alone_65_plus),
      age85: num(v.benes_85_plus),
      demandOutpacedSupply: usersChange != null && usersChange > 0 && billingChange != null && billingChange <= 0,
    };
  });
}

function byUsers(a, b) {
  if (a.users == null && b.users == null) return String(a.name).localeCompare(String(b.name));
  if (a.users == null) return 1;
  if (b.users == null) return -1;
  return b.users - a.users || String(a.name).localeCompare(String(b.name));
}

/**
 * Facts for the "where to grow" lead. Busiest provider is the most users per
 * billing provider among counties at or above the median user count, so a
 * county with a handful of users and one provider does not win that line.
 */
export function growthFacts(rows) {
  const withUsers = rows.filter((r) => r.users != null);
  const ranked = [...rows].sort(byUsers);
  const medianUsers = median(withUsers.map((r) => r.users));
  const busyPool = withUsers.filter((r) => r.usersPerProvider != null && medianUsers != null && r.users >= medianUsers);
  const busiest = busyPool.slice().sort((a, b) => b.usersPerProvider - a.usersPerProvider || b.users - a.users || String(a.name).localeCompare(String(b.name)))[0] ?? null;
  const rising = withUsers.filter((r) => r.demandOutpacedSupply).sort((a, b) => b.usersChange - a.usersChange || b.users - a.users);
  return {
    countiesWithUsers: withUsers.length,
    top: withUsers.length ? ranked[0] : null,
    medianUsers,
    busiest,
    rising,
    ranked,
  };
}

/** Named reports. Each one answers one decision for one kind of provider. */
export const REPORT_CATALOG = [
  { id: 'expand-hha', purpose: 'Expansion', audience: 'Home health', title: 'Counties with high or rising home health utilization', needs: 'state', setting: 'hha', reason: 'Identify counties with substantial home health utilization or year-over-year growth while the number of agencies with Medicare claims remained stable or declined.' },
  { id: 'expand-hospice', purpose: 'Expansion', audience: 'Hospice', title: 'Counties with high or rising hospice utilization', needs: 'state', setting: 'hospice', reason: 'Identify counties with substantial hospice utilization or year-over-year growth while the number of hospices with Medicare claims remained stable or declined.' },
  { id: 'expand-snf', purpose: 'Expansion', audience: 'Nursing homes', title: 'Counties with high or rising skilled nursing utilization', needs: 'state', setting: 'snf', reason: 'Identify counties with substantial skilled nursing utilization or year-over-year growth while the number of facilities with Medicare claims remained stable or declined.' },
  { id: 'acquire-hha', purpose: 'Acquisition', audience: 'Home health', title: 'Home health agencies by Medicare patient volume', needs: 'state', setting: 'hha', reason: 'Agencies located in the state, ranked by Medicare beneficiaries represented in their claims.' },
  { id: 'acquire-hospice', purpose: 'Acquisition', audience: 'Hospice', title: 'Hospices by Medicare patient volume', needs: 'state', setting: 'hospice', reason: 'Hospices located in the state, ranked by Medicare beneficiaries represented in their claims.' },
  { id: 'acquire-snf', purpose: 'Acquisition', audience: 'Nursing homes', title: 'Nursing homes by Medicare patient volume', needs: 'state', setting: 'snf', reason: 'Nursing homes located in the state, with Medicare volume, resident census, and payer mix.' },
  { id: 'hospital-partners', purpose: 'Hospital relationships', audience: 'Hospitals', title: 'Hospital origins and post-discharge spending by county', needs: 'county', setting: null, reason: 'Review which hospitals serve a county’s residents and how Medicare episode spending is distributed across home health, hospice, and skilled nursing.' },
  { id: 'calls-hha', purpose: 'Referral development', audience: 'Home health', title: 'Clinicians with home health certification activity', needs: 'county', setting: 'hha', reason: 'Review county-level clinicians ranked by Medicare patient panel, home health certifications, and chronic conditions. These measures do not confirm referrals.' },
  { id: 'calls-hospice', purpose: 'Referral development', audience: 'Hospice', title: 'Clinicians with hospice oversight activity', needs: 'county', setting: 'hospice', reason: 'Review county-level clinicians ranked by Medicare patient panel, hospice oversight, and chronic conditions. These measures do not confirm referrals.' },
];

/** Share held by the listed providers. `share` is a fraction of providers located in that market. */
export function leaderFacts(rows) {
  const list = rows || [];
  const shares = list.map((r) => num(r.share)).filter((n) => n != null);
  return {
    top: list[0] ?? null,
    listed: list.length,
    listedShare: shares.length ? shares.reduce((sum, n) => sum + n, 0) : null,
  };
}
