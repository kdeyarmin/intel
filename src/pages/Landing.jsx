import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { CAREMETRIC_LOGO_URL, CAREMETRIC_NAME } from '@/lib/branding';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  TrendingUp,
  Users,
  Building2,
  MapPin,
  Bot,
  Mail,
  X,
  Stethoscope,
  Network,
  ListCheck,
  PhoneCall,
  Calendar,
  HeartPulse,
} from 'lucide-react';

export default function Landing() {
  const { isAuthenticated } = useAuth();

  const [annualBilling, setAnnualBilling] = useState(true);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [demoForm, setDemoForm] = useState({
    fullName: '',
    workEmail: '',
    organization: '',
    businessLine: 'home_health',
    territory: '',
    notes: '',
  });
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const demoModalRef = useRef(null);

  // Close demo modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && demoModalOpen) {
        setDemoModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [demoModalOpen]);

  // Focus trap / manage focus when demo modal opens
  useEffect(() => {
    if (demoModalOpen) {
      const trigger = document.activeElement;
      demoModalRef.current?.focus();
      return () => trigger?.focus();
    }
  }, [demoModalOpen]);

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    setDemoSubmitted(true);
  };
  const demoEmail = `mailto:sales@caremetric.ai?subject=${encodeURIComponent(`${CAREMETRIC_NAME} demo request`)}&body=${encodeURIComponent(
    `Name: ${demoForm.fullName}\nEmail: ${demoForm.workEmail}\nOrganization: ${demoForm.organization}\nCare setting: ${demoForm.businessLine}\nTerritory: ${demoForm.territory}\nNotes: ${demoForm.notes}`,
  )}`;

  const closeDemoModal = () => {
    setDemoModalOpen(false);
    setTimeout(() => {
      setDemoSubmitted(false);
      setDemoForm({
        fullName: '',
        workEmail: '',
        organization: '',
        businessLine: 'home_health',
        territory: '',
        notes: '',
      });
    }, 300);
  };

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-cyan-500 selection:text-white font-sans antialiased overflow-x-hidden">
      {/* Top Banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 text-center text-xs text-slate-300">
        <span className="inline-flex flex-wrap justify-center items-center gap-1.5 font-medium">
          <span>Public healthcare data for informed market planning</span>
          <span className="hidden sm:inline text-slate-400">•</span>
          <a href="#pricing" className="underline hover:text-white font-semibold">
            Explore proposed plans
          </a>
        </span>
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-20 py-3 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <Link to="/landing" className="shrink-0 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-lg p-1">
            <img
              src={CAREMETRIC_LOGO_URL}
              alt={CAREMETRIC_NAME}
              className="w-40 sm:w-44 h-12 rounded-md object-contain bg-white text-slate-900"
            />
          </Link>

          {/* Desktop Nav Links */}
          <nav aria-label="Main Navigation" className="hidden xl:flex items-center gap-4 text-xs font-medium text-slate-300">
            <a href="#features" className="hover:text-cyan-400 transition-colors">Features</a>
            <a href="#who-its-for" className="hover:text-cyan-400 transition-colors">Who It's For</a>
            <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">How It Works</a>
            <a href="#comparison" className="hover:text-cyan-400 transition-colors">Comparison</a>
            <a href="#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-cyan-400 transition-colors">Use Cases</a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">FAQ</a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden xl:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg border border-slate-700/80 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              Request Demo
            </button>

            {isAuthenticated ? (
              <Link
                to="/"
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3.5 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-lg"
                >
                  Sign In
                </Link>
                <Link
                  to="/login?signup=true"
                  className="px-3 py-2 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  Start Free Trial
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="xl:hidden flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800/80 border border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="xl:hidden border-b border-slate-800 bg-[#0d1424] px-4 pt-3 pb-6 space-y-3">
            <nav aria-label="Mobile Navigation" className="flex flex-col space-y-2 text-base font-medium text-slate-300">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-cyan-400">Features</a>
              <a href="#who-its-for" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-cyan-400">Who It's For</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-cyan-400">How It Works</a>
              <a href="#comparison" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-cyan-400">Comparison</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-cyan-400">Pricing</a>
              <a href="#testimonials" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-cyan-400">Use Cases</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-md hover:bg-slate-800 hover:text-cyan-400">FAQ</a>
            </nav>
            <div className="pt-4 border-t border-slate-800 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); setDemoModalOpen(true); }}
                className="w-full text-center px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700"
              >
                Request Demo
              </button>
              {isAuthenticated ? (
                <Link
                  to="/"
                  className="w-full text-center px-4 py-2.5 text-sm font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded-lg shadow"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    className="w-full text-center px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 rounded-lg border border-slate-700"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/login?signup=true"
                    className="w-full text-center px-4 py-2.5 text-sm font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded-lg"
                  >
                    Start Free Trial
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative text-center max-w-4xl mx-auto">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs sm:text-sm font-medium mb-8 shadow-inner">
            <Sparkles className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Provider intelligence for healthcare managers</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
            Understand your market.{' '}
            <span className="text-cyan-300">Plan provider outreach</span>{' '}
            with public healthcare data.
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            {CAREMETRIC_NAME} brings provider directories, aggregate Medicare utilization, and county-level context into one workspace for home health, hospice, and post-acute teams.
          </p>

          {/* Dual CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/login?signup=true"
              className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-cyan-700 hover:bg-cyan-800 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 flex items-center justify-center gap-2"
            >
              <span>Start 14-Day Free Trial</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>

            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-slate-200 hover:text-white bg-slate-850 hover:bg-slate-800 rounded-xl border border-slate-700/80 transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <Calendar className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>Schedule Live Demo</span>
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Territory-based planning
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Public CMS & NPPES sources
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Aggregate data, not patient records
            </span>
          </div>
        </div>

        {/* Hero Interactive UI Preview Card */}
        <div className="mt-14 relative max-w-5xl mx-auto">
          <div className="relative rounded-2xl border border-slate-800 bg-[#0e1626]/90 p-4 sm:p-6 shadow-2xl backdrop-blur-xl">
            {/* Window Chrome Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs text-slate-400 ml-2">{CAREMETRIC_NAME} • Workspace preview</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-emerald-950/70 border border-emerald-500/30 text-emerald-300">
                  Illustrative sample — not live data
                </span>
              </div>
            </div>

            {/* Provider Card Mockup */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Doctor Profile & Score */}
              <div className="lg:col-span-7 bg-[#131d31] rounded-xl p-5 border border-slate-700/60">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
                      EP
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-white">Example physician profile</h2>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 border border-cyan-500/30 text-cyan-300 uppercase tracking-wide">
                          Individual
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium">Cardiovascular Disease & Internal Medicine</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span>Example county and practice location</span>
                      </p>
                    </div>
                  </div>

                  {/* Lead Score Badge */}
                  <div className="text-right shrink-0">
                    <div className="inline-flex flex-col items-end">
                      <div className="text-2xl font-black text-cyan-400 leading-none">94<span className="text-xs text-slate-400 font-normal">/100</span></div>
                      <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mt-1">High Priority Lead</span>
                    </div>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-4 border-t border-slate-700/60">
                  <div className="bg-[#0b1220] p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Cert. beneficiaries</span>
                    <span className="text-base font-bold text-white">142</span>
                    <span className="text-[10px] text-slate-400 block">G0180/G0179 sample</span>
                  </div>
                  <div className="bg-[#0b1220] p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Care Plan Oversight</span>
                    <span className="text-base font-bold text-white">38 Benes</span>
                    <span className="text-[10px] text-slate-400 block">Illustrative total</span>
                  </div>
                  <div className="bg-[#0b1220] p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Specialty</span>
                    <span className="text-base font-bold text-white">Cardiology</span>
                    <span className="text-[10px] text-slate-400 block">Taxonomy context</span>
                  </div>
                </div>

                {/* AI Outreach Angle Box */}
                <div className="mt-4 p-3.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 mb-1.5">
                    <Bot className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    <span>AI Suggested Outreach Angle</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Prepare a discussion about your agency’s cardiac care capabilities and service area. Review the source data and confirm current practice needs before contacting the provider.
                  </p>
                </div>
              </div>

              {/* Right Column: Mini Referral Network & Quick Actions */}
              <div className="lg:col-span-5 flex flex-col justify-between bg-[#131d31] rounded-xl p-5 border border-slate-700/60">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Network className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                      Shared-patient patterns
                    </span>
                    <span className="text-[10px] text-cyan-400 font-medium">CMS Shared Patients</span>
                  </div>

                  {/* Referral Flow Nodes */}
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-[#0b1220] border border-slate-800">
                      <span className="text-slate-300 font-medium">Example hospital</span>
                      <span className="text-emerald-400 font-semibold font-mono">184 shared patients</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-[#0b1220] border border-slate-800">
                      <span className="text-slate-300 font-medium">Example health system</span>
                      <span className="text-cyan-400 font-semibold font-mono">72 shared patients</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-[#0b1220] border border-slate-800">
                      <span className="text-slate-300 font-medium">Example nursing facility</span>
                      <span className="text-amber-400 font-semibold font-mono">41 shared patients</span>
                    </div>
                    <p className="mt-3 text-xs text-slate-400 leading-relaxed">Public aggregate shared-patient patterns are not confirmed referrals or transfers. Sample counts and scores are illustrative.</p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-700/60 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDemoModalOpen(true)}
                      className="w-full py-2 px-3 text-xs font-semibold bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ListCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Add to Lead List</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoModalOpen(true)}
                      className="w-full py-2 px-3 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Launch Outreach</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Stats Bar */}
      <section className="border-y border-slate-800/80 bg-[#0c1220] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-200">Provider research</h2>
              <p className="mt-1 text-sm text-slate-400">NPPES practice and specialty records</p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-200">Utilization context</h2>
              <p className="mt-1 text-sm text-slate-400">Public aggregate Medicare summaries</p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-200">Territory planning</h2>
              <p className="mt-1 text-sm text-slate-400">County geography and ACS demographics</p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-200">Team coordination</h2>
              <p className="mt-1 text-sm text-slate-400">Shared lists and outreach preparation</p>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For Section */}
      <section id="who-its-for" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Purpose-Built Intelligence</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
            Designed for healthcare managers and provider relations teams
          </h2>
          <p className="mt-4 text-slate-300 text-base sm:text-lg">
            {CAREMETRIC_NAME} supports research and planning with provider records, public utilization summaries, and geographic context relevant to your care setting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Segment 1: Home Health */}
          <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-5">
                <HeartPulse className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Home Health Agencies</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Review publicly reported G0180/G0179 certification activity alongside provider specialties and locations to prepare a focused outreach list.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Reported certification beneficiaries</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Care plan oversight beneficiaries</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>County hospital service area context</span>
              </li>
            </ul>
          </div>

          {/* Segment 2: Hospice & Palliative */}
          <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 hover:border-teal-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-teal-950/80 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-5">
                <Stethoscope className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Hospice & Palliative Care</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Research oncology, pulmonary, and geriatric practices by specialty and location. Prepare provider discussions without inferring individual patient needs.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
                <span>Specialty-based provider research</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
                <span>County population and age profiles</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
                <span>Local facility context</span>
              </li>
            </ul>
          </div>

          {/* Segment 3: SNF & Inpatient Rehab */}
          <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 hover:border-emerald-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-5">
                <Building2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Skilled Nursing & Rehab (SNF/IRF)</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Compare local facilities, Medicare utilization, and post-discharge spending by setting. Use market context to support service-area planning.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Post-discharge spending mix by county</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Aggregate shared-patient patterns</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Local facility supply and saturation</span>
              </li>
            </ul>
          </div>

          {/* Segment 4: Healthcare BD & Marketing Teams */}
          <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-5">
                <Users className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Provider Relations & Outreach Teams</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Coordinate provider lists, call sheets, and relationship notes. Use AI-assisted drafts as a starting point for staff-reviewed outreach.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Multi-seat rep assignment & notes</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>AI-assisted discussion preparation</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Export-ready CRM & CSV reports</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#0b101d] border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">End-to-End Workflow</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
              From public data to a coordinated outreach plan
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg">
              A practical workflow for researching providers, organizing priorities, and preparing your team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            {/* Step 1 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-950 text-cyan-400 font-bold flex items-center justify-center text-sm border border-cyan-500/30 mb-5">
                01
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Review Source Data</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Explore imported NPPES, CMS, and Census datasets. Check release years and import status: source publication and successful imports determine freshness.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-teal-950 text-teal-400 font-bold flex items-center justify-center text-sm border border-teal-500/30 mb-5">
                02
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Score & Prioritize</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Use configured scoring rules to organize provider research. Scores support prioritization; they do not predict referrals or patient outcomes, and unscored records remain visible.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-950 text-cyan-400 font-bold flex items-center justify-center text-sm border border-cyan-500/30 mb-5">
                03
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Build Target Lists</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Filter providers by specialty and location, save relevant records, and organize team lists and call sheets.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-emerald-950 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30 mb-5">
                04
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Engage & Outreach</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Prepare discussion points and outreach drafts with AI assistance. Review accuracy and appropriateness before use, then record relationship notes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Deep Dive */}
      <section id="features" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Complete Platform Intelligence</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
            A shared workspace for provider research and market planning
          </h2>
          <p className="mt-4 text-slate-300 text-base sm:text-lg">
            {CAREMETRIC_NAME} combines public provider records, market summaries, and team planning tools, with source context to guide interpretation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Provider & Facility 360°</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Review available practice and mailing addresses, specialty taxonomies, license fields, and Medicare enrollment information. Public records may be incomplete or lag current practice details.
            </p>
            <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
              Public NPPES & CMS Records →
            </span>
          </div>

          {/* Feature 2 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-teal-950/80 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-6">
              <Network className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Shared-Patient Network Mapping</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Explore public aggregate shared-patient patterns between providers. These patterns do not establish referral direction, confirmed transfers, or the reason providers share patients.
            </p>
            <span className="text-xs font-semibold text-teal-400 flex items-center gap-1">
              Shared-Patient Volume Analysis →
            </span>
          </div>

          {/* Feature 3 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6">
              <MapPin className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">County & Territory Intelligence</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Compare available post-acute market saturation, Medicare FFS utilization, and Census demographics within your plan’s territory. Demographic estimates provide context, not forecasts of service demand.
            </p>
            <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
              Bundled Census 2020 & ACS 5-Year Data →
            </span>
          </div>

          {/* Feature 4 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6">
              <TrendingUp className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Lead Scoring & List Builder</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Apply configured scoring rules and organize providers into team lead lists. Review the underlying records and rule settings before deciding outreach priorities.
            </p>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              Configurable Provider Prioritization →
            </span>
          </div>

          {/* Feature 5 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6">
              <Bot className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Healthcare AI Assistant</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Ask questions about available market data and prepare outreach drafts. Check AI-generated summaries against their sources before using them in decisions or communications.
            </p>
            <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
              Staff-Reviewed Research & Drafts →
            </span>
          </div>

          {/* Feature 6 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-teal-950/80 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-6">
              <PhoneCall className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Call Sheets & Campaigns</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Prepare call sheets, log meeting notes, and coordinate outreach campaigns. Keep patient information out of notes and drafts, and follow your organization’s communications policies.
            </p>
            <span className="text-xs font-semibold text-teal-400 flex items-center gap-1">
              Collaborative CRM & Outreach Tools →
            </span>
          </div>
        </div>
      </section>

      {/* Comparison to Alternatives Section */}
      <section id="comparison" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#0b101d] border-y border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Market Comparison</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
              Questions to ask when evaluating healthcare intelligence
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg">
              Compare sources, interpretation, workflow fit, and commercial terms. Confirm current capabilities and pricing directly with each vendor rather than relying on assumed comparisons.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0f172a] shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#131d31]">
                  <th scope="col" className="p-4 sm:p-5 text-sm font-semibold text-slate-300">Evaluation area</th>
                  <th scope="col" className="p-4 sm:p-5 text-sm font-bold text-cyan-400 bg-cyan-950/30 border-x border-cyan-500/20">
                    {CAREMETRIC_NAME}
                  </th>
                  <th scope="col" className="p-4 sm:p-5 text-sm font-medium text-slate-400">What to confirm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Pricing & terms</th>
                  <td className="p-4 sm:p-5 font-bold text-cyan-300 bg-cyan-950/20 border-x border-cyan-500/20">
                    Proposed packages below; confirm with sales
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Territory, seats, quotas, renewal, and cancellation terms</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Physician Home Health Certs (G0180/G0179)</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    Public aggregate certification beneficiaries
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Release year, suppression rules, and availability of completed imports</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Network interpretation</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    Aggregate shared-patient graphs
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Whether relationships are inferred patterns or confirmed referrals</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">AI-assisted research</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    Research summaries and outreach drafts
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Source grounding, access controls, and staff review requirements</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Update Frequency</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    Source releases and import status tracked in the platform
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Published data period versus the date a file was imported</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">User Seats & Collaboration</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    Shared lists and call sheets
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Included seats, role permissions, and export limits</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Proposed Packages & Pricing</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
            Plan options for your team and service area
          </h2>
          <p className="mt-4 text-slate-300 text-base sm:text-lg">
            Explore the proposed packages below for your agency. These packages and annual discounts are not available through self-service checkout yet. Contact sales to confirm pricing; current subscription options appear in Billing after signup.
          </p>

          {/* Billing Interval Toggle */}
          <div className="mt-8 inline-flex items-center gap-3 p-1 rounded-full bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setAnnualBilling(false)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-colors ${
                !annualBilling ? 'bg-cyan-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setAnnualBilling(true)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                annualBilling ? 'bg-cyan-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                Save 17% (2 Mo Free)
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {/* Tier 1: Starter */}
          <div className="bg-[#0f172a] rounded-3xl p-8 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Starter</h3>
                <span className="text-xs text-slate-400 font-medium">Local agencies</span>
              </div>
              <p className="text-xs text-slate-400 mb-6 min-h-[36px]">
                Core provider and facility intelligence for local home health, hospice, or boutique post-acute providers.
              </p>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">{annualBilling ? `$${Math.round(199 * 10 / 12)}` : '$199'}</span>
                  <span className="text-sm text-slate-400">/month</span>
                </div>
                <span className="text-xs text-slate-400 block mt-1">
                  {annualBilling ? 'Billed annually ($1,990/yr)' : 'Billed monthly, cancel anytime'}
                </span>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-800 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>2 Team Seats</strong> included</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Single County Pack</strong> or local service area</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Provider directory access</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Up to 10 active lead lists</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Basic CSV data exports</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Standard email support</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link
                to="/login?signup=true"
                className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 block text-center transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                Start Free Trial
              </Link>
            </div>
          </div>

          {/* Tier 2: Professional (Featured) */}
          <div className="bg-[#0f172a] rounded-3xl p-8 border border-cyan-500/40 flex flex-col justify-between relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200">
              Regional teams
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Professional</h3>
                <span className="text-xs text-cyan-300 font-medium">Growth teams</span>
              </div>
              <p className="text-xs text-slate-300 mb-6 min-h-[36px]">
                Proposed state or multi-county intelligence with certification summaries, shared-patient networks, and AI-assisted research.
              </p>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">{annualBilling ? `$${Math.round(499 * 10 / 12)}` : '$499'}</span>
                  <span className="text-sm text-slate-300">/month</span>
                </div>
                <span className="text-xs text-cyan-300/80 block mt-1 font-medium">
                  {annualBilling ? 'Billed annually ($4,990/yr – Save $998)' : 'Billed monthly, cancel anytime'}
                </span>
              </div>

              <div className="space-y-3 pt-6 border-t border-cyan-500/20 text-xs text-slate-200">
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>5 Team Seats</strong> with rep management</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Full State or Multi-County</strong> coverage</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Physician Cert Counts</strong> (G0180/G0179 & Oversight)</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Shared-Patient Network Graphs</strong> & county hospital context</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Healthcare AI Assistant</strong> for outreach angles</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Unlimited lead lists & advanced custom reports</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Priority email & chat support</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link
                to="/login?signup=true"
                className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-cyan-700 hover:bg-cyan-800 block text-center transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                Start 14-Day Free Trial
              </Link>
            </div>
          </div>

          {/* Tier 3: Enterprise */}
          <div className="bg-[#0f172a] rounded-3xl p-8 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Enterprise</h3>
                <span className="text-xs text-slate-400 font-medium">Regional & National</span>
              </div>
              <p className="text-xs text-slate-400 mb-6 min-h-[36px]">
                Discuss national territory needs, scoring configuration, integration requirements, and support arrangements with sales. Scope and availability require confirmation.
              </p>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">Custom</span>
                </div>
                <span className="text-xs text-slate-400 block mt-1">
                  Starting ~$1,500/month or $15k/year
                </span>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-800 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Unlimited Team Seats</strong></span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>National Coverage</strong> (all 50 states + DC)</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Integration requirements review</strong></span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Custom scoring rule formulas & weightings</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Attributed exports & scheduled reporting requirements</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Dedicated customer success manager & SLA</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => setDemoModalOpen(true)}
                className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 block text-center transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                Contact Enterprise Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Illustrative Use Cases */}
      <section id="testimonials" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#0b101d] border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Illustrative Use Cases</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
              Practical applications for healthcare teams
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg">
              These examples describe potential workflows, not customer testimonials or measured performance results.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Use Case 1 */}
            <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 flex flex-col justify-between">
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                Review reported certification activity and practice locations before preparing a home health outreach list. Beneficiary totals may count a person more than once across codes or care settings; a missing or suppressed row is not proof of no activity.
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <div className="w-10 h-10 rounded-full bg-cyan-900/60 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-bold text-sm">
                  01
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Home health outreach planning</h3>
                  <p className="text-xs text-slate-400">Illustrative workflow</p>
                </div>
              </div>
            </div>

            {/* Use Case 2 */}
            <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 flex flex-col justify-between">
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                Compare county demographics, facility supply, and Medicare utilization when assessing a service area. Review each dataset’s reporting period and coverage before drawing conclusions about local demand.
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <div className="w-10 h-10 rounded-full bg-teal-900/60 border border-teal-500/30 flex items-center justify-center text-teal-300 font-bold text-sm">
                  02
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Service-area assessment</h3>
                  <p className="text-xs text-slate-400">Illustrative workflow</p>
                </div>
              </div>
            </div>

            {/* Use Case 3 */}
            <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 flex flex-col justify-between">
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                Organize shared provider lists and prepare discussion points relevant to your organization’s services. Staff review AI-assisted drafts and confirm practice details before contacting providers.
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <div className="w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-sm">
                  03
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Provider relations preparation</h3>
                  <p className="text-xs text-slate-400">Illustrative workflow</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Clear Answers</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">Frequently Asked Questions</h2>
          <p className="mt-3 text-slate-300 text-sm sm:text-base">
            Everything you need to know about our data sources, accuracy, and trial policy.
          </p>
        </div>

        <div className="space-y-4">
          {[
            {
              q: `Where does ${CAREMETRIC_NAME} get its healthcare provider data?`,
              a: `${CAREMETRIC_NAME} uses publicly reported NPPES provider records, CMS facility and aggregate Medicare utilization releases, Order & Referring enrollment catalogs, and U.S. Census Bureau ACS demographic tables. Coverage and reporting periods vary by dataset.`,
            },
            {
              q: 'How frequently is the database updated?',
              a: 'NPPES publishes weekly and monthly files; CMS datasets follow their own release schedules. Platform freshness depends on completed imports and configured maintenance. Check source release years and import status in the platform; a recent import does not mean the underlying data describes current activity.',
            },
            {
              q: 'Does the public intelligence data include patient records?',
              a: 'The intelligence sources are public provider records, facility profiles, and aggregate Medicare summaries, not patient-level clinical records or EHR data. Do not enter PHI in notes, uploads, or AI prompts. Public data use does not establish HIPAA compliance for your organization; follow your privacy and communications policies.',
            },
            {
              q: 'Do shared-patient patterns prove that a referral occurred?',
              a: 'No. Public aggregate shared-patient patterns show that providers served overlapping groups of beneficiaries. They do not confirm individual referrals, transfers, referral direction, or causation. Use them as research context and validate relationships independently.',
            },
            {
              q: 'What is included in the 14-day free trial?',
              a: 'Signup starts a trial without a credit card. Account approval, territory selection, seat limits, and usage quotas may apply. Review the current account and Billing settings for available features; the proposed packages on this page are not self-service checkout offers.',
            },
            {
              q: 'Can I add additional counties or change my territory later?',
              a: 'Review current plan and territory options in Billing, or contact sales for requirements beyond those options. Territory access depends on your plan and selected places; the proposed packages here are subject to confirmation.',
            },
          ].map((item, idx) => (
            <div key={idx} className="rounded-xl border border-slate-800 bg-[#0f172a] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleFaq(idx)}
                aria-expanded={activeFaq === idx}
                aria-controls={`faq-answer-${idx}`}
                id={`faq-question-${idx}`}
                className="w-full py-4 px-6 text-left flex items-center justify-between text-base font-semibold text-slate-100 hover:text-cyan-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`w-5 h-5 text-slate-400 transition-transform ${activeFaq === idx ? 'rotate-180 text-cyan-400' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {activeFaq === idx && (
                <div id={`faq-answer-${idx}`} role="region" aria-labelledby={`faq-question-${idx}`} className="px-6 pb-5 pt-1 text-sm text-slate-300 leading-relaxed border-t border-slate-800/60">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative rounded-3xl bg-slate-900 p-8 sm:p-14 border border-slate-700 overflow-hidden text-center">
          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Explore a more informed approach to provider outreach
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
              Start your 14-day free trial or schedule a 15-minute territory walkthrough with our healthcare intelligence specialists.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/login?signup=true"
                className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-cyan-700 hover:bg-cyan-800 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                Start Free Trial
              </Link>
              <button
                type="button"
                onClick={() => setDemoModalOpen(true)}
                className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-slate-200 hover:text-white bg-slate-900/80 hover:bg-slate-850 rounded-xl border border-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                Schedule Live Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#070b13] text-slate-400 py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-12 border-b border-slate-800/80">
            {/* Brand column */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src={CAREMETRIC_LOGO_URL}
                  alt={CAREMETRIC_NAME}
                  className="w-44 h-12 rounded-md object-contain bg-white text-slate-900"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Public provider intelligence, aggregate Medicare certification summaries, and market context for home health, hospice, and post-acute care teams.
              </p>
              <div className="pt-2 text-xs text-slate-400 space-y-1">
                <p>Support: <a href="mailto:support@caremetric.ai" className="text-cyan-400 hover:underline">support@caremetric.ai</a></p>
                <p>Sales: <a href="mailto:sales@caremetric.ai" className="text-cyan-400 hover:underline">sales@caremetric.ai</a></p>
              </div>
            </div>

            {/* Links: Platform */}
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">Platform</h3>
              <ul className="space-y-2.5 text-xs">
                <li><a href="#features" className="hover:text-cyan-400 transition-colors">Provider Directory</a></li>
                <li><a href="#features" className="hover:text-cyan-400 transition-colors">Shared-Patient Networks</a></li>
                <li><a href="#features" className="hover:text-cyan-400 transition-colors">County Intelligence</a></li>
                <li><a href="#features" className="hover:text-cyan-400 transition-colors">Lead Scoring</a></li>
                <li><a href="#features" className="hover:text-cyan-400 transition-colors">AI Assistant</a></li>
              </ul>
            </div>

            {/* Links: Solutions */}
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">Solutions</h3>
              <ul className="space-y-2.5 text-xs">
                <li><a href="#who-its-for" className="hover:text-cyan-400 transition-colors">Home Health</a></li>
                <li><a href="#who-its-for" className="hover:text-cyan-400 transition-colors">Hospice Care</a></li>
                <li><a href="#who-its-for" className="hover:text-cyan-400 transition-colors">Skilled Nursing (SNF)</a></li>
                <li><a href="#who-its-for" className="hover:text-cyan-400 transition-colors">Inpatient Rehab (IRF)</a></li>
                <li><a href="#pricing" className="hover:text-cyan-400 transition-colors">Pricing & Plans</a></li>
              </ul>
            </div>

            {/* Links: Legal & Data */}
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">Trust & Legal</h3>
              <ul className="space-y-2.5 text-xs">
                <li><Link to="/terms" className="hover:text-cyan-400 transition-colors">Terms of Service</Link></li>
                <li><Link to="/privacy" className="hover:text-cyan-400 transition-colors">Privacy Policy</Link></li>
                <li><Link to="/data-use" className="hover:text-cyan-400 transition-colors">Data Sources & Use</Link></li>
                <li><Link to="/login" className="hover:text-cyan-400 transition-colors">Account Sign In</Link></li>
                <li><Link to="/login?signup=true" className="hover:text-cyan-400 transition-colors">Start Free Trial</Link></li>
              </ul>
            </div>
          </div>

          {/* Compliance Disclaimer & Copyright */}
          <div className="pt-8 text-xs text-slate-400 leading-relaxed space-y-3">
            <p className="max-w-4xl">
              <strong>Data & Use Disclaimer:</strong> {CAREMETRIC_NAME} uses public CMS, NPPES, and U.S. Census Bureau releases. Records describe provider practices, enrollment, and historical aggregate utilization; coverage, suppression, and reporting periods vary. Shared-patient patterns are not confirmed referrals or transfers. Scores and AI summaries support research, not clinical decisions or guaranteed outcomes. Do not enter PHI. Review source freshness and your organization’s privacy and outreach requirements before use.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 text-[11px] text-slate-400">
              <p>© {new Date().getFullYear()} {CAREMETRIC_NAME}. All rights reserved.</p>
              <div className="flex items-center gap-4">
                <Link to="/terms" className="hover:underline">Terms</Link>
                <Link to="/privacy" className="hover:underline">Privacy</Link>
                <Link to="/data-use" className="hover:underline">Data Usage</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Request Demo Modal */}
      {demoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
        >
          <div
            ref={demoModalRef}
            tabIndex={-1}
            className="relative w-full max-w-lg bg-[#0f172a] rounded-2xl border border-slate-700 p-6 sm:p-8 shadow-2xl focus:outline-none text-left my-8"
          >
            <button
              type="button"
              onClick={closeDemoModal}
              aria-label="Close demo request modal"
              className="absolute top-5 right-5 text-slate-400 hover:text-white rounded-lg p-1 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>

            {demoSubmitted ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
                </div>
                <h3 id="demo-modal-title" className="text-2xl font-bold text-white mb-2">Your demo request is ready</h3>
                <p className="text-sm text-slate-300 leading-relaxed max-w-sm mx-auto mb-6">
                  Open the prepared email and send it to our team to request your walkthrough. Your details have not been submitted yet.
                </p>
                <a href={demoEmail} className="block mb-6 text-blue-400 underline">Email Demo Request</a>
                <button
                  type="button"
                  onClick={closeDemoModal}
                  className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-cyan-950 border border-cyan-500/30 text-cyan-300 mb-2">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Personalized 15-Minute Territory Walkthrough</span>
                  </div>
                  <h3 id="demo-modal-title" className="text-2xl font-bold text-white">
                    Request a {CAREMETRIC_NAME} Demo
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Review available provider records, aggregate certification activity, and market context for your selected territory.
                  </p>
                </div>

                <form onSubmit={handleDemoSubmit} className="space-y-4">
                  <div>
                    <label id="demo-fullname-label" htmlFor="demo-fullname" className="block text-xs font-semibold text-slate-300 mb-1">
                      Full Name *
                    </label>
                    <input
                      id="demo-fullname"
                      aria-labelledby="demo-fullname-label"
                      type="text"
                      required
                      value={demoForm.fullName}
                      onChange={(e) => setDemoForm({ ...demoForm, fullName: e.target.value })}
                      placeholder="e.g. Rachel Adams"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label id="demo-email-label" htmlFor="demo-email" className="block text-xs font-semibold text-slate-300 mb-1">
                        Work Email *
                      </label>
                      <input
                        id="demo-email"
                        aria-labelledby="demo-email-label"
                        type="email"
                        required
                        value={demoForm.workEmail}
                        onChange={(e) => setDemoForm({ ...demoForm, workEmail: e.target.value })}
                        placeholder="you@agency.com"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label id="demo-org-label" htmlFor="demo-org" className="block text-xs font-semibold text-slate-300 mb-1">
                        Organization / Agency *
                      </label>
                      <input
                        id="demo-org"
                        aria-labelledby="demo-org-label"
                        type="text"
                        required
                        value={demoForm.organization}
                        onChange={(e) => setDemoForm({ ...demoForm, organization: e.target.value })}
                        placeholder="Health Network Name"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label id="demo-care-setting-label" htmlFor="demo-care-setting" className="block text-xs font-semibold text-slate-300 mb-1">
                        Primary Care Setting
                      </label>
                      <select
                        id="demo-care-setting"
                        aria-labelledby="demo-care-setting-label"
                        value={demoForm.businessLine}
                        onChange={(e) => setDemoForm({ ...demoForm, businessLine: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      >
                        <option value="home_health">Home Health Agency</option>
                        <option value="hospice">Hospice & Palliative Care</option>
                        <option value="snf">Skilled Nursing (SNF)</option>
                        <option value="irf">Inpatient Rehab (IRF)</option>
                        <option value="health_system">Health System / Hospital</option>
                        <option value="marketing_agency">Healthcare Marketing / Agency</option>
                        <option value="other">Other Healthcare Provider</option>
                      </select>
                    </div>

                    <div>
                      <label id="demo-territory-label" htmlFor="demo-territory" className="block text-xs font-semibold text-slate-300 mb-1">
                        Target Territory (State/Counties)
                      </label>
                      <input
                        id="demo-territory"
                        aria-labelledby="demo-territory-label"
                        type="text"
                        value={demoForm.territory}
                        onChange={(e) => setDemoForm({ ...demoForm, territory: e.target.value })}
                        placeholder="e.g. PA, OH or Erie County"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label id="demo-notes-label" htmlFor="demo-notes" className="block text-xs font-semibold text-slate-300 mb-1">
                      Goals or Specific Questions
                    </label>
                    <textarea
                      id="demo-notes"
                      aria-labelledby="demo-notes-label"
                      rows={2}
                      value={demoForm.notes}
                      onChange={(e) => setDemoForm({ ...demoForm, notes: e.target.value })}
                      placeholder="What specific referral or growth challenges are you looking to solve?"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-3 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <span>Prepare Demo Request</span>
                    </button>
                    <p className="text-[11px] text-slate-400 text-center mt-2">
                      Zero spam. We respect your privacy and never sell contact info.
                    </p>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
