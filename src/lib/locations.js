/**
 * The location to show for a provider: provider_locations has no "primary"
 * flag, so prefer the practice address over the mailing one.
 */
export function pickPrimaryLocation(locations, npi) {
  const list = (locations || []).filter((l) => l && (npi == null || l.npi === npi));
  return list.find((l) => l.is_primary) || list.find((l) => l.location_type === 'Practice') || list[0] || null;
}
