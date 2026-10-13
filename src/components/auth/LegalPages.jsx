import { Link } from 'react-router-dom';

const PRODUCT = 'CareMetric Healthcare Advisors';
const EFFECTIVE = 'October 2026';

/** Shared frame for the public legal pages (reachable without signing in). */
function LegalShell({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-300">
      <header className="border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/login" className="text-white font-bold">CareMetric Healthcare Advisors</Link>
          <nav aria-label="Legal pages" className="flex gap-4 text-sm">
            <Link to="/terms" className="text-cyan-400 hover:text-cyan-300">Terms</Link>
            <Link to="/privacy" className="text-cyan-400 hover:text-cyan-300">Privacy</Link>
            <Link to="/data-use" className="text-cyan-400 hover:text-cyan-300">Data sources</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-xs text-slate-400">Effective {EFFECTIVE}. Applies to {PRODUCT}.</p>
        {children}
      </main>
      <footer className="max-w-3xl mx-auto px-4 py-8 text-xs text-slate-400 border-t border-slate-800">
        <Link to="/login" className="text-cyan-400 hover:text-cyan-300">Back to sign in</Link>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      {children}
    </section>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        These terms are the agreement between your organization and CareMetric Healthcare Advisors for use of {PRODUCT} (the “Service”).
        By creating an account or using the Service you accept them on behalf of the organization you sign up for.
      </p>
      <Section title="1. Accounts and organizations">
        <p>
          Each subscription belongs to an organization. The person who signs up is its first owner; owners may invite people
          up to the plan’s seat limit, manage their access and change the plan. You are responsible for the people you invite
          and for keeping passwords private. Accounts may be reviewed before they are activated.
        </p>
      </Section>
      <Section title="2. Subscription, trial and payment">
        <p>
          Plans are billed monthly in advance through Stripe. New organizations may start with a free trial; when it ends the
          Service is limited until a plan is chosen. A failed payment puts the organization in a payment-due state, and a
          subscription that stays unpaid is canceled. You can cancel at any time from the Billing page; access continues to the
          end of the paid period. Fees are not refunded for partial periods unless the law requires it.
        </p>
      </Section>
      <Section title="3. What the Service is for">
        <p>
          The Service provides market research for post-acute and senior care operators: provider and facility directories,
          referral-source analysis, county market profiles and outreach tools. It is built from public data sources (see{' '}
          <Link to="/data-use" className="text-cyan-400 hover:underline">Data sources and use</Link>). Figures are estimates derived
          from those sources and are provided for research and marketing planning; they are not medical, legal or financial advice
          and are not a substitute for your own verification before you act on them.
        </p>
      </Section>
      <Section title="4. Acceptable use">
        <ul className="list-disc pl-5 space-y-1">
          <li>Use the Service only for your organization’s own research and outreach, within the territory your plan covers.</li>
          <li>Do not resell, scrape, bulk-export or redistribute the data, or build a competing dataset or product from it.</li>
          <li>Do not attempt to identify individual patients or beneficiaries, or combine the data with other sources for that purpose.</li>
          <li>Email sent through the Service must comply with CAN-SPAM and your own professional obligations; recipients who unsubscribe must not be contacted again.</li>
          <li>Do not share accounts, probe the Service for weaknesses or interfere with other customers.</li>
        </ul>
      </Section>
      <Section title="5. Your data">
        <p>
          Lead lists, campaigns, saved filters, reports and notes you create belong to your organization and are visible only to
          its members (and company personnel when supporting you or operating the Service). You may export them at any time.
          We keep them for 90 days after a subscription ends, then delete them.
        </p>
      </Section>
      <Section title="6. Availability and changes">
        <p>
          We aim for continuous availability but do not guarantee it; data refreshes follow the publishing schedules of the
          sources. We may change features, plans and prices with notice; price changes apply from the next billing period.
        </p>
      </Section>
      <Section title="7. Warranty and liability">
        <p>
          The Service is provided “as is”. To the fullest extent the law allows, CareMetric Healthcare Advisors disclaims implied warranties and is not
          liable for indirect or consequential loss, and its total liability for any claim is limited to the fees paid by your
          organization in the twelve months before the claim.
        </p>
      </Section>
      <Section title="8. Termination">
        <p>
          Either side may end the agreement at the end of a billing period. We may suspend an organization that breaks these terms
          or whose payment fails, after notice where practical.
        </p>
      </Section>
      <Section title="9. Contact">
        <p>Questions about these terms go to the address shown on the Billing page or in your invoice.</p>
      </Section>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <Section title="What we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-slate-200">Account data:</strong> your name, email, organization, password hash, sign-in times and IP addresses, and the actions you take (kept in an audit log for security).</li>
          <li><strong className="text-slate-200">Billing data:</strong> handled by Stripe. We store the Stripe customer and subscription identifiers and the plan; we never see full card numbers.</li>
          <li><strong className="text-slate-200">Your work in the Service:</strong> lead lists, campaigns, email drafts, saved filters and reports.</li>
          <li><strong className="text-slate-200">Outreach email:</strong> when you send email through the Service, we keep the message, recipient, delivery status and unsubscribe requests.</li>
          <li><strong className="text-slate-200">AI assistant:</strong> your questions and the assistant’s answers are stored with your account so you can return to them; the questions are sent to our AI provider to produce the answers.</li>
        </ul>
      </Section>
      <Section title="What we do not collect">
        <p>
          The provider, facility and market data in the Service come from public government files about healthcare providers and
          organizations, not from patients. No patient-level or beneficiary-level data is held, and we do not attempt to identify
          individuals from the aggregated figures.
        </p>
      </Section>
      <Section title="How we use it">
        <p>
          To run the Service, bill your organization, secure accounts, answer support requests and improve the product. We do not
          sell your data or use your lead lists and campaigns for anything other than providing the Service to your organization.
        </p>
      </Section>
      <Section title="Who sees it">
        <p>
          Members of your organization, according to their role; company personnel when operating or supporting the Service; and
          service providers that process data for us (hosting, Stripe for payments, SendGrid for email, and our AI provider for the
          assistant). Each is bound to use the data only to provide its service.
        </p>
      </Section>
      <Section title="Retention and your rights">
        <p>
          Account and organization data are kept while the subscription is active and for 90 days after it ends; audit logs are kept
          for two years. You can export your data from the Service, change your account details, and ask us to delete your account
          or organization. Owners can see and manage their organization’s people from Admin Settings.
        </p>
      </Section>
      <Section title="Security">
        <p>
          Sessions use secure, httpOnly cookies; passwords are stored as bcrypt hashes; access is checked on every request and
          disabling an account ends its sessions at once. Report a security concern to the contact on your invoice.
        </p>
      </Section>
    </LegalShell>
  );
}

