import React, { useState } from 'react';
import { Bus, MapPin, Truck, UserCheck, Mail, Lock, LogIn, AlertCircle, Eye, EyeOff, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth as firebaseAuth } from '../lib/firebase';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { getLocalIcon } from '../lib/utils';
import { getBackendUrl, setBackendUrl } from '../lib/apiPatch';

export default function Login() {
  const { login, loginEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(getBackendUrl());

  const [orgs, setOrgs] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<any>(null);

  React.useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const response = await fetch('/api/auth/organizations');
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.organizations)) {
            setOrgs(data.organizations);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch public organizations:", e);
      }
    };
    fetchOrgs();
  }, []);

  const getAutoDetectedOrg = () => {
    if (selectedOrg) return selectedOrg;
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    
    // Check if the user typed an @ domain
    const parts = cleanEmail.split('@');
    if (parts.length > 1 && parts[1]) {
      const domain = parts[1];
      const found = orgs.find(o => {
        const orgId = o.id.toLowerCase();
        const orgName = o.name.toLowerCase();
        return domain.includes(orgId) || orgId.includes(domain.split('.')[0]) || orgName.includes(domain.split('.')[0]);
      });
      if (found) return found;
    } else {
      const typed = parts[0];
      if (typed.length >= 3) {
        const found = orgs.find(o => 
          o.id.toLowerCase().includes(typed) || 
          o.name.toLowerCase().includes(typed)
        );
        if (found) return found;
      }
    }
    return null;
  };

  const getAutoDetectedOrgLogo = (orgObj: any) => {
    if (!orgObj) return null;
    if (orgObj.logoUrl || orgObj.logo) return orgObj.logoUrl || orgObj.logo;
    const isCollege = orgObj.eduType === 'College' || (!orgObj.eduType && (orgObj.name?.toLowerCase().includes('college') || orgObj.name?.toLowerCase().includes('university')));
    const defaultIcon = orgObj.sector === 'Education'
      ? (isCollege ? 'graduation-cap' : 'school')
      : (orgObj.sector === 'Healthcare'
        ? 'hospital'
        : (orgObj.sector === 'Government'
          ? 'museum'
          : 'commercial'));
    return getLocalIcon(defaultIcon);
  };

  const currentOrg = getAutoDetectedOrg();
  const currentLogoUrl = getAutoDetectedOrgLogo(currentOrg);
  const currentName = currentOrg?.name || "Expert GPS Tracking";
  const currentSector = currentOrg ? `${currentOrg.sector || 'Organization'} Portal` : "Fleet Intelligence Platform";

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    
    if (!cleanEmail || !cleanPassword) return toast.error('Please fill in all fields');
    
    setIsSubmitting(true);
    const isOwnerEmail = cleanEmail === "ravikumarpendyala9182@gmail.com";
    
    try {
      await loginEmail(cleanEmail, cleanPassword);
      toast.success('System Authenticated');
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMsg = error.message || '';
      const errorCode = error.code || '';
      
      // Check for API disabled errors (likely from backend or frontend SDK)
      if (errorMsg.includes('identitytoolkit.googleapis.com') || 
          errorMsg.includes('SERVICE_DISABLED') || 
          errorMsg.includes('API_DISABLED') ||
          errorCode === 'auth/operation-not-allowed') {
        
        toast.error((t) => (
          <div className="flex flex-col gap-2 p-1">
            <span className="font-bold flex items-center gap-1 text-red-600">
              <AlertCircle size={14} /> {errorCode === 'auth/operation-not-allowed' ? 'E-mail Sign-in Disabled' : 'System API Disabled'}
            </span>
            <span className="text-[10px] leading-tight">
              {errorCode === 'auth/operation-not-allowed' 
                ? 'Email/Password authentication is not enabled in the Firebase Console. Please enable it in the Authentication -> Sign-in method tab.'
                : 'The Identity Toolkit API must be enabled for this specific Google Cloud project to allow administrative tasks and some logins.'}
            </span>
            <div className="flex gap-2 mt-1">
              <button 
                onClick={() => {
                  const url = errorCode === 'auth/operation-not-allowed'
                    ? "https://console.firebase.google.com/project/_/authentication/providers"
                    : "https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview";
                  window.open(url, "_blank");
                  toast.dismiss(t.id);
                }}
                className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 font-medium"
              >
                Go to Console
              </button>
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        ), { duration: 10000, position: 'top-center' });
      } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password' || errorCode === 'auth/user-not-found' || errorMsg.includes('auth/invalid-credential')) {
        toast.error((t) => (
          <div className="flex flex-col gap-2 p-1">
            <span className="font-bold flex items-center gap-1 text-red-600">
              <AlertCircle size={14} /> Invalid Credentials
            </span>
            <span className="text-[10px] leading-tight">
              Please check your email and security code. If you are a client, use the credentials provided in your invitation.
            </span>
            <div className="flex gap-2 mt-1">
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        ), { duration: 10000 });
      } else {
        toast.error(errorMsg || 'Login failed. Please check credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
      await login();
      toast.success('System Authenticated via Google');
    } catch (error: any) {
      console.error('Google Login error:', error);
      const errorMsg = error.message || '';
      
      if (errorMsg.includes('auth/network-request-failed')) {
        toast.error((t) => (
          <div className="flex flex-col gap-2 p-1">
            <span className="font-bold flex items-center gap-1 text-red-600">
              <AlertCircle size={14} /> Connection Blocked
            </span>
            <span className="text-[10px] leading-tight">
              Firebase Auth failed to connect. This usually happens if an ad-blocker or privacy extension is blocking Google's authentication services.
            </span>
            <div className="flex gap-2 mt-1">
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        ), { duration: 10000 });
      } else if (errorMsg.includes('auth/popup-closed-by-user')) {
        toast.error('Sign-in popup was closed before completion.');
      } else {
        toast.error(errorMsg || 'Google Sign-in failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-3xl"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-md w-full bg-white rounded-[2.25rem] shadow-xl overflow-hidden border border-slate-100/85 z-10 relative">
        <div className="p-6 pb-2 text-center">
            {currentLogoUrl ? (
              <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg p-2.5 transition-all duration-300">
                <img 
                  src={currentLogoUrl} 
                  alt={currentName} 
                  className="w-full h-full object-contain" 
                  referrerPolicy="no-referrer" 
                />
              </div>
            ) : (
              <div className="w-14 h-14 bg-blue-500 rounded-[1.25rem] flex items-center justify-center mx-auto mb-3 shadow-xl shadow-blue-500/20">
                <Bus className="w-7 h-7 text-white" />
              </div>
            )}
            <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-0.5 text-slate-900 transition-all duration-300">{currentName}</h1>
            <p className="text-slate-400 font-bold text-[8px] sm:text-[10px] uppercase tracking-[0.25em] transition-all duration-300">{currentSector}</p>
        </div>

        <div className="px-6 pb-8 pt-3 sm:px-8">
          <form onSubmit={handleEmailLogin} className="space-y-3 sm:space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight pl-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@agency.com" 
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all text-slate-800"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Security Code</label>
                <button 
                  type="button"
                  onClick={() => {
                    setResetEmail(email.trim());
                    setIsResetModalOpen(true);
                  }}
                  className="text-[9px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-tighter flex items-center gap-1.5"
                >
                  Forgot Code?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-slate-900 text-white font-black text-[9px] sm:text-[10px] uppercase tracking-[0.2em] py-3.5 rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95 disabled:opacity-50 border border-white/10 mt-1 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 mr-3" />
              {isSubmitting ? 'Authenticating...' : 'Commence Session'}
            </button>
          </form>
        </div>
      </div>

      {/* Reset Security Code Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsResetModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
            />
            
            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden z-10"
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-2.5 flex-1 select-none">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight">Reset Security Code</h2>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mt-0.5">Account Recovery</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const cleanResetEmail = resetEmail.trim().toLowerCase();
                  if (!cleanResetEmail) {
                    toast.error('Please enter your email address');
                    return;
                  }

                  setIsResetting(true);
                  try {
                    // Try the server-side recovery API first
                    const response = await fetch('/api/auth/forgot-password', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ email: cleanResetEmail })
                    });

                    if (!response.ok) {
                      const errData = await response.json().catch(() => ({}));
                      throw new Error(errData.error || 'Server password reset failed');
                    }

                    const data = await response.json();
                    if (data.success) {
                      if (data.emailSent) {
                        toast.success('Security reset details sent successfully! Please check your inbox.');
                      } else if (data.credentials) {
                        // Direct display of temporary credentials because SMTP is not configured in this sandbox environment!
                        toast.success((t) => (
                          <div className="flex flex-col gap-1.5 p-1 text-slate-800">
                            <span className="font-bold">SMTP Mailer Not Set Up Yet</span>
                            <span className="text-[10px] text-slate-500 leading-tight">
                              We reset your password securely on the server! Since no SMTP is configured in settings, your temporary access code is:
                            </span>
                            <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 mt-1 select-all font-mono text-center font-bold text-slate-900 border-dashed text-sm">
                              {data.credentials.password}
                            </div>
                            <span className="text-[9px] text-slate-400">
                              (Copy this code and use it as your Security Code value to log in)
                            </span>
                          </div>
                        ), { duration: 25000, position: 'top-center' });
                      } else {
                        toast.success('Security reset link sent successfully! Please check your inbox.');
                      }
                      setIsResetModalOpen(false);
                    } else {
                      throw new Error(data.error || 'Failed to send reset code');
                    }
                  } catch (err: any) {
                    console.error('Password reset link failed:', err);
                    
                    // Fallback to client-side firebase call just in case
                    try {
                      await sendPasswordResetEmail(firebaseAuth, cleanResetEmail);
                      toast.success('Security reset link requested via Firebase. Please check your inbox.');
                      setIsResetModalOpen(false);
                    } catch (fbErr: any) {
                      console.error('Firebase fallback reset email failed:', fbErr);
                      toast.error(err.message || 'Failed to reset access code. Please verify the email address.');
                    }
                  } finally {
                    setIsResetting(false);
                  }
                }}
                className="p-6 space-y-4"
              >
                <p className="text-xs text-slate-500 leading-relaxed">
                  Provide your registered email address to receive a secure link. Using this link you will be able to restore your access code.
                </p>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight pl-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="name@agency.com" 
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all text-slate-800"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isResetting ? (
                      <>
                        <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FeatureItem({ icon: Icon, label }: { icon: any, label: string }) {
  return (
    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
      <Icon className="w-5 h-5 text-blue-600 mb-2" />
      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</span>
    </div>
  );
}
