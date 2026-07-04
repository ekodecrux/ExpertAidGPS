import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, Eye, EyeOff, KeyRound, Lock, LogOut } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

export default function ForcePasswordChange() {
  const { user, userData, logout, refreshUserData } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      if (user) {
        await updatePassword(user, newPassword);
        
        try {
          // Attempt client-side update
          await updateDoc(doc(db, 'users', user.uid), {
            forcePasswordChange: false
          });
        } catch (dbErr: any) {
          console.warn('Client-side Firestore users status update failed, attempting backend fallback:', dbErr);
          // Try backend-assisted update using the user token
          const token = await user.getIdToken(true);
          const response = await fetch('/api/auth/complete-force-password-change', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to complete password change registration');
          }
        }

        await refreshUserData();
        toast.success('Password updated successfully! Welcome to Expert GPS.');
        // The component will automatically unmount because userData.forcePasswordChange becomes false
      }
    } catch (error: any) {
      console.error('Password update failed:', error);
      if (error.code === 'auth/requires-recent-login') {
        toast.error('Please logout and login again to change your password for security.');
      } else {
        toast.error(error.message || 'Failed to update password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4 z-[999] overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
        <div className="p-8 pb-4 text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Security Verification</h2>
          <p className="text-slate-500 text-xs font-medium leading-relaxed">
            Hi{userData?.name ? ` ${userData.name}` : ''}! For your security, you must create a new personal password before accessing the system.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 pt-0 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">New Secure Password</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-12 py-3.5 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                  placeholder="Min 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm New Password</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-12 py-3.5 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                  placeholder="Repeat password"
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
            <ul className="text-[10px] text-blue-700 font-bold space-y-1.5">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                Minimum 8 characters long
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                Include numbers & special characters
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                Keep this safe for future logins
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Finalizing Security..." : "Create My Secret Password"}
            </button>
            <button
              onClick={logout}
              type="button"
              className="w-full py-4 text-slate-400 hover:text-slate-600 font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <LogOut className="w-3 h-3" />
              Sign out instead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