export function DataUsePage() {
  return (
    <LegalShell title="Data sources and use">
      <p>
        Everything in {PRODUCT} is derived from public data. This page says where it comes from, what it is and is not, and how
        it may be used.
      </p>
      <Section title="Sources">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-slate-200">NPPES</strong> (CMS National Plan and Provider Enumeration System): providers, organizations, practice locations and taxonomies, refreshed from the weekly and monthly dissemination files; taxonomy names from the NUCC code set.</li>
          <li><strong className="text-slate-200">CMS public use files</strong> from data.cms.gov and Care Compare: Hospital Service Area, Hospital Spending by Claim, Post-Acute Care utilization (SNF, home health, hospice, IRF, LTCH), Market Saturation and Utilization, Medicare Monthly Enrollment, Geographic Variation, Physician and Other Practitioners, DME by referring provider, Order and Referring, facility affiliations, quality and ownership files for hospitals, nursing homes, hospices and home health agencies, and the Long-Term Care Facility Characteristics (CMS-671) file.</li>
          <li><strong className="text-slate-200">U.S. Census Bureau</strong>: 2020 county and ZIP Code Tabulation Area geography, and American Community Survey 5-year estimates (population 65 and over, 85 and over, median income, home values, older adults living alone).</li>
          <li><strong className="text-slate-200">State licensing files</strong> for personal care homes and assisted living residences, loaded as each state publishes them.</li>
        </ul>
        <p>Each dataset’s vintage and import date are shown inside the app (Help → “What data is this and how fresh is it?”, and on every market view).</p>
      </Section>
      <Section title="What the figures are">
        <ul className="list-disc pl-5 space-y-1">
          <li>They are <strong className="text-slate-200">independent analysis derived from public data, not CMS publications</strong>. CMS asks that altered data not be presented as CMS data; every figure here carries its source and vintage.</li>
          <li>Medicare figures cover fee-for-service beneficiaries only, plus Medicare Advantage where CMS includes it. CMS suppresses counts under 11 before publishing, and the Service keeps that suppression.</li>
          <li>“Hospital sources” show where a hospital’s inpatients live. The “discharge mix” is post-discharge Medicare spending by setting, a proxy for where patients go next, not a count of transfers.</li>
          <li>Shared-patient and referral-source figures describe which providers serve the same beneficiaries or are eligible to refer; they are not confirmed referrals.</li>
          <li>No patient-level or beneficiary-level data is used, and nothing in the Service identifies a patient.</li>
        </ul>
      </Section>
      <Section title="How you may use it">
        <ul className="list-disc pl-5 space-y-1">
          <li>For your organization’s market research, planning and outreach, within your plan’s territory.</li>
          <li>Exports carry a source and vintage line; keep it when you share them internally. Do not publish, resell or redistribute the data or present it as CMS data.</li>
          <li>Do not attempt to re-identify patients or beneficiaries, or combine the data with other sources to do so.</li>
        </ul>
      </Section>
    </LegalShell>
  );
}
