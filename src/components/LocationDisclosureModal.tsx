import React, { useState } from 'react';
import { MapPin, ShieldCheck, Compass, AlertCircle, FileText, Check } from 'lucide-react';
import PrivacyPolicyModal from './PrivacyPolicyModal';

interface LocationDisclosureModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDeny: () => void;
  requiredForRole?: string;
}

export default function LocationDisclosureModal({
  isOpen,
  onAccept,
  onDeny,
  requiredForRole = 'driver'
}: LocationDisclosureModalProps) {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
          {/* Header Banner */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white text-center relative">
            <div className="w-16 h-16 bg-white/15 border border-white/25 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <MapPin className="w-8 h-8 text-white animate-bounce" />
            </div>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-500/40 text-[10px] font-bold uppercase tracking-wider text-blue-100 mb-1 border border-blue-400/30">
              Prominent Location Disclosure
            </span>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
              Background Location Access Notice
            </h2>
            <p className="text-blue-100 text-xs mt-1">
              Required for live vehicle tracking &amp; passenger safety
            </p>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed overflow-y-auto max-h-[60vh]">
            {/* Core Google Play Policy Statement Box */}
            <div className="p-4 bg-amber-50 border-2 border-amber-300/80 rounded-2xl">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950 text-xs mb-1">
                    Prominent Disclosure
                  </p>
                  <p className="text-[11px] text-amber-900 leading-snug font-medium">
                    <strong>Expert GPS Tracking collects location data to enable real-time vehicle tracking, route navigation, and passenger arrival notifications even when the app is closed or not in use.</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Feature Breakdown */}
            <div className="space-y-2.5">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs">Live Vehicle &amp; Trip Tracking</h4>
                  <p className="text-[11px] text-slate-500">
                    Allows dispatchers, schools, and parents to monitor bus coordinates live during scheduled routes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs">Active Shift Only</h4>
                  <p className="text-[11px] text-slate-500">
                    Location is broadcast strictly while on an assigned active trip. No tracking occurs when off-duty.
                  </p>
                </div>
              </div>
            </div>

            {/* Privacy Promise */}
            <div className="text-[11px] text-slate-500 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              <p>
                🔒 Your location is never sold, never shared with advertisers, and used exclusively for transport coordination. You may revoke this permission at any time in Android Settings.
              </p>
              <button
                type="button"
                onClick={() => setShowPrivacyPolicy(true)}
                className="mt-2 text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Read our full Privacy Policy
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onDeny}
              className="w-full sm:w-1/3 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors text-center cursor-pointer"
            >
              No, Thanks
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="w-full sm:w-2/3 py-3 px-4 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 transition-colors text-center cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Agree &amp; Enable Location
            </button>
          </div>
        </div>
      </div>

      <PrivacyPolicyModal
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />
    </>
  );
}
