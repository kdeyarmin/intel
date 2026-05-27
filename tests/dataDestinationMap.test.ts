import { describe, it, expect } from 'vitest';
import { DATA_DESTINATION_MAP } from '../src/components/dataCenter/DataDestinationMap.jsx';

// ---------------------------------------------------------------------------
// DATA_DESTINATION_MAP – central routing configuration for import types
// ---------------------------------------------------------------------------
describe('DATA_DESTINATION_MAP', () => {
  // -----------------------------------------------------------------------
  // PR change: medicare_ma_inpatient was moved from MAInpatientDashboard to
  // Hospitals so it is co-located with the other hospital/inpatient datasets.
  // -----------------------------------------------------------------------
  describe('medicare_ma_inpatient routing change', () => {
    it('routes medicare_ma_inpatient to Hospitals page', () => {
      expect(DATA_DESTINATION_MAP.medicare_ma_inpatient.page).toBe('Hospitals');
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
        expect(DATA_DESTINATION_MAP[type]?.page).toBe('Hospitals');
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
      expect(DATA_DESTINATION_MAP.home_health_enrollments.page).toBe('HomeHealthAgencies');
    });

    it('routes hospice_enrollments to Hospices', () => {
      expect(DATA_DESTINATION_MAP.hospice_enrollments.page).toBe('Hospices');
    });

    it('routes snf_provider_measures to NursingHomes', () => {
      expect(DATA_DESTINATION_MAP.snf_provider_measures.page).toBe('NursingHomes');
    });

    it('routes medicare_dme_by_supplier to DMESuppliers', () => {
      expect(DATA_DESTINATION_MAP.medicare_dme_by_supplier.page).toBe('DMESuppliers');
    });

    it('routes fqhc_enrollments to CommunityHealthCenters', () => {
      expect(DATA_DESTINATION_MAP.fqhc_enrollments.page).toBe('CommunityHealthCenters');
    });

    it('routes inpatient_rehab_general_info to InpatientRehab', () => {
      expect(DATA_DESTINATION_MAP.inpatient_rehab_general_info.page).toBe('InpatientRehab');
    });

    it('routes long_term_care_general_info to LongTermCare', () => {
      expect(DATA_DESTINATION_MAP.long_term_care_general_info.page).toBe('LongTermCare');
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

    it('every entry has a non-empty label string', () => {
      for (const [key, val] of Object.entries(DATA_DESTINATION_MAP)) {
        expect(typeof val.label, `${key}.label`).toBe('string');
        expect(val.label.length, `${key}.label non-empty`).toBeGreaterThan(0);
      }
    });
  });
});