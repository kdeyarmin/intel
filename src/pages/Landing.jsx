import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
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

  const [annualBilling, setAnnualBilling] = useState(false);
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
  const [demoSending, setDemoSending] = useState(false);
  const [demoError, setDemoError] = useState('');
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

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setDemoError('');
    setDemoSending(true);
    try {
      const res = await fetch('/api/public/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Your request could not be sent.');
      }
      setDemoSubmitted(true);
    } catch (err) {
      setDemoError(`${err.message} Please email sales@caremetricintel.com and we'll set up your walkthrough.`);
    } finally {
      setDemoSending(false);
    }
  };

  const closeDemoModal = () => {
    setDemoModalOpen(false);
    setTimeout(() => {
      setDemoSubmitted(false);
      setDemoError('');
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
      <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-teal-950 border-b border-cyan-500/20 px-4 py-2 text-center text-xs text-cyan-300">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
          <span>14-day free trial, no credit card required</span>
          <span className="hidden sm:inline text-slate-400">•</span>
          <a href="#pricing" className="underline hover:text-white font-semibold">
            See plans →
          </a>
        </span>
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#07356f]/95 backdrop-blur-md border-b border-blue-400/20 shadow-lg shadow-black/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link to="/landing" className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-lg p-1">
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1">
                CareMetric <span className="text-cyan-400">Intel</span>
              </span>
              <span className="text-[10px] tracking-widest text-slate-400 uppercase font-semibold">
                Provider Intelligence
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav aria-label="Main Navigation" className="hidden xl:flex items-center gap-4 text-xs font-medium text-slate-300">
            <a href="#features" className="hover:text-cyan-400 transition-colors">Features</a>
            <a href="#who-its-for" className="hover:text-cyan-400 transition-colors">Who It's For</a>
            <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">How It Works</a>
            <a href="#comparison" className="hover:text-cyan-400 transition-colors">Comparison</a>
            <a href="#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">FAQ</a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg border border-slate-700/80 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 rounded-lg shadow-md shadow-cyan-900/40 transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
        {/* Glow ambient effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-600/10 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 left-1/4 w-[350px] h-[300px] bg-teal-500/10 blur-[120px] pointer-events-none rounded-full" />

        <div className="relative text-center max-w-4xl mx-auto">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs sm:text-sm font-medium mb-8 shadow-inner">
            <Sparkles className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Provider Intelligence & Referral Mapping</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
            Stop guessing which providers to target.{' '}
            <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-blue-400 bg-clip-text text-transparent">
              Turn CMS & NPPES data
            </span>{' '}
            into ranked leads, referral maps, and AI insights.
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            CareMetric Intel turns public NPPES, CMS, and Census files into ranked target lists, referral maps, and outreach plans for home health, hospice, and post-acute business development teams.
          </p>

          {/* Dual CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/login?signup=true"
              className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 rounded-xl shadow-lg shadow-cyan-900/40 transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-500 flex items-center justify-center gap-2"
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
              Cancel anytime
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Built on public CMS & NPPES data
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              No patient-level data
            </span>
          </div>
        </div>

        {/* Hero Interactive UI Preview Card */}
        <div className="mt-14 relative max-w-5xl mx-auto">
          <div className="relative rounded-2xl border border-slate-800 bg-[#0e1626]/90 p-4 sm:p-6 shadow-2xl backdrop-blur-xl">
            {/* Window Chrome Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs text-slate-400 ml-2 font-mono">CareMetric Intel • Provider Intelligence & Lead Scoring</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-amber-950/70 border border-amber-500/40 text-amber-300">
                  Sample data (fictional provider)
                </span>
              </div>
            </div>

            {/* Provider Card Mockup */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Doctor Profile & Score */}
              <div className="lg:col-span-7 bg-[#131d31] rounded-xl p-5 border border-slate-700/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-600 to-teal-700 flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0">
                      DV
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white">Dr. Marcus Vance, MD</h2>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 border border-cyan-500/30 text-cyan-300 uppercase tracking-wide">
                          Individual
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium">Cardiovascular Disease & Internal Medicine</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span>Lakeside, PA • Illustrative record</span>
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
                <div className="mt-5 grid grid-cols-3 gap-2.5 pt-4 border-t border-slate-700/60">
                  <div className="bg-[#0b1220] p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Home Health Certs</span>
                    <span className="text-base font-bold text-white">142</span>
                    <span className="text-[10px] text-emerald-400 block">G0180/G0179 Top 5%</span>
                  </div>
                  <div className="bg-[#0b1220] p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Care Plan Oversight</span>
                    <span className="text-base font-bold text-white">38 Benes</span>
                    <span className="text-[10px] text-cyan-400 block">Active Chronic Mgmt</span>
                  </div>
                  <div className="bg-[#0b1220] p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Hospital Affiliation</span>
                    <span className="text-base font-bold text-white">Lakeside Regional</span>
                    <span className="text-[10px] text-slate-400 block">Primary facility</span>
                  </div>
                </div>

                {/* AI Outreach Angle Box */}
                <div className="mt-4 p-3.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 mb-1.5">
                    <Bot className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    <span>AI Suggested Outreach Angle</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    "Dr. Vance certifies a high volume of home health episodes for cardiopulmonary patients. Lead with your CHF in-home program and how quickly your team starts care after discharge."
                  </p>
                </div>
              </div>

              {/* Right Column: Mini Referral Network & Quick Actions */}
              <div className="lg:col-span-5 flex flex-col justify-between bg-[#131d31] rounded-xl p-5 border border-slate-700/60">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Network className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                      Referral Network & Leakage
                    </span>
                    <span className="text-[10px] text-cyan-400 font-medium">CMS Shared Patients</span>
                  </div>

                  {/* Referral Flow Nodes */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-[#0b1220] border border-slate-800">
                      <span className="text-slate-300 font-medium">Lakeside Regional Hospital</span>
                      <span className="text-emerald-400 font-semibold font-mono">184 Transfers</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[#0b1220] border border-slate-800">
                      <span className="text-slate-300 font-medium">Bayview Medical Center</span>
                      <span className="text-cyan-400 font-semibold font-mono">72 Transfers</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-[#0b1220] border border-slate-800">
                      <span className="text-slate-300 font-medium">Local SNF Discharge Pool</span>
                      <span className="text-amber-400 font-semibold font-mono">41 Shared Benes</span>
                    </div>
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
              <div className="text-3xl sm:text-4xl font-extrabold text-cyan-400">6.2M+</div>
              <p className="mt-1 text-sm text-slate-400 font-medium">Verified Providers (NPPES)</p>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-teal-400">46M+</div>
              <p className="mt-1 text-sm text-slate-400 font-medium">Medicare Facility Claims</p>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-white">3,140+</div>
              <p className="mt-1 text-sm text-slate-400 font-medium">US Counties & ACS Demand</p>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400">4.2x</div>
              <p className="mt-1 text-sm text-slate-400 font-medium">Faster Lead Prioritization</p>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For Section */}
      <section id="who-its-for" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Purpose-Built Intelligence</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
            Designed for healthcare growth & business development leaders
          </h2>
          <p className="mt-4 text-slate-300 text-base sm:text-lg">
            Generic B2B contact lists fail in healthcare. CareMetric Intel provides clinical claims context, cert tracking, and referral pathways tailored to your specific care setting.
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
                Stop visiting physicians who never sign home health orders. Find doctors with high G0180/G0179 certification volumes and track hospital discharge destinations.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Physician certification claim counts</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Care plan oversight beneficiaries</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Hospital discharge source mapping</span>
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
                Identify oncologists, pulmonologists, and geriatric specialists managing advanced illness patients. Build compliant clinical referral relationships earlier.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
                <span>High-acuity specialty targeting</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
                <span>County chronic disease mortality trends</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
                <span>Long-term care & hospital linkage</span>
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
                Analyze acute care discharge patterns to protect census. Detect referral leakage from key health systems to competing facilities in your county.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Discharge setting mix by county</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Hospital-to-facility patient flow</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Local bed utilization & saturation</span>
              </li>
            </ul>
          </div>

          {/* Segment 4: Healthcare BD & Marketing Teams */}
          <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-5">
                <Users className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">BD, Sales & Marketing Teams</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Equip liaisons and sales reps with verified provider lists, collaborative call sheets, and AI-crafted clinical value propositions that get meetings booked.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-slate-400 border-t border-slate-800 pt-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Multi-seat rep assignment & notes</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>AI clinical pitch angle generator</span>
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
              How CareMetric Intel turns raw healthcare datasets into growth
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg">
              From continuous CMS data ingestion to closed referral partnerships in four simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            {/* Step 1 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-950 text-cyan-400 font-bold flex items-center justify-center text-sm border border-cyan-500/30 mb-5">
                01
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Ingest Fresh Data</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Automated background crawlers ingest weekly NPPES updates, CMS Care Compare quality files, Order & Referring catalogs, and Census ACS demographics.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-teal-950 text-teal-400 font-bold flex items-center justify-center text-sm border border-teal-500/30 mb-5">
                02
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Score & Prioritize</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Our multi-factor scoring engine ranks clinicians based on verified certification volume, specialty taxonomy alignment, patient acuity, and your target geography.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-950 text-cyan-400 font-bold flex items-center justify-center text-sm border border-cyan-500/30 mb-5">
                03
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Build Target Lists</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Filter millions of records down to high-yield target lists. Segment by county or hospital affiliation, assign to field reps, and organize call sheets.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-emerald-950 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30 mb-5">
                04
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Engage & Outreach</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Generate clinical pitch angles with the built-in AI Assistant. Launch multi-touch outreach sequences and track relationship milestones.
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
            Everything your business development team needs to dominate your market
          </h2>
          <p className="mt-4 text-slate-300 text-base sm:text-lg">
            CareMetric Intel combines deep healthcare registry files, interactive network graphs, and intelligent sales tooling in one unified workspace.
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
              Access comprehensive dossiers for over 6 million clinicians and facilities. Inspect primary practice vs. mailing addresses, NPI taxonomies, state licenses, and Medicare enrollment status.
            </p>
            <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
              Verified NPPES & CMS Data →
            </span>
          </div>

          {/* Feature 2 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-teal-950/80 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-6">
              <Network className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Referral Network Mapping</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Uncover who actually influences post-acute decisions. Directional network graphs show shared-patient pathways between hospitals, physicians, and PAC providers with leakage alerts.
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
            <h3 className="text-xl font-bold text-white mb-3">County & Territory Intel</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Evaluate regional post-acute market saturation, Medicare FFS beneficiary density, and Census demographic demand projections across all 3,140+ US counties.
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
              Never waste time on cold outreach again. Configurable algorithms rank providers by cert volume, geographic proximity, and specialty alignment into organized team lead lists.
            </p>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              Automated Weekly Lead Refresh →
            </span>
          </div>

          {/* Feature 5 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6">
              <Bot className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Healthcare AI Assistant</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Ask natural-language questions about your market, draft clinician-specific outreach angles, and generate competitive intelligence briefs in seconds.
            </p>
            <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
              Tuned for Healthcare BD Workflows →
            </span>
          </div>

          {/* Feature 6 */}
          <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 hover:border-cyan-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-teal-950/80 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-6">
              <PhoneCall className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Call Sheets & Campaigns</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Equip your field reps with daily call sheets, log meeting notes, launch multi-touch email sequences, and track partner conversion pipelines from first touch to active referrer.
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
              Why healthcare teams switch from legacy vendors
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg">
              Enterprise platforms charge tens of thousands for rigid contracts and generic data. CareMetric Intel delivers modern, specialized healthcare intelligence at fair, transparent pricing.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0f172a] shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#131d31]">
                  <th scope="col" className="p-4 sm:p-5 text-sm font-semibold text-slate-300">Feature / Capability</th>
                  <th scope="col" className="p-4 sm:p-5 text-sm font-bold text-cyan-400 bg-cyan-950/30 border-x border-cyan-500/20">
                    CareMetric Intel
                  </th>
                  <th scope="col" className="p-4 sm:p-5 text-sm font-medium text-slate-400">Definitive Healthcare</th>
                  <th scope="col" className="p-4 sm:p-5 text-sm font-medium text-slate-400">ZoomInfo</th>
                  <th scope="col" className="p-4 sm:p-5 text-sm font-medium text-slate-400">CarePrecise / CSV Dumps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Annual Pricing & Contracts</th>
                  <td className="p-4 sm:p-5 font-bold text-cyan-300 bg-cyan-950/20 border-x border-cyan-500/20">
                    From $199/mo (Cancel anytime)
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">$30,000–$50,000+/year lock-in</td>
                  <td className="p-4 sm:p-5 text-slate-400">$15,000+/year minimum</td>
                  <td className="p-4 sm:p-5 text-slate-400">$669–$1,259 one-time per file</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Physician Home Health Certs (G0180/G0179)</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    ✓ Full claim & bene counts
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Add-on module required ($$)</td>
                  <td className="p-4 sm:p-5 text-red-400">✗ Not available</td>
                  <td className="p-4 sm:p-5 text-slate-400">Raw claim dumps (unparsed)</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Interactive Referral Network Graphs</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    ✓ Built-in directional graphs
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Limited tabular reports</td>
                  <td className="p-4 sm:p-5 text-red-400">✗ Not available</td>
                  <td className="p-4 sm:p-5 text-red-400">✗ No software interface</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">AI Clinical Outreach Angles</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    ✓ Built-in Healthcare AI Assistant
                  </td>
                  <td className="p-4 sm:p-5 text-red-400">✗ Not available</td>
                  <td className="p-4 sm:p-5 text-slate-400">Generic sales copilot</td>
                  <td className="p-4 sm:p-5 text-red-400">✗ No software interface</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">Update Frequency</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    ✓ Continuous weekly sync
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">Quarterly releases</td>
                  <td className="p-4 sm:p-5 text-slate-400">Varies by corporate data</td>
                  <td className="p-4 sm:p-5 text-amber-400">Static (outdated immediately)</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 sm:p-5 font-medium text-slate-200">User Seats & Collaboration</th>
                  <td className="p-4 sm:p-5 font-semibold text-emerald-400 bg-cyan-950/20 border-x border-cyan-500/20">
                    ✓ Multi-seat call sheets & lists
                  </td>
                  <td className="p-4 sm:p-5 text-slate-400">High per-seat pricing</td>
                  <td className="p-4 sm:p-5 text-slate-400">High per-credit model</td>
                  <td className="p-4 sm:p-5 text-slate-400">Raw spreadsheets only</td>
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
            High-yield healthcare intelligence without enterprise extortion
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
                  <span>Full access to 6.2M+ provider directory</span>
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
          <div className="bg-gradient-to-b from-[#132238] to-[#0f172a] rounded-3xl p-8 border-2 border-cyan-500/80 shadow-2xl shadow-cyan-950/60 flex flex-col justify-between relative transform lg:-translate-y-2">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-cyan-500 to-teal-500 text-white uppercase tracking-wider shadow">
              Most Popular
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Professional</h3>
                <span className="text-xs text-cyan-300 font-medium">Growth teams</span>
              </div>
              <p className="text-xs text-slate-300 mb-6 min-h-[36px]">
                Full state or multi-county intelligence with physician cert tracking, referral networks, and AI outreach angles.
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
                  <span><strong>Referral Network Graphs</strong> & hospital source mapping</span>
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
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 shadow-lg shadow-cyan-900/50 block text-center transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                National territory coverage, custom scoring algorithms, REST API access, and dedicated account management.
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
                  <span><strong>Full REST API & CRM Connectors</strong> (Salesforce, HubSpot)</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Custom scoring rule formulas & weightings</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>White-label exports & automated scheduled briefs</span>
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

      {/* Testimonials & Social Proof */}
      <section id="testimonials" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#0b101d] border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Customer Validation</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
              Trusted by healthcare business development leaders
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg">
              Here is what operators in home health, hospice, and skilled nursing say about CareMetric Intel.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Review 1 */}
            <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 flex flex-col justify-between">
              <p className="text-sm text-slate-300 leading-relaxed italic mb-6">
                "Before CareMetric, our liaisons wasted half their time knocking on offices of doctors who hadn't certified a home health patient in years. Now we know the exact G0180 cert volume before setting foot in the clinic. Our conversion rate jumped 40% in quarter one."
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <div className="w-10 h-10 rounded-full bg-cyan-900/60 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-bold text-sm">
                  SJ
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Sarah Jenkins</h3>
                  <p className="text-xs text-slate-400">VP of Business Development, Keystone Health Network</p>
                </div>
              </div>
            </div>

            {/* Review 2 */}
            <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 flex flex-col justify-between">
              <p className="text-sm text-slate-300 leading-relaxed italic mb-6">
                "We were paying $38,000 annually for Definitive Healthcare and barely using 10% of it. CareMetric gave our 6-person BD team everything we actually need—especially the hospital discharge destination mapping—at a fraction of the cost."
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <div className="w-10 h-10 rounded-full bg-teal-900/60 border border-teal-500/30 flex items-center justify-center text-teal-300 font-bold text-sm">
                  DR
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">David Rodriguez</h3>
                  <p className="text-xs text-slate-400">Chief Growth Officer, Horizon Post-Acute Care</p>
                </div>
              </div>
            </div>

            {/* Review 3 */}
            <div className="bg-[#0f172a] rounded-2xl p-7 border border-slate-800 flex flex-col justify-between">
              <p className="text-sm text-slate-300 leading-relaxed italic mb-6">
                "The AI outreach angles are game-changers. Instead of sending generic brochures, our liaisons walk into oncology and pulmonology practices with tailored clinical discussion points rooted in real patient readmission data."
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <div className="w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-sm">
                  ER
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Elena Rostova</h3>
                  <p className="text-xs text-slate-400">Director of Provider Relations, St. Jude Hospice Group</p>
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
              q: 'Where does CareMetric Intel get its healthcare provider data?',
              a: 'CareMetric Intel synthesizes official, publicly reported healthcare datasets including the National Plan and Provider Enumeration System (NPPES), Centers for Medicare & Medicaid Services (CMS) Provider of Services, Medicare Physician & Other Practitioners Utilization files, Order & Referring catalogs, and U.S. Census Bureau ACS demographic tables.',
            },
            {
              q: 'How frequently is the database updated?',
              a: 'NPPES files are updated weekly and monthly to capture newly registered clinicians and practice location changes. CMS physician certification and post-acute utilization datasets are continuously synchronized against the latest CMS catalog releases.',
            },
            {
              q: 'Does CareMetric store or process any Protected Health Information (PHI)?',
              a: 'No. CareMetric Intel strictly processes aggregate public provider records, facility profiles, and de-identified Medicare billing summaries. We never handle patient-level clinical records, EHR data, or Protected Health Information (PHI). The platform is 100% compliant with HIPAA public intelligence standards.',
            },
            {
              q: 'How does CareMetric differ from Definitive Healthcare or ZoomInfo?',
              a: 'Definitive Healthcare charges upwards of $30,000 to $50,000+ per year on strict multi-year contracts with heavy enterprise bloat. ZoomInfo is a horizontal sales tool with no concept of physician Medicare certs (G0180) or post-acute referral leakage. CareMetric Intel is built specifically for post-acute BD teams with transparent, accessible pricing starting at $199/mo.',
            },
            {
              q: 'What is included in the 14-day free trial?',
              a: 'Your free trial includes full access to your selected territory, provider and facility search, lead scoring algorithms, list management, and the AI Assistant. No credit card is required to begin, and you can invite team members to collaborate immediately.',
            },
            {
              q: 'Can I add additional counties or change my territory later?',
              a: 'Yes. You can expand from a local County Pack to a multi-county or full-state plan at any time directly through the Billing settings inside your account.',
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
        <div className="relative rounded-3xl bg-gradient-to-r from-cyan-950 via-[#0e172a] to-teal-950 p-8 sm:p-14 border border-cyan-500/30 overflow-hidden text-center shadow-2xl">
          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Ready to transform your healthcare business development?
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
              Start your 14-day free trial or schedule a 15-minute territory walkthrough with our healthcare intelligence specialists.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/login?signup=true"
                className="w-full sm:w-auto px-8 py-3.5 text-base font-bold text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 rounded-xl shadow-lg shadow-cyan-900/50 transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                <span className="text-xl font-bold text-white tracking-tight">
                  CareMetric <span className="text-cyan-400">Intel</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Precision provider intelligence, Medicare certification tracking, and referral network analytics for home health, hospice, and post-acute care teams.
              </p>
              <div className="pt-2 text-xs text-slate-400 space-y-1">
                <p>Support: <a href="mailto:support@caremetricintel.com" className="text-cyan-400 hover:underline">support@caremetricintel.com</a></p>
                <p>Sales: <a href="mailto:sales@caremetricintel.com" className="text-cyan-400 hover:underline">sales@caremetricintel.com</a></p>
              </div>
            </div>

            {/* Links: Platform */}
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">Platform</h3>
              <ul className="space-y-2.5 text-xs">
                <li><a href="#features" className="hover:text-cyan-400 transition-colors">Provider Directory</a></li>
                <li><a href="#features" className="hover:text-cyan-400 transition-colors">Referral Networks</a></li>
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
              <strong>Data & Compliance Disclaimer:</strong> CareMetric Intel aggregates and synthesizes public data releases published by the Centers for Medicare & Medicaid Services (CMS), the National Plan and Provider Enumeration System (NPPES), and the U.S. Census Bureau under public record provisions and the Freedom of Information Act (FOIA). CareMetric does not store or process Protected Health Information (PHI). All data points represent public provider practice summaries, enrollment statuses, and historical utilization benchmarks.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 text-[11px] text-slate-400">
              <p>© {new Date().getFullYear()} CareMetric Intel. All rights reserved.</p>
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
                    Request a CareMetric Intel Demo
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    See live physician certification volumes, referral pathways, and lead scores for your target county.
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
                      className="w-full py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md transition-all text-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
