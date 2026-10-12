import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtCount, fmtMoney, fmtPct } from '@/lib/marketFormat';

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? fmtMoney(v) : '—';
}

const CARDIAC = {
  cabg: 'Bypass (CABG)', pci: 'Coronary stent / PCI', tavr: 'TAVR', savr: 'Surgical aortic valve',
  mitral: 'Mitral valve', tricuspid: 'Tricuspid valve', laac: 'Left atrial appendage closure',
  ablation: 'Ablation', cardioversion: 'Cardioversion', defibrillator: 'Defibrillator', pacemaker: 'Pacemaker',
};
const CONDITION = {
  condition_diabetes: 'Diabetes hospitalizations',
  condition_sepsis: 'Sepsis hospitalizations',
  condition_c_diff: 'C. diff hospitalizations',
  condition_breast_cancer: 'Breast cancer surgeries',
  condition_opioid: 'Opioid',
  condition_maternal_opioid: 'Maternal stays involving opioids',
  condition_neonatal_abstinence: 'Neonatal abstinence',
};
const OPIOID = { overdose: 'overdose', use_disorder: 'use disorder' };

function rateLabel(row) {
  if (row.value == null || row.value === '') return null;
  const n = Number(row.value);
  if (!Number.isFinite(n)) return null;
  if (row.value_unit === 'percent') return fmtPct(n);
  if (row.value_unit === 'per_10000') return `${n.toFixed(1)} per 10,000`;
  if (row.value_unit === 'per_100000') return `${n.toFixed(1)} per 100,000`;
  if (row.value_unit === 'per_1000_stays') return `${n.toFixed(1)} per 1,000 maternal stays`;
  if (row.value_unit === 'per_1000_newborn_stays') return `${n.toFixed(1)} per 1,000 newborn stays`;
  return String(n);
}

function starText(s) {
  const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v).toFixed(1));
  if (n(s.overall_rating)) return `${n(s.overall_rating)} overall`;
  if (n(s.part_c_rating)) return `Part C ${n(s.part_c_rating)}`;
  if (n(s.part_d_rating)) return `Part D ${n(s.part_d_rating)}`;
  return null;
}

function weightedAvg(rows) {
  const usable = rows.filter((r) => r.approved_pct != null && r.market_share != null && Number(r.market_share) > 0);
  const share = usable.reduce((s, r) => s + Number(r.market_share), 0);
  if (!share) return null;
  return usable.reduce((s, r) => s + Number(r.approved_pct) * Number(r.market_share), 0) / share;
}

function conditionLabel(row) {
  const base = CONDITION[row.report] || row.report;
  if (row.report === 'condition_opioid') return `${base}, ${OPIOID[row.category] || row.category}`;
  return base;
}

/** Sections a business line actually uses. No line means the whole card. */
const LINE_SECTIONS = {
  hha: ['plans', 'places', 'shortage', 'medicaid'],
  hospice: ['plans', 'places', 'shortage', 'medicaid'],
  snf: ['plans', 'places', 'shortage', 'medicaid', 'phc4'],
  pch: ['places'],
  hospital: ['plans', 'shortage', 'phc4'],
  dme: ['drugs', 'services', 'dme'],
};

function showSection(line, id) {
  if (!line) return true;
  return (LINE_SECTIONS[line.id] || []).includes(id);
}

