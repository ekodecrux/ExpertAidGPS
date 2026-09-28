import React from 'react';
import { ShieldCheck, MapPin, ArrowLeft, Lock, Eye, CheckCircle2, Phone, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                Expert GPS Tracking Privacy Policy
              </h1>
              <p className="text-[11px] text-slate-400">Prominent Disclosure &amp; User Data Safety Standards</p>
            </div>
          </div>
          <Link
            to="/"
            className="text-xs font-bold px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Open App
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Prominent Disclosure Alert (Google Play Requirement) */}
        <section className="p-6 bg-amber-50 border-2 border-amber-300 rounded-3xl shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider mb-2">
                Google Play Prominent Disclosure
              </span>
              <h2 className="text-base sm:text-lg font-black text-amber-950 leading-snug">
                Background Location Tracking Disclosure
              </h2>
              <p className="text-sm font-semibold text-amber-900 mt-2 leading-relaxed">
                Expert GPS Tracking collects location data to enable real-time vehicle tracking, route navigation, and passenger arrival notifications <u>even when the app is closed or not in use</u> during assigned driver trips and shifts.
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-amber-950">
                <div className="p-3 bg-white/80 rounded-xl border border-amber-200">
                  <p className="font-bold text-slate-900">Why It Is Needed</p>
                  <p className="text-slate-600 mt-0.5">
                    Enables dispatchers, school administrators, and guardians to see real-time vehicle coordinates and receive accurate pickup/drop-off arrival alerts.
                  </p>
                </div>
                <div className="p-3 bg-white/80 rounded-xl border border-amber-200">
                  <p className="font-bold text-slate-900">When It Is Collected</p>
                  <p className="text-slate-600 mt-0.5">
                    Location is broadcast strictly while an authorized driver has started an active trip sequence. No background tracking occurs when off-duty or logged out.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Complete Policy Details */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-6 text-sm leading-relaxed text-slate-600">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Privacy Policy &amp; Data Governance
            </h2>
            <p className="text-xs text-slate-400 mt-1">Effective Date: September 2026</p>
            <p className="mt-3">
              Expert GPS Tracking is committed to protecting your privacy and ensuring the utmost transparency regarding how user data and device location are processed across our web platform and native Android applications.
            </p>
          </div>

          <hr className="border-slate-100" />

          {/* Section 1 */}
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-blue-600" />
              1. Information We Collect
            </h3>
            <p>Depending on your authorized role (driver, student, parent, or organization administrator), we collect:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-slate-600">
              <li>
                <strong>Precise &amp; Background Geolocation:</strong> GPS coordinates, heading, speed, and timestamps collected via Android Geolocation services during active transit trips.
              </li>
              <li>
                <strong>Account Identity:</strong> Full name, institutional email address, authorized phone number, role tier, and institutional affiliation code.
              </li>
              <li>
                <strong>Fleet Telemetry:</strong> Vehicle registration number, assigned route schedules, stop check-ins, and trip completion metrics.
              </li>
            </ul>
          </div>

          {/* Section 2 */}
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              2. How We Use Location Data
            </h3>
            <p>All geolocation information is accessed strictly to deliver essential transportation logistics services:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-slate-600">
              <li>Live vehicle position tracking on fleet and guardian dashboards.</li>
              <li>Calculating accurate Estimated Times of Arrival (ETAs) at pickup and drop-off points.</li>
              <li>Route adherence alerts and student transit safety verification.</li>
              <li>Emergency dispatch and incident response support.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-blue-600" />
              3. Data Protection, Security &amp; Sharing
            </h3>
            <p>
              We maintain strict technical and organizational safeguards:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-slate-600">
              <li>
                <strong>No Third-Party Advertising:</strong> We never sell, rent, or monetize personal or location data to advertising networks or data brokers.
              </li>
              <li>
                <strong>End-to-End Encryption:</strong> All location and user data is transmitted over encrypted TLS 1.3 connections and stored in secure, access-controlled databases.
              </li>
              <li>
                <strong>Restricted Access:</strong> Only verified members of the same school or corporate organization can view authorized route telemetry.
              </li>
            </ul>
          </div>

          {/* Section 4 */}
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              4. User Consent &amp; Permission Controls
            </h3>
            <p>
              You maintain full control over your device permissions:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-slate-600">
              <li>You may grant or deny location access when prompted by the app&apos;s prominent disclosure dialog.</li>
              <li>You can modify or revoke permissions at any time via Android System Settings (<em>Settings &gt; Apps &gt; Expert GPS Tracking &gt; Permissions &gt; Location</em>).</li>
              <li>Drivers who decline location permission will have trip tracking disabled until permission is restored.</li>
            </ul>
          </div>

          {/* Section 5 */}
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
              <Phone className="w-4 h-4 text-blue-600" />
              5. Contact Information &amp; Data Inquiries
            </h3>
            <p>
              For data access requests, deletion requests, or privacy compliance questions, please contact our Data Governance Officer:
            </p>
            <div className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1">
              <p className="font-bold text-slate-900">Expert Aid GPS Fleet Systems</p>
              <p className="flex items-center gap-2 text-slate-600">
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                Email: <span className="font-semibold text-blue-600">support@expertaid.org</span>
              </p>
              <p className="text-slate-500 text-[11px] mt-1">
                Data Controller: Expert GPS Tracking Platform Administration
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
