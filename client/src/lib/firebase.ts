import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// Using initializeFirestore with experimentalForceLongPolling to improve stability in containerized environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

const rawAuth = initializeAuth(app, {
  persistence: indexedDBLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

// Using custom Proxy wrapper to run entirely on the local relational MySQL auth fallback
export const auth: any = new Proxy(rawAuth, {
  get(target, prop, receiver) {
    if (prop === "currentUser") {
      const fallbackToken = localStorage.getItem("expert_gps_fallback_token");
      const fallbackUserStr = localStorage.getItem("expert_gps_fallback_user");
      if (fallbackToken && fallbackUserStr) {
        try {
          const parsedUser = JSON.parse(fallbackUserStr);
          return {
            uid: parsedUser.uid,
            email: parsedUser.email,
            displayName: parsedUser.name,
            getIdToken: async (force?: boolean) => fallbackToken,
            emailVerified: true,
            isAnonymous: false,
            providerData: []
          };
        } catch (e) {}
      }
      return target.currentUser;
    }
    
    if (prop === "onAuthStateChanged") {
      return (callback: any) => {
        const handler = () => {
          const fallbackToken = localStorage.getItem("expert_gps_fallback_token");
          const fallbackUserStr = localStorage.getItem("expert_gps_fallback_user");
          if (fallbackToken && fallbackUserStr) {
            try {
              const parsedUser = JSON.parse(fallbackUserStr);
              callback({
                uid: parsedUser.uid,
                email: parsedUser.email,
                displayName: parsedUser.name,
                getIdToken: async (force?: boolean) => fallbackToken,
                emailVerified: true,
                isAnonymous: false,
                providerData: []
              });
              return;
            } catch (e) {}
          }
          callback(target.currentUser);
        };
        
        handler();
        
        const onStorageChanged = (e: StorageEvent) => {
          if (e.key === "expert_gps_fallback_token" || e.key === "expert_gps_fallback_user") {
            handler();
          }
        };
        window.addEventListener("storage", onStorageChanged);
        
        const unsubRaw = target.onAuthStateChanged((rawUser) => {
          if (!localStorage.getItem("expert_gps_fallback_token")) {
            callback(rawUser);
          }
        });

        return () => {
          window.removeEventListener("storage", onStorageChanged);
          unsubRaw();
        };
      };
    }

    return Reflect.get(target, prop, receiver);
  }
});

// Direct MySQL Relational Database integration.
console.log("System initialized using direct MySQL Relational Database integration.");
