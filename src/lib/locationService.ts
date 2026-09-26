import { Geolocation, PermissionStatus } from '@capacitor/geolocation';
import { isNativeApp } from './apiPatch';

export const LOCATION_DISCLOSURE_KEY = 'expert_gps_location_disclosure_accepted';

type DisclosureListener = (show: boolean) => void;
let disclosureListeners: DisclosureListener[] = [];

export function onShowLocationDisclosure(fn: DisclosureListener): () => void {
  disclosureListeners.push(fn);
  return () => {
    disclosureListeners = disclosureListeners.filter(l => l !== fn);
  };
}

export function triggerLocationDisclosure(): void {
  if (!hasAcceptedLocationDisclosure()) {
    disclosureListeners.forEach(fn => fn(true));
  }
}

export function hasAcceptedLocationDisclosure(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(LOCATION_DISCLOSURE_KEY) === 'true') return true;
    if (sessionStorage.getItem(LOCATION_DISCLOSURE_KEY) === 'true') return true;
    if (document.cookie && document.cookie.includes(`${LOCATION_DISCLOSURE_KEY}=true`)) return true;
  } catch (e) {}
  return false;
}

export function setLocationDisclosureAccepted(accepted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (accepted) {
      localStorage.setItem(LOCATION_DISCLOSURE_KEY, 'true');
      sessionStorage.setItem(LOCATION_DISCLOSURE_KEY, 'true');
      document.cookie = `${LOCATION_DISCLOSURE_KEY}=true; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      localStorage.removeItem(LOCATION_DISCLOSURE_KEY);
      sessionStorage.removeItem(LOCATION_DISCLOSURE_KEY);
      document.cookie = `${LOCATION_DISCLOSURE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  } catch (e) {}
}

// In-memory, localStorage and session cache for immediate location recall
let lastKnownLocation: { lat: number; lng: number; timestamp: number } | null = null;

try {
  const saved = typeof localStorage !== 'undefined' ? (localStorage.getItem('last_known_gps') || sessionStorage.getItem('last_known_gps')) : null;
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number' && !isNaN(parsed.lat) && !isNaN(parsed.lng)) {
      lastKnownLocation = parsed;
    }
  }
} catch (e) {}

export function saveLastKnownLocation(lat: number, lng: number): void {
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
    lastKnownLocation = { lat, lng, timestamp: Date.now() };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('last_known_gps', JSON.stringify(lastKnownLocation));
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('last_known_gps', JSON.stringify(lastKnownLocation));
      }
    } catch (e) {}
  }
}

export function getLastKnownLocation(): { lat: number; lng: number } | null {
  if (lastKnownLocation && typeof lastKnownLocation.lat === 'number' && typeof lastKnownLocation.lng === 'number') {
    // Cache valid for 24 hours for instant 0ms map centering
    if (Date.now() - lastKnownLocation.timestamp < 24 * 60 * 60 * 1000) {
      return { lat: lastKnownLocation.lat, lng: lastKnownLocation.lng };
    }
  }
  return null;
}

export async function checkIsLocationPermissionGranted(): Promise<boolean> {
  if (hasAcceptedLocationDisclosure()) return true;
  try {
    if (isNativeApp()) {
      const status: PermissionStatus = await Geolocation.checkPermissions();
      if (status.location === 'granted' || status.coarseLocation === 'granted') {
        setLocationDisclosureAccepted(true);
        return true;
      }
    }
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions.query) {
      const res = await navigator.permissions.query({ name: 'geolocation' as any });
      if (res.state === 'granted') {
        setLocationDisclosureAccepted(true);
        return true;
      }
    }
  } catch (e) {}
  return hasAcceptedLocationDisclosure();
}

export async function requestLocationPermissions(): Promise<boolean> {
  // Prominent disclosure only required natively on Android
  if (isNativeApp() && !hasAcceptedLocationDisclosure()) {
    triggerLocationDisclosure();
    return false;
  }

  try {
    if (isNativeApp()) {
      try {
        const status: PermissionStatus = await Geolocation.checkPermissions();
        if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
          const req = await Geolocation.requestPermissions();
          const granted = req.location === 'granted' || req.coarseLocation === 'granted';
          if (granted) {
            setLocationDisclosureAccepted(true);
          }
          return granted;
        }
        setLocationDisclosureAccepted(true);
        return true;
      } catch (e) {
        console.warn('Capacitor checkPermissions error, falling back to navigator permissions:', e);
      }
    }

    if ('permissions' in navigator && navigator.permissions.query) {
      try {
        const res = await navigator.permissions.query({ name: 'geolocation' as any });
        if (res.state === 'granted') {
          setLocationDisclosureAccepted(true);
          return true;
        }
        if (res.state === 'prompt') {
          return true;
        }
      } catch (e) {
        // ignore query error on unsupported browsers
      }
    }
    return 'geolocation' in navigator;
  } catch (err) {
    console.warn('Error checking/requesting location permissions:', err);
    return false;
  }
}

