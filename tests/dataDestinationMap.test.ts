import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DATA_DESTINATION_MAP, destinationHref } from '../src/components/dataCenter/DataDestinationMap.jsx';
import { LEGACY_REDIRECTS } from '../src/components/layout/navConfig';

// ---------------------------------------------------------------------------
// DATA_DESTINATION_MAP – central routing configuration for import types
// ---------------------------------------------------------------------------
describe('DATA_DESTINATION_MAP', () => {
  // -----------------------------------------------------------------------
  // PR change: medicare_ma_inpatient was moved from MAInpatientDashboard to
  // Hospitals so it is co-located with the other hospital/inpatient datasets.
  // -----------------------------------------------------------------------
  describe('medicare_ma_inpatient routing change', () => {
    it('routes medicare_ma_inpatient to the hospital facilities view', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.medicare_ma_inpatient)).toBe('/Facilities?type=hospital');
    });

    it('labels medicare_ma_inpatient as Hospitals', () => {
      expect(DATA_DESTINATION_MAP.medicare_ma_inpatient.label).toBe('Hospitals');
    });

    it('does NOT route medicare_ma_inpatient to MAInpatientDashboard', () => {
      expect(DATA_DESTINATION_MAP.medicare_ma_inpatient.page).not.toBe('MAInpatientDashboard');
    });
  });

  // -----------------------------------------------------------------------
  // Regression: neighbouring hospital-related inpatient entries must still
  // point to Hospitals so nothing is inadvertently changed.
  // -----------------------------------------------------------------------
  describe('hospital-cluster routing regression', () => {
    const hospitalTypes = [
      'medicare_inpatient_by_provider',
      'medicare_outpatient_by_provider',
      'ambulatory_surgical_center',
      'hospital_general_info',
      'hospital_enrollments',
    ] as const;

    hospitalTypes.forEach(type => {
      it(`${type} maps to Hospitals`, () => {
        expect(destinationHref(DATA_DESTINATION_MAP[type])).toBe('/Facilities?type=hospital');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Core routing entries that must remain intact across refactors
  // -----------------------------------------------------------------------
  describe('core routing entries', () => {
    it('routes NPPES monthly to Providers', () => {
      expect(DATA_DESTINATION_MAP.nppes_monthly.page).toBe('Providers');
    });

    it('routes cms_utilization to Utilization', () => {
      expect(DATA_DESTINATION_MAP.cms_utilization.page).toBe('Utilization');
    });

    it('routes cms_order_referring to ReferralNetworkIntelligence', () => {
      expect(DATA_DESTINATION_MAP.cms_order_referring.page).toBe('ReferralNetworkIntelligence');
    });

    it('routes home_health_enrollments to HomeHealthAgencies', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.home_health_enrollments)).toBe('/Facilities?type=home_health');
    });

    it('routes hospice_enrollments to Hospices', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.hospice_enrollments)).toBe('/Facilities?type=hospice');
    });

    it('routes snf_provider_measures to NursingHomes', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.snf_provider_measures)).toBe('/Facilities?type=snf');
    });

    it('routes medicare_dme_by_supplier to DMESuppliers', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.medicare_dme_by_supplier)).toBe('/Facilities?type=dme');
    });

    it('routes fqhc_enrollments to CommunityHealthCenters', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.fqhc_enrollments)).toBe('/Facilities?type=community_health');
    });

    it('routes inpatient_rehab_general_info to InpatientRehab', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.inpatient_rehab_general_info)).toBe('/Facilities?type=irf');
    });

    it('routes long_term_care_general_info to LongTermCare', () => {
      expect(destinationHref(DATA_DESTINATION_MAP.long_term_care_general_info)).toBe('/Facilities?type=ltch');
    });

    it('routes medicare_fee_for_service_enrollment to CMSAnalytics', () => {
      expect(DATA_DESTINATION_MAP.medicare_fee_for_service_enrollment.page).toBe('CMSAnalytics');
    });

    it('routes provider_ownership to Organizations', () => {
      expect(DATA_DESTINATION_MAP.provider_ownership.page).toBe('Organizations');
    });
  });

  // -----------------------------------------------------------------------
  // PR change: physician_shared_patient_patterns added, routed to
  // ReferralNetworkIntelligence alongside cms_order_referring.
  // -----------------------------------------------------------------------
  describe('physician_shared_patient_patterns routing', () => {
    it('routes physician_shared_patient_patterns to ReferralNetworkIntelligence', () => {
      expect(DATA_DESTINATION_MAP.physician_shared_patient_patterns.page).toBe('ReferralNetworkIntelligence');
    });

    it('labels physician_shared_patient_patterns as Referrals', () => {
      expect(DATA_DESTINATION_MAP.physician_shared_patient_patterns.label).toBe('Referrals');
    });

    it('physician_shared_patient_patterns and cms_order_referring share the same page', () => {
      expect(DATA_DESTINATION_MAP.physician_shared_patient_patterns.page).toBe(
        DATA_DESTINATION_MAP.cms_order_referring.page,
      );
    });

    it('physician_shared_patient_patterns and cms_order_referring share the same label', () => {
      expect(DATA_DESTINATION_MAP.physician_shared_patient_patterns.label).toBe(
        DATA_DESTINATION_MAP.cms_order_referring.label,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Structure invariants: every entry must have page and label strings
  // -----------------------------------------------------------------------
  describe('structure invariants', () => {
    it('every entry has a non-empty page string', () => {
      for (const [key, val] of Object.entries(DATA_DESTINATION_MAP)) {
        expect(typeof val.page, `${key}.page`).toBe('string');
        expect(val.page.length, `${key}.page non-empty`).toBeGreaterThan(0);
      }
    });

    it('every entry links to a real page, never to an old one that only redirects', () => {
      const config = readFileSync('src/pages.config.js', 'utf8');
      for (const [key, val] of Object.entries(DATA_DESTINATION_MAP)) {
        expect(config, `${key} -> ${val.page}`).toContain(`${val.page}: pageLoaders.${val.page},`);
        expect(val.page in LEGACY_REDIRECTS, key).toBe(false);
      }
    });

    it('builds links with the view parameters', () => {
      expect(destinationHref({ page: 'Utilization' })).toBe('/Utilization');
      expect(destinationHref(DATA_DESTINATION_MAP.pa_home_health)).toBe('/Facilities?type=home_health');
    });

    it('every entry has a non-empty label string', () => {
      for (const [key, val] of Object.entries(DATA_DESTINATION_MAP)) {
        expect(typeof val.label, `${key}.label`).toBe('string');
        expect(val.label.length, `${key}.label non-empty`).toBeGreaterThan(0);
      }
    });
  });
});