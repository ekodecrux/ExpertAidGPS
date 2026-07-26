import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import toast from 'react-hot-toast';

interface UserData {
  uid: string;
  id?: string; // Add id for legacy/utility compatibility
  email: string;
  name: string;
  role: 'super_admin' | 'org_admin' | 'driver' | 'user';
  orgId: string | null;
  orgSector?: string;
  avatarUrl: string | null;
  phone?: string | null;
  userType?: 'student' | 'parent' | 'staff' | 'employee' | 'other';
  forcePasswordChange?: boolean;
  routeId?: string | null;
  pickupPointId?: string | null; // Added
  vehicleId?: string | null;
  notifications?: { message: string; timestamp: string; type: string; dismissed?: boolean }[];
}

interface AuthContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  login: () => Promise<void>;
  loginEmail: (email: string, pass: string) => Promise<void>;
  signUpEmail: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function sanitizeUserData(data: any): any {
  if (!data) return null;
  let notifications = data.notifications;
  if (typeof notifications === 'string') {
    try {
      notifications = JSON.parse(notifications);
    } catch (e) {
      notifications = [];
    }
  }
  if (!Array.isArray(notifications)) {
    notifications = [];
  }
  return {
    ...data,
    notifications
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userDataState, setUserDataState] = useState<UserData | null>(null);
  const setUserData = (data: any) => setUserDataState(sanitizeUserData(data));
  const userData = userDataState;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      const isSigningIn = sessionStorage.getItem('is_signing_in') === 'true';
      
      let currentUser = firebaseUser;
      let token = "";
      
      if (!currentUser) {
        const fallbackToken = localStorage.getItem("expert_gps_fallback_token");
        const fallbackUserStr = localStorage.getItem("expert_gps_fallback_user");
        if (fallbackToken && fallbackUserStr) {
          try {
            const fUser = JSON.parse(fallbackUserStr);
            currentUser = {
              uid: fUser.uid,
              email: fUser.email,
              displayName: fUser.name,
              getIdToken: async () => fallbackToken
            } as any;
            token = fallbackToken;
          } catch (e) {}
        }
      }

      setUser(currentUser);
      
      if (currentUser) {
        // OPTIMIZATION: Optimistically load cached user data first so that the user interface
        // loads and displays content instantly, bypassing server verify-user network cold starts!
        const cachedDataStr = localStorage.getItem(`expert_gps_user_${currentUser.uid}`);
        if (cachedDataStr) {
          try {
            const cachedUserData = JSON.parse(cachedDataStr);
            setUserData(cachedUserData);
            setLoading(false);
          } catch (e) {
            console.warn("Error parsing cached user data:", e);
          }
        }

        if (isSigningIn) {
          // Skip verification during sign-in, since the login functions handle it and set states.
          return;
        }
        try {
          if (!token) {
            token = await currentUser.getIdToken(true);
          }
          const response = await fetch('/api/auth/verify-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            const errResult = await response.json().catch(() => ({ error: 'Verification failed' }));
            console.warn("User verification check failed:", errResult.error);
            setUserData(null);
            setUser(null);
            localStorage.removeItem("expert_gps_fallback_token");
            localStorage.removeItem("expert_gps_fallback_user");
            if (auth.currentUser) {
              await signOut(auth).catch(() => {});
            }
            if (!isSigningIn) {
              toast.error(errResult.error || "Access Denied.");
            }
            setLoading(false);
            return;
          }

          const result = await response.json();
          if (result.success && result.userData) {
            setUserData(result.userData);
            localStorage.setItem(`expert_gps_user_${currentUser.uid}`, JSON.stringify(result.userData));
          } else {
            setUserData(null);
            setUser(null);
            localStorage.removeItem(`expert_gps_user_${currentUser.uid}`);
            localStorage.removeItem("expert_gps_fallback_token");
            localStorage.removeItem("expert_gps_fallback_user");
            if (auth.currentUser) {
              await signOut(auth).catch(() => {});
            }
            if (!isSigningIn) {
              toast.error(result.error || "No user found.");
            }
          }
          setLoading(false);
        } catch (error: any) {
          console.error("Error verifying user session:", error);
          const isSignin = sessionStorage.getItem('is_signing_in') === 'true';
          const cachedDataStr = localStorage.getItem(`expert_gps_user_${currentUser.uid}`);
          if (cachedDataStr) {
            try {
              const cachedUserData = JSON.parse(cachedDataStr);
              setUserData(cachedUserData);
              if (!isSignin) {
                toast.success("Using local session (Server/Network glitch recovered)");
              }
            } catch (err) {
              setUserData(null);
              setUser(null);
              localStorage.removeItem("expert_gps_fallback_token");
              localStorage.removeItem("expert_gps_fallback_user");
              if (auth.currentUser) {
                await signOut(auth).catch(() => {});
              }
              if (!isSignin) {
                toast.error("Session verification failed.");
              }
            }
          } else {
            setUserData(null);
            setUser(null);
            localStorage.removeItem("expert_gps_fallback_token");
            localStorage.removeItem("expert_gps_fallback_user");
            if (auth.currentUser) {
              await signOut(auth).catch(() => {});
            }
            if (!isSignin) {
              toast.error("Session verification failed.");
            }
          }
          setLoading(false);
        }
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    // Periodic polling to keep user data, status, and notifications perfectly live & synchronous!
    const interval = setInterval(() => {
      refreshUserData();
    }, 3000);
    return () => clearInterval(interval);
  }, [user]);

  const login = async () => {
    sessionStorage.setItem('is_signing_in', 'true');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      
      const token = await res.user.getIdToken(true);
      const verifyRes = await fetch('/api/auth/verify-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!verifyRes.ok) {
        const errResult = await verifyRes.json().catch(() => ({ error: 'Verification failed' }));
        await signOut(auth);
        throw new Error(errResult.error || "No user found.");
      }

      const result = await verifyRes.json();
      if (!result.success) {
        await signOut(auth);
        throw new Error(result.error || "No user found.");
      }

      setUser(res.user);
      setUserData(result.userData);
      localStorage.setItem(`expert_gps_user_${res.user.uid}`, JSON.stringify(result.userData));
      setLoading(false);
    } catch (err) {
      setUser(null);
      setUserData(null);
      setLoading(false);
      throw err;
    } finally {
      sessionStorage.removeItem('is_signing_in');
    }
  };

  const loginEmail = async (email: string, pass: string) => {
    sessionStorage.setItem('is_signing_in', 'true');
    setLoading(true);
    try {
      let token = "";
      let resUser: any = null;
      let apiUserData: any = null;

      // Custom Express local authentication POST directly to MySQL
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password: pass })
      });

      if (!loginRes.ok) {
        const errorResult = await loginRes.json().catch(() => ({ error: 'Authentication failed.' }));
        throw new Error(errorResult.error || "Failed to authenticate.");
      }

      const loginResult = await loginRes.json();
      if (!loginResult.success) {
        throw new Error(loginResult.error || "Failed to authenticate.");
      }

      token = loginResult.token;
      apiUserData = loginResult.userData;
      resUser = {
        uid: apiUserData.uid,
        email: apiUserData.email,
        displayName: apiUserData.name,
        getIdToken: async () => token
      } as any;

      // Persist local fallback details to survive app reloads cleanly
      localStorage.setItem("expert_gps_fallback_token", token);
      localStorage.setItem("expert_gps_fallback_user", JSON.stringify({
        uid: apiUserData.uid,
        email: apiUserData.email,
        name: apiUserData.name
      }));

      setUser(resUser);
      setUserData(apiUserData);
      localStorage.setItem(`expert_gps_user_${resUser.uid}`, JSON.stringify(apiUserData));
      setLoading(false);
    } catch (err: any) {
      setUser(null);
      setUserData(null);
      localStorage.removeItem("expert_gps_fallback_token");
      localStorage.removeItem("expert_gps_fallback_user");
      setLoading(false);
      throw err;
    } finally {
      sessionStorage.removeItem('is_signing_in');
    }
  };

  const signUpEmail = async (email: string, pass: string, name: string) => {
    // MySQL based administration adds members, client-side signup uses Admin-added entries
    throw new Error("Client self-registration is disabled. Please contact your organization administrator to create an account.");
  };

  const logout = async () => {
    try {
      if (user) {
        localStorage.removeItem(`expert_gps_user_${user.uid}`);
      }
      localStorage.removeItem("expert_gps_fallback_token");
      localStorage.removeItem("expert_gps_fallback_user");
      sessionStorage.removeItem('is_signing_in');
    } catch (e) {
      console.warn("Storage cleanup error during logout:", e);
    }
    setUser(null);
    setUserData(null);
  };

  const resetPassword = async (email: string) => {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const errRes = await res.json().catch(() => ({ error: "Reset failed" }));
      throw new Error(errRes.error || "Could not complete password recovery request.");
    }
  };

  const refreshUserData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken(true);
      const response = await fetch('/api/auth/verify-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.userData) {
          setUserData(result.userData);
        }
      }
    } catch (error) {
      console.warn("Failed to refresh user data:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, login, loginEmail, signUpEmail, logout, resetPassword, refreshUserData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
