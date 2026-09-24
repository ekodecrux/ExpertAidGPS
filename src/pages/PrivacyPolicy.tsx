import React from 'react';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-800">
      <article className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 shadow-xl sm:p-10">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Expert GPS Tracking</p>
        <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-xs font-semibold text-slate-400">Last updated: September 11, 2026</p>

        <section className="mt-8 space-y-5 text-sm leading-6">
          <p>Expert GPS Tracking provides route management, driver trip tracking, vehicle location updates, and authorized rider notifications for participating organizations.</p>
          <h2 className="text-lg font-black text-slate-900">Location information</h2>
          <p>When a driver starts the driver-tracking experience and grants permission, the app collects the device location needed to show the assigned vehicle on the organization’s live route map and to update an active trip. Location is sent to the organization’s Expert GPS Tracking account and is not used for advertising.</p>
          <h2 className="text-lg font-black text-slate-900">Use and sharing</h2>
          <p>Location and trip information is used to operate the assigned route, provide safety and coordination features, maintain trip records, and support authorized organization administrators and riders. We do not sell location information.</p>
          <h2 className="text-lg font-black text-slate-900">Your choices</h2>
          <p>You may deny location permission or disable it in Android settings. Without location permission, live driver tracking cannot operate. You may stop tracking by ending the active trip or signing out.</p>
          <h2 className="text-lg font-black text-slate-900">Security and retention</h2>
          <p>Access to account and trip information is restricted by authentication and organization permissions. Organizations control operational retention of route and trip records according to their own requirements.</p>
          <h2 className="text-lg font-black text-slate-900">Contact</h2>
          <p>For privacy questions or requests, contact the organization that issued your Expert GPS Tracking account.</p>
        </section>
      </article>
    </main>
  );
}