/** Medicare Advantage plans, chronic-condition prevalence, and the drugs a county's clinicians write. */
export function CountyReferenceCard({ reference, line = null }) {
  if (!reference) return null;
  const plans = showSection(line, 'plans') ? (reference.ma_plans || []) : [];
  const stars = showSection(line, 'plans') ? (reference.ma_stars || []) : [];
  const places = showSection(line, 'places') ? (reference.places || []) : [];
  const drugs = showSection(line, 'drugs') ? (reference.drugs || []) : [];
  const services = showSection(line, 'services') ? (reference.services || []) : [];
  const shortage = showSection(line, 'shortage') ? (reference.shortage || []) : [];
  const phc4 = showSection(line, 'phc4') ? reference.phc4 : null;
  const hasPhc4 = phc4 && (phc4.payers?.length || phc4.conditions?.length || phc4.cardiac?.length || phc4.cancer?.length);
  const medicaid = showSection(line, 'medicaid') ? (reference.medicaid || []) : [];
  const marketplace = showSection(line, 'marketplace') ? (reference.marketplace || []) : [];
  const rates = showSection(line, 'rates') ? (reference.aca_rates || []) : [];
  const mlr = showSection(line, 'mlr') ? (reference.mlr || []) : [];
  const oep = showSection(line, 'oep') ? reference.oep : null;
  const dme = showSection(line, 'dme') ? reference.dme : null;
  const hasPayers = medicaid.length || marketplace.length || rates.length || mlr.length || oep;
  if (!plans.length && !stars.length && !places.length && !drugs.length && !services.length && !shortage.length && !hasPhc4 && !hasPayers && !dme) return null;
  const show = (id) => showSection(line, id);
  return (
    <div className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {show('plans') && (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Medicare Advantage plans</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {plans.length === 0 ? <p className="text-slate-400">No plan enrollment for this county.</p> : plans.map((p) => (
            <div key={p.organization} className="flex justify-between gap-2">
              <span className="truncate text-slate-200">{p.organization}</span>
              <span className="text-slate-400 shrink-0">{fmtCount(p.enrollment)}</span>
            </div>
          ))}
          {stars.length > 0 && (
            <div className="space-y-1 pt-1">
              {stars.map((s) => (
                <div key={s.contract_id} className="flex justify-between gap-2">
                  <span className="truncate text-slate-200">{s.marketing_name || s.contract_id}{s.snp === 'yes' ? ' · SNP' : ''}</span>
                  <span className="text-slate-400 shrink-0">{starText(s)} · {fmtCount(s.enrollment)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500 pt-1">Enrollment is {reference.as_of?.ma || 'the latest month on file'}. Cells under 11 are left out by CMS, so the total is a floor. Stars are the 2027 contract ratings published October 8, 2026, for contracts with members in this county. Not a facility score.</p>
        </CardContent>
      </Card>
      )}
      {show('places') && (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Who lives here</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {places.length === 0 ? <p className="text-slate-400">CDC PLACES is not loaded for this county.</p> : places.map((p) => (
            <div key={p.measure_id} className="flex justify-between gap-2">
              <span className="truncate text-slate-200">{p.measure || p.measure_id}</span>
              <span className="text-slate-400 shrink-0">{fmtPct(p.data_value)}</span>
            </div>
          ))}
          {shortage.length > 0 && show('shortage') && (
            <p className="text-[11px] text-slate-400 pt-1">HRSA shortage: {shortage.map((s) => `${s.discipline} (${s.designation_type}) ${s.hpsa_score ?? ''}`).join(' · ')}. Geographic and population designations only, not FQHC or clinic auto-scores.</p>
          )}
        </CardContent>
      </Card>
      )}
      {!show('places') && show('shortage') && shortage.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Clinician shortage</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <p className="text-slate-400">HRSA shortage: {shortage.map((s) => `${s.discipline} (${s.designation_type}) ${s.hpsa_score ?? ''}`).join(' · ')}. Geographic and population designations only, not FQHC or clinic auto-scores.</p>
          </CardContent>
        </Card>
      )}
      {show('drugs') && (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Drugs written here</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {drugs.length === 0 ? <p className="text-slate-400">No Part D geography rows for this county.</p> : drugs.map((d) => (
            <div key={d.generic_name} className="flex justify-between gap-2">
              <span className="truncate text-slate-200">{d.generic_name}{d.opioid ? ' · opioid' : ''}</span>
              <span className="text-slate-400 shrink-0">{fmtCount(d.claims)}</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-500 pt-1">{drugs[0]?.county_fips?.length === 5 ? 'This county' : 'Statewide'}, Part D 2024. Top generics. Counts under 11 are suppressed.</p>
        </CardContent>
      </Card>
      )}
      {show('services') && (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Medicare services</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {services.length === 0 ? <p className="text-slate-400">No physician-service geography for this county.</p> : services.map((s) => (
            <div key={s.hcpcs} className="flex justify-between gap-2">
              <span className="truncate text-slate-200">{s.description || s.hcpcs}</span>
              <span className="text-slate-400 shrink-0">{fmtCount(s.services)}</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-500 pt-1">{services[0]?.county_fips?.length === 5 ? 'This county' : 'Statewide'}, 2024. Office visits, joint replacement, colonoscopy, home health certs. CMS publishes this file by state, not county.</p>
        </CardContent>
      </Card>
      )}
    </div>
    {hasPhc4 && (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Pennsylvania all-payer, PHC4</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-3">
          <p className="text-slate-300">
            {phc4.inpatient_total != null && <span>{fmtCount(phc4.inpatient_total)} inpatient stays in Q4 2025. </span>}
            {phc4.outpatient_total != null && <span>{fmtCount(phc4.outpatient_total)} outpatient surgery cases. </span>}
            {(phc4.ages || []).map((a) => <span key={a.category}>{a.category} {fmtPct(a.value)}. </span>)}
          </p>
          {phc4.payers?.length > 0 && (
            <div className="space-y-1">
              {phc4.payers.map((p) => (
                <div key={p.category} className="flex justify-between gap-2">
                  <span className="text-slate-200">{p.category}</span>
                  <span className="text-slate-400 shrink-0">{fmtPct(p.value)}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Share of this county's residents' inpatient stays, any Pennsylvania hospital. Q4 2025.</p>
            </div>
          )}
          {phc4.conditions?.length > 0 && (
            <div className="space-y-1">
              {phc4.conditions.slice(0, 8).map((c) => (
                <div key={`${c.report}-${c.category}`} className="flex justify-between gap-2">
                  <span className="truncate text-slate-200">{conditionLabel(c)}</span>
                  <span className="text-slate-400 shrink-0">{fmtCount(c.cases)}{rateLabel(c) ? ` · ${rateLabel(c)}` : ''}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Calendar 2025. County of residence. Suppressed cells are omitted. Diabetes, sepsis, and C. diff are per 10,000 residents. Breast cancer is surgeries per 10,000 women 18 and older. Opioid rates are per 100,000 people 15 and older. Maternal and newborn rates are per 1,000 stays.</p>
            </div>
          )}
          {phc4.cardiac?.length > 0 && (
            <div className="space-y-1">
              {phc4.cardiac.map((c) => (
                <div key={`${c.facility_name}-${c.procedure_code}`} className="flex justify-between gap-2">
                  <span className="truncate text-slate-200">{c.facility_name} · {CARDIAC[c.procedure_code] || c.procedure_code}{c.mortality_rating ? ` · death ${c.mortality_rating}` : ''}</span>
                  <span className="text-slate-400 shrink-0">{fmtCount(c.total_cases)}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Facility case counts, January 2023–December 2024. The name is PHC4's short name, not a Medicare ID. A death rating is only published for bypass, valves, and TAVR.</p>
            </div>
          )}
          {phc4.cancer?.length > 0 && (
            <div className="space-y-1">
              {phc4.cancer.map((c) => (
                <div key={`${c.facility_name}-${c.cancer}`} className="flex justify-between gap-2">
                  <span className="truncate text-slate-200">{c.facility_name} · {c.cancer}</span>
                  <span className="text-slate-400 shrink-0">{fmtCount(c.total_cases)}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Cancer surgeries at the facility, July 2024–June 2025. Not where the patient lived.</p>
            </div>
          )}
        </CardContent>
      </Card>
    )}
    {hasPayers && <PayerCard medicaid={medicaid} marketplace={marketplace} rates={rates} mlr={mlr} oep={oep} />}
    {dme && <DmeCountyCard dme={dme} />}
    </div>
  );
}

function PayerCard({ medicaid, marketplace, rates, mlr, oep }) {
  const medTotal = medicaid.reduce((s, r) => s + Number(r.enrollment || 0), 0);
  const individual = rates.filter((r) => r.market === 'individual');
  const small = rates.filter((r) => r.market === 'small_group');
  const indAvg = weightedAvg(individual);
  const smallAvg = weightedAvg(small);
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Payers</CardTitle></CardHeader>
      <CardContent className="text-xs space-y-3">
        {medicaid.length > 0 && (
          <div className="space-y-1">
            {medicaid.map((p) => (
              <div key={p.plan} className="flex justify-between gap-2">
                <span className="truncate text-slate-200">{p.plan}</span>
                <span className="text-slate-400 shrink-0">{fmtCount(p.enrollment)}{medTotal ? ` · ${fmtPct((Number(p.enrollment) / medTotal) * 100, 0)}` : ''}</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">HealthChoices physical-health Medicaid, August 2026. Capitation: anyone eligible at any point in the month. Not behavioral health, and not Community HealthChoices. {medicaid[0].zone} zone.</p>
          </div>
        )}
        {marketplace.length > 0 && (
          <div className="space-y-1">
            {marketplace.map((p) => (
              <div key={p.issuer_id} className="flex justify-between gap-2">
                <span className="truncate text-slate-200">{p.issuer_name}</span>
                <span className="text-slate-400 shrink-0">{fmtCount(p.plan_count)} plans{p.state_enrollment ? ` · ${fmtCount(p.state_enrollment)} in PA` : ''}</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">Individual medical plans sold in this county for 2026, from the Pennsylvania marketplace service-area file. Dental plans are left out. Partial-county service areas are counted. The Pennsylvania number is 2025 average monthly enrollment for that issuer statewide, not in this county. A blank means that 2026 issuer id had no 2025 enrollment row.</p>
          </div>
        )}
        {(individual.length > 0 || small.length > 0) && (
          <div className="space-y-1">
            {individual.slice(0, 6).map((r) => (
              <div key={r.company} className="flex justify-between gap-2">
                <span className="truncate text-slate-200">{r.company}</span>
                <span className="text-slate-400 shrink-0">{r.approved_pct == null ? '—' : fmtPct(r.approved_pct)}{r.market_share != null ? ` · ${fmtPct(r.market_share, 0)} of 2026` : ''}</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">
              Pennsylvania Insurance Department, final 2027 rates. Statewide, not this county.
              {indAvg != null && ` Individual market, enrollment-weighted: ${fmtPct(indAvg, 2)}.`}
              {smallAvg != null && ` Small group, enrollment-weighted: ${fmtPct(smallAvg, 2)}.`}
            </p>
          </div>
        )}
        {mlr.length > 0 && (
          <div className="space-y-1">
            {mlr.map((r) => (
              <div key={r.company} className="flex justify-between gap-2">
                <span className="truncate text-slate-200">{r.company}</span>
                <span className="text-slate-400 shrink-0">{r.mlr == null ? '—' : fmtPct(r.mlr)}{r.rebate > 0 ? ` · rebate ${money(r.rebate)}` : ''}</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">Medical loss ratio, 2024 reporting year, individual market, this state. Credibility-adjusted over three years. The figure is not this county, and it is not a hospital's payer mix.</p>
          </div>
        )}
        {oep && (
          <p className="text-[11px] text-slate-500">
            {oep.platform === 'SBE' ? 'State marketplace' : 'HealthCare.gov'}, 2026 open enrollment: {fmtCount(oep.plan_selections)} plan selections
            {oep.avg_premium != null ? `, average premium ${money(oep.avg_premium)}` : ''}
            {oep.avg_premium_after_aptc != null ? ` (${money(oep.avg_premium_after_aptc)} after tax credit)` : ''}. Statewide. CMS does not publish Pennsylvania county enrollment.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** What one clinician writes, plus exclusion, opt-out, and industry payments. */
export function ProviderReferenceCard({ reference }) {
  if (!reference) return null;
  const drugs = reference.drugs || [];
  const excluded = reference.excluded;
  const opted = reference.opted_out;
  const pay = reference.open_payments;
  const dme = reference.dme;
  if (!drugs.length && !excluded && !opted && !pay && !dme) return null;
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Prescriptions, equipment, and standing</CardTitle></CardHeader>
      <CardContent className="text-xs space-y-2">
        {excluded && <p className="text-red-300">OIG exclusion {excluded.excl_type} dated {excluded.excl_date}. Do not bill Medicare or Medicaid for this NPI.</p>}
        {opted && <p className="text-amber-300">Opted out of Medicare{opted.effective_date ? ` from ${opted.effective_date}` : ''}{opted.end_date ? ` through ${opted.end_date}` : ''}.</p>}
        {pay && <p className="text-slate-300">Open Payments {pay.program_year}: {fmtCount(pay.payment_count)} general payments, {money(pay.total_amount)}.</p>}
        {drugs.length > 0 && (
          <div className="space-y-1">
            {drugs.map((d) => (
              <div key={d.generic_name} className="flex justify-between gap-2">
                <span className="truncate text-slate-200">{d.generic_name}</span>
                <span className="text-slate-400 shrink-0">{fmtCount(d.claims)} claims</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">Part D, {drugs[0].data_year}. Top generics. Counts under 11 are suppressed.</p>
          </div>
        )}
        {reference.dme && <DmeLines summary={reference.dme.summary} lines={reference.dme.orders} supplier={reference.dme.supplier} supplied={reference.dme.supplied} />}
      </CardContent>
    </Card>
  );
}

function rentalTag(rental) {
  if (rental === 'Y') return 'rental';
  if (rental === 'N') return 'purchase';
  return null;
}

function splitLine(label, benes, payment, suppressed) {
  if (suppressed && benes == null) return `${label} suppressed`;
  if (benes == null && payment == null) return null;
  return `${label} ${fmtCount(benes)} patients, ${money(payment)}`;
}

function DmeLines({ summary, lines, supplier, supplied }) {
  const parts = summary ? [splitLine('Equipment', summary.dme_benes, summary.dme_payment, summary.dme_suppressed), splitLine('Prosthetics and orthotics', summary.pos_benes, summary.pos_payment, summary.pos_suppressed), splitLine('DME drugs', summary.drug_benes, summary.drug_payment, summary.drug_suppressed)].filter(Boolean) : [];
  return (
    <div className="space-y-1 pt-1">
      {summary && <p className="text-slate-300">Ordered in {summary.data_year || '2024'}: {fmtCount(summary.benes)} patients, {money(summary.medicare_payment)} Medicare payment.</p>}
      {parts.length > 0 && <p className="text-slate-400">{parts.join(' · ')}</p>}
      {(lines || []).map((row) => (
        <div key={`${row.hcpcs}-${row.rental}`} className="flex justify-between gap-2">
          <span className="truncate text-slate-200">{row.hcpcs_desc || row.hcpcs}{rentalTag(row.rental) ? ` · ${rentalTag(row.rental)}` : ''}</span>
          <span className="text-slate-400 shrink-0">{fmtCount(row.benes)}</span>
        </div>
      ))}
      {supplier && <p className="text-slate-300 pt-1">Supplied: {fmtCount(supplier.benes)} patients, {money(supplier.medicare_payment)}.</p>}
      {(supplied || []).map((row) => (
        <div key={`s-${row.hcpcs}-${row.rental}`} className="flex justify-between gap-2">
          <span className="truncate text-slate-200">{row.hcpcs_desc || row.hcpcs}{rentalTag(row.rental) ? ` · ${rentalTag(row.rental)}` : ''}</span>
          <span className="text-slate-400 shrink-0">{fmtCount(row.benes)}</span>
        </div>
      ))}
      <p className="text-[11px] text-slate-500">Original Medicare DMEPOS, 2024. Not Medicare Advantage. CMS leaves out any product under 11 patients, so a blank is not zero. Prosthetics and orthotics are separate from equipment. DME drugs are not Part D.</p>
    </div>
  );
}

function DmeCountyCard({ dme }) {
  const products = dme.products || [];
  const locations = dme.locations || [];
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Durable medical equipment, {dme.year}</CardTitle></CardHeader>
      <CardContent className="text-xs space-y-2">
        {products.length > 0 && (
          <div className="space-y-1">
            {products.map((row) => (
              <div key={`${row.hcpcs}-${row.rental}`} className="flex justify-between gap-2">
                <span className="truncate text-slate-200">{row.hcpcs_desc || row.hcpcs}{rentalTag(row.rental) ? ` · ${rentalTag(row.rental)}` : ''}</span>
                <span className="text-slate-400 shrink-0">{fmtCount(row.benes)} · {fmtCount(row.suppliers)} suppliers</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">Statewide, by where the ordering provider is located. Not the patient's home county, and not Medicare Advantage.</p>
          </div>
        )}
        <p className="text-slate-300">{fmtCount(dme.suppliers)} Medicare suppliers with a ZIP mainly in this county.</p>
        {locations.map((loc) => (
          <div key={`${loc.business_name}-${loc.city}`} className="truncate text-slate-400">{loc.business_name}{loc.city ? ` · ${loc.city}` : ''}{loc.supplies ? ` · ${String(loc.supplies).split('|')[0]}` : ''}</div>
        ))}
        <p className="text-[11px] text-slate-500">Directory as of October 11, 2026. The list is what the location says it carries, not paid volume. A ZIP that sits mostly in the next county is counted there. Counts under 11 are omitted from the payment file.</p>
      </CardContent>
    </Card>
  );
}

export function DrgCard({ drgs }) {
  if (!drgs?.lines?.length) return null;
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Inpatient diagnoses, {drgs.year}</CardTitle></CardHeader>
      <CardContent className="text-xs space-y-1">
        {drgs.lines.map((row) => (
          <div key={row.drg_code} className="flex justify-between gap-2">
            <span className="truncate text-slate-200">{row.drg_desc}</span>
            <span className="text-slate-400 shrink-0">{fmtCount(row.discharges)} · {money(row.avg_medicare_payments)} avg</span>
          </div>
        ))}
        <p className="text-[11px] text-slate-500 pt-1">Original Medicare IPPS, MS-DRG. {fmtCount(drgs.discharges)} discharges across {fmtCount(drgs.drg_count)} published diagnoses. CMS leaves out any diagnosis under 11 discharges, so this is not the hospital's whole book, and it is not Medicare Advantage. Length of stay is the hospital total, not these rows.</p>
      </CardContent>
    </Card>
  );
}

export function DmeFacilityCard({ dme }) {
  if (!dme) return null;
  const dir = dme.directory;
  const supplies = dir?.supplies ? String(dir.supplies).split('|').filter(Boolean) : [];
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Equipment carried and Medicare volume</CardTitle></CardHeader>
      <CardContent className="text-xs space-y-2">
        {dir && (
          <p className="text-slate-300">
            {dir.accepts_assignment ? 'Accepts Medicare assignment.' : 'Does not accept Medicare assignment.'}
            {dir.phone ? ` ${dir.phone}.` : ''}
            {dir.cba_contracted ? ' Marked as a competitive-bidding contractor.' : ''}
          </p>
        )}
        {supplies.length > 0 && (
          <p className="text-slate-200">{supplies.slice(0, 12).join(' · ')}{supplies.length > 12 ? ` · +${supplies.length - 12} more` : ''}</p>
        )}
        {dir?.specialties && <p className="text-slate-400">{dir.specialties}</p>}
        {dme.summary && (
          <p className="text-slate-300">
            Supplied in {dme.year}: {fmtCount(dme.summary.benes)} patients, {money(dme.summary.medicare_payment)} Medicare payment.
            {' '}{[splitLine('Equipment', dme.summary.dme_benes, dme.summary.dme_payment, dme.summary.dme_suppressed), splitLine('Prosthetics and orthotics', dme.summary.pos_benes, dme.summary.pos_payment, dme.summary.pos_suppressed), splitLine('DME drugs', dme.summary.drug_benes, dme.summary.drug_payment, dme.summary.drug_suppressed)].filter(Boolean).join(' · ')}
          </p>
        )}
        {(dme.lines || []).map((row) => (
          <div key={`${row.hcpcs}-${row.rental}`} className="flex justify-between gap-2">
            <span className="truncate text-slate-200">{row.hcpcs_desc || row.hcpcs}{rentalTag(row.rental) ? ` · ${rentalTag(row.rental)}` : ''}</span>
            <span className="text-slate-400 shrink-0">{fmtCount(row.benes)} · {money(row.avg_payment)} avg</span>
          </div>
        ))}
        {!dme.npi && dir && <p className="text-slate-400">No single 2024 payment NPI matched this name and ZIP, so paid volume is not shown.</p>}
        <p className="text-[11px] text-slate-500">Directory as of October 11, 2026: what the location says it carries. Paid lines are 2024 Original Medicare, not Medicare Advantage, and only when one supplier NPI has this name and ZIP. Counts under 11 are omitted. Competitive bidding has been in a gap since January 1, 2024, so a contract flag is not a current award.</p>
      </CardContent>
    </Card>
  );
}
