import React from 'react';
import { X, ShieldCheck, MapPin, Lock, Eye, CheckCircle2 } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Privacy Policy</h2>
              <p className="text-[11px] text-slate-400">Expert GPS Tracking & Fleet Management</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed">
          <div>
            <p className="font-semibold text-slate-800 text-sm mb-1">Last Updated: September 2026</p>
            <p>
              This Privacy Policy describes how Expert GPS Tracking (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, stores, and protects your information when you use our mobile application and fleet management platform.
            </p>
          </div>

          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-blue-900 text-xs mb-1">
                  Prominent Disclosure: Background Location Tracking
                </h3>
                <p className="text-[11px] text-blue-800 leading-normal">
                  Expert GPS Tracking collects location data to enable real-time vehicle tracking, route navigation, and passenger arrival notifications <strong>even when the app is closed or not in use</strong> during active trips and driving shifts.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              1. Information We Collect
            </h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Precise &amp; Background Geolocation:</strong> When logged in as an authorized driver during an active trip, we collect precise GPS coordinates continuously (including when minimized or with the screen off) to project vehicle location onto authorized student, parent, and dispatcher maps.
              </li>
              <li>
                <strong>Account Credentials:</strong> Name, work email address, telephone number, and organization identifier assigned by your institution or company administrator.
              </li>
              <li>
                <strong>Vehicle &amp; Route Telemetry:</strong> Speed, route stop completion, trip start and finish timestamps.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              2. How We Use Your Location Data
            </h3>
            <p>Location data is strictly used for the operational safety and coordination of transport fleets:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>Live vehicle position tracking on fleet and guardian dashboards.</li>
              <li>Calculating accurate Estimated Times of Arrival (ETAs) at pickup and drop-off points.</li>
              <li>Route adherence alerts and student transit safety verification.</li>
              <li>Emergency dispatch and incident response support.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              3. Data Protection &amp; Third-Party Sharing
            </h3>
            <p>
              We do <strong>not</strong> sell, rent, or monetize your location data. We do <strong>not</strong> use your location data for targeted advertising or user profiling. Location data is encrypted in transit using Transport Layer Security (TLS 1.3) and stored securely with strict role-based access controls.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              4. User Rights &amp; Location Permission Control
            </h3>
            <p>
              You can grant, deny, or revoke location permissions at any time through your Android device settings (<em>Settings &gt; Apps &gt; Expert GPS Tracking &gt; Permissions &gt; Location</em>). Please note that active trip tracking features for drivers require location access to function.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1">
              5. Contact Us
            </h3>
            <p>
              If you have any questions or concerns regarding our privacy practices or location data handling, please contact our Data Protection Officer at:
            </p>
            <p className="mt-1 text-blue-600 font-semibold">
              support@expertaid.org / privacy@expertaid.org
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
          >
            Close Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
}
