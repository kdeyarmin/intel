import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const ENTITY_MAP = {
  'nursing_home_providers': 'NursingHomeProvider',
  'nursing_home_deficiencies': 'NursingHomeDeficiency',
  'home_health_national_measures': 'HomeHealthNationalMeasure',
  'hospice_provider_measures': 'HospiceProviderMeasure',
  'hospice_state_measures': 'HospiceStateMeasure',
  'hospice_national_measures': 'HospiceNationalMeasure',
  'snf_provider_measures': 'SNFProviderMeasure',
  'medical_equipment_suppliers': 'MedicalEquipmentSupplier',
  'opt_out_physicians': 'OptOutPhysician',
  'medicare_hha_stats': 'MedicareHHAStats',
  'medicare_ma_inpatient': 'MedicareMAInpatient',
  'medicare_part_d_stats': 'MedicarePartDStats',
  'medicare_snf_stats': 'MedicareSNFStats',
  'cms_utilization': 'ProviderServiceUtilization',
  'provider_service_utilization': 'ProviderServiceUtilization',
  'cms_order_referring': 'CMSReferral',
  'home_health_enrollments': 'HomeHealthEnrollment',
  'hospice_enrollments': 'HospiceEnrollment',
  'nppes_registry': 'Provider',
  'nppes_monthly': 'Provider',
  'nursing_home_chains': 'NursingHomeChain',
  'home_health_cost_reports': 'HomeHealthCostReport',
  'home_health_pdgm': 'HomeHealthPDGM',
  'inpatient_drg': 'InpatientDRG',
  'provider_ownership': 'ProviderOwnership',
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let batch_id;
        try {
            const body = await req.json();
            batch_id = body.batch_id;
        } catch(e) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 });
        }
        
        if (!batch_id) {
            return Response.json({ error: 'batch_id is required' }, { status: 400 });
        }

        const batch = await base44.asServiceRole.entities.ImportBatch.get(batch_id);
        if (!batch) {
            return Response.json({ error: 'Batch not found' }, { status: 404 });
        }

        const entityName = ENTITY_MAP[batch.import_type];
        if (!entityName) {
            return Response.json({ error: `Unsupported import type for analysis: ${batch.import_type}` }, { status: 400 });
        }

        // Fetch sample records (most recent 20)
        const sampleRecords = await base44.asServiceRole.entities[entityName].filter({}, '-created_date', 20);

        if (!sampleRecords || sampleRecords.length === 0) {
            return Response.json({ error: 'No data found to analyze in this entity' }, { status: 400 });
        }

        const prompt = `
        You are a top-tier healthcare data analyst.
        Analyze the following sample dataset from a recent CMS data import (Import Type: ${batch.import_type}).
        
        Tasks:
        1. Suggest potential data quality issues (e.g., missing values, formatting inconsistencies).
        2. Identify trends or anomalies in the data.
        3. Provide a high-level summary of key metrics for this dataset.
        
        Sample Data (up to 20 records):
        ${JSON.stringify(sampleRecords, null, 2)}
        `;

        const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: {
                type: "object",
                properties: {
                    quality_issues: { type: "array", items: { type: "string" } },
                    trends_anomalies: { type: "array", items: { type: "string" } },
                    key_metrics_summary: { type: "string" },
                    overall_assessment: { type: "string" }
                }
            }
        });

        // Save analysis to batch
        await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
            ai_analysis: response
        });

        return Response.json({ success: true, analysis: response });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});