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
      <div 
        className="fixed inset-0 z-[9998] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto overscroll-contain animate-fadeIn"
        style={{
          paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.625rem, env(safe-area-inset-right))',
        }}
      >
        <div 
          className="relative w-full max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[min(92dvh,calc(100vh-1.5rem))] my-auto overflow-hidden text-left"
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-disclosure-title"
        >
          {/* Header Banner - Compact and responsive */}
          <div className="shrink-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 px-4 py-3 sm:px-6 sm:py-4 text-white text-center relative shadow-sm">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/15 border border-white/25 backdrop-blur-md rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-inner">
              <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-blue-100 mb-1 border border-white/20">
              Prominent Location Disclosure
            </span>
            <h2 id="location-disclosure-title" className="text-sm sm:text-base md:text-lg font-black tracking-tight text-white leading-tight">
              Background Location Access Notice
            </h2>
            <p className="text-blue-100 text-[10px] sm:text-xs mt-0.5 leading-snug">
              Required for live vehicle tracking &amp; passenger arrival safety
            </p>
          </div>

          {/* Scrollable Body - Takes remaining space with smooth scrolling */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-3 text-slate-600 leading-relaxed text-xs">
            {/* Core Google Play Policy Statement Box */}
            <div className="p-3 sm:p-3.5 bg-amber-50 border border-amber-300 rounded-xl sm:rounded-2xl shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950 text-[11px] sm:text-xs mb-1">
                    Prominent Disclosure
                  </p>
                  <p className="text-[10.5px] sm:text-[11.5px] text-amber-900 leading-snug font-medium">
                    <strong>Expert GPS Tracking collects location data to enable real-time vehicle tracking, route navigation, and passenger arrival notifications even when the app is closed or not in use.</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Feature Breakdown */}
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Compass className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-[11px] sm:text-xs">Live Vehicle &amp; Trip Tracking</h4>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 leading-tight mt-0.5">
                    Allows dispatchers, schools, and parents to monitor bus coordinates live during scheduled routes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-[11px] sm:text-xs">Active Shifts Only</h4>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 leading-tight mt-0.5">
                    Location is broadcast strictly while on an assigned active trip. No tracking occurs when off-duty or logged out.
                  </p>
                </div>
              </div>
            </div>

            {/* Privacy Promise */}
            <div className="text-[10.5px] sm:text-[11px] text-slate-500 bg-slate-50/80 p-2.5 sm:p-3 rounded-xl border border-slate-100">
              <p className="leading-relaxed">
                🔒 Your location is never sold, never shared with advertisers, and used exclusively for transport coordination. You may revoke this permission at any time in Android Settings.
              </p>
              <button
                type="button"
                onClick={() => setShowPrivacyPolicy(true)}
                className="mt-1.5 text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer transition-colors text-[10.5px] sm:text-[11px]"
              >
                <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                Read our full Privacy Policy
              </button>
            </div>
          </div>

          {/* Action Buttons - Always visible & pinned to bottom */}
          <div className="shrink-0 p-3 sm:p-4 bg-slate-50 border-t border-slate-100 flex flex-row items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onDeny}
              className="w-2/5 sm:w-1/3 min-h-[42px] py-2.5 px-2.5 sm:px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm text-center transition-all active:scale-95 shadow-xs cursor-pointer flex items-center justify-center"
            >
              No, Thanks
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="w-3/5 sm:w-2/3 min-h-[42px] py-2.5 px-3 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm text-center shadow-md shadow-blue-500/25 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Agree &amp; Enable</span>
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
