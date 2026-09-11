import { Geolocation, PermissionStatus } from '@capacitor/geolocation';
import { isNativeApp } from './apiPatch';

export const LOCATION_DISCLOSURE_KEY = 'expert_gps_location_disclosure_accepted';

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

export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  await requestLocationPermissions().catch(() => {});

  if (isNativeApp()) {
    // Tier 1: Capacitor High Accuracy
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      });
      if (pos && pos.coords) {
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch (err) {
      console.warn('Native high accuracy getCurrentPosition failed, trying low accuracy:', err);
    }

    // Tier 2: Capacitor Low Accuracy
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000
      });
      if (pos && pos.coords) {
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch (err) {
      console.warn('Native low accuracy getCurrentPosition failed, trying navigator:', err);
    }
  }

  // Tier 3: Navigator Geolocation Fallback
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.warn('Navigator getCurrentPosition high accuracy failed, trying low accuracy:', err.message);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          (err2) => {
            console.warn('Navigator getCurrentPosition low accuracy failed:', err2.message);
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  });
}

export async function watchLocation(
  onLocation: (lat: number, lng: number) => void,
  onError?: (err: any) => void
): Promise<() => void> {
  await requestLocationPermissions().catch(() => {});

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
