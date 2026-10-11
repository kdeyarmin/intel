// The license types a state licensing export is normalized to (normalizeLicenseType in
// server/functions/cmsTypedTables.ts) that count as personal care / assisted living supply.
// The county profile's licensed_homes and licensed_beds sum only these: nursing homes
// are already counted from the CMS files (snf_facilities), and adult day centers and
// types we don't recognize aren't residential care.
export const RESIDENTIAL_LICENSE_TYPES: readonly string[] = ["personal_care_home", "assisted_living", "memory_care", "domiciliary_care"];