export async function getCurrentPosition(options?: { fast?: boolean; maxAge?: number }): Promise<{ lat: number; lng: number } | null> {
  const cached = getLastKnownLocation();
  if (options?.fast && cached) {
    return cached;
  }

  if (isNativeApp() && !hasAcceptedLocationDisclosure()) {
    triggerLocationDisclosure();
    return cached;
  }

  const permissionReady = await requestLocationPermissions().catch(() => false);
  if (!permissionReady && isNativeApp()) {
    return cached;
  }

  if (isNativeApp()) {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 4000,
        maximumAge: options?.maxAge || 15000
      });
      if (pos && pos.coords) {
        saveLastKnownLocation(pos.coords.latitude, pos.coords.longitude);
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch (err) {
      console.warn('Native high accuracy getCurrentPosition failed, trying low accuracy:', err);
    }

    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 3000,
        maximumAge: 60000
      });
      if (pos && pos.coords) {
        saveLastKnownLocation(pos.coords.latitude, pos.coords.longitude);
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch (err) {
      console.warn('Native low accuracy getCurrentPosition failed, trying navigator:', err);
    }
  }

  // Tier 2: Navigator Geolocation with instant cache & fast resolution
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(cached);
      return;
    }

    let resolved = false;

    // Fast-path: use cached position from within the last 60s or query quickly
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          saveLastKnownLocation(pos.coords.latitude, pos.coords.longitude);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      },
      (err) => {
        console.warn('High accuracy getCurrentPosition failed, trying fast low accuracy:', err.message);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!resolved) {
              resolved = true;
              saveLastKnownLocation(pos.coords.latitude, pos.coords.longitude);
              resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }
          },
          (err2) => {
            console.warn('All getCurrentPosition attempts failed:', err2.message);
            if (!resolved) {
              resolved = true;
              resolve(cached);
            }
          },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 120000 }
        );
      },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: options?.maxAge || 30000 }
    );
  });
}

export async function watchLocation(
  onLocation: (lat: number, lng: number) => void,
  onError?: (err: any) => void
): Promise<() => void> {
  const permissionReady = await requestLocationPermissions().catch(() => false);
  if (!permissionReady && isNativeApp()) {
    return () => {};
  }

  let isCancelled = false;
  let nativeWatchId: string | null = null;
  let navWatchId: number | null = null;

  const cleanup = () => {
    isCancelled = true;
    if (nativeWatchId !== null) {
      Geolocation.clearWatch({ id: nativeWatchId }).catch(e => console.warn('clearWatch error:', e));
      nativeWatchId = null;
    }
    if (navWatchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(navWatchId);
      navWatchId = null;
    }
  };

  const startNavigatorWatch = () => {
    if (isCancelled || !('geolocation' in navigator)) return;

    navWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isCancelled && pos && pos.coords) {
          saveLastKnownLocation(pos.coords.latitude, pos.coords.longitude);
          onLocation(pos.coords.latitude, pos.coords.longitude);
        }
      },
      (err) => {
        if (isCancelled) return;
        console.warn('Navigator watchPosition high accuracy error, trying low accuracy:', err.message);
        // Fallback to low accuracy
        if (navWatchId !== null) {
          navigator.geolocation.clearWatch(navWatchId);
        }
        navWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (!isCancelled && pos && pos.coords) {
              saveLastKnownLocation(pos.coords.latitude, pos.coords.longitude);
              onLocation(pos.coords.latitude, pos.coords.longitude);
            }
          },
          (err2) => {
            if (!isCancelled && onError) onError(err2);
          },
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 10000 }
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  };

  if (isNativeApp()) {
    try {
      let isHighAccuracyFallbackDone = false;

      const id = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 3000
        },
        (position, err) => {
          if (isCancelled) return;
          if (err) {
            console.warn('Native watchPosition high accuracy error:', err);
            if (!isHighAccuracyFallbackDone) {
              isHighAccuracyFallbackDone = true;
              // Clear high accuracy watch and fallback to low accuracy / navigator
              if (nativeWatchId !== null) {
                Geolocation.clearWatch({ id: nativeWatchId }).catch(() => {});
                nativeWatchId = null;
              }
              Geolocation.watchPosition(
                {
                  enableHighAccuracy: false,
                  timeout: 20000,
                  maximumAge: 10000
                },
                (pos2, err2) => {
                  if (isCancelled) return;
                  if (err2) {
                    console.warn('Native watchPosition low accuracy error, falling back to navigator:', err2);
                    startNavigatorWatch();
                  } else if (pos2 && pos2.coords) {
                    onLocation(pos2.coords.latitude, pos2.coords.longitude);
                  }
                }
              ).then((id2) => {
                if (isCancelled) {
                  Geolocation.clearWatch({ id: id2 }).catch(() => {});
                } else {
                  nativeWatchId = id2;
                }
              }).catch(() => {
                startNavigatorWatch();
              });
            } else {
              if (onError) onError(err);
            }
            return;
          }
          if (position && position.coords) {
            onLocation(position.coords.latitude, position.coords.longitude);
          }
        }
      );
      nativeWatchId = id;

      return cleanup;
    } catch (err) {
      console.warn('Native watchPosition setup failed, falling back to navigator:', err);
    }
  }

  startNavigatorWatch();
  return cleanup;
}
