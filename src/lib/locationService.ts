import { Geolocation, PermissionStatus } from '@capacitor/geolocation';
import { isNativeApp } from './apiPatch';

export async function requestLocationPermissions(): Promise<boolean> {
  try {
    if (isNativeApp()) {
      const status: PermissionStatus = await Geolocation.checkPermissions();
      if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
        const req = await Geolocation.requestPermissions();
        return req.location === 'granted' || req.coarseLocation === 'granted';
      }
      return true;
    } else {
      if ('permissions' in navigator && navigator.permissions.query) {
        try {
          const res = await navigator.permissions.query({ name: 'geolocation' as any });
          if (res.state === 'prompt' || res.state === 'granted') {
            return true;
          }
        } catch (e) {
          // ignore query error on unsupported browsers
        }
      }
      return 'geolocation' in navigator;
    }
  } catch (err) {
    console.warn('Error checking/requesting location permissions:', err);
    return false;
  }
}

export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    await requestLocationPermissions();
    if (isNativeApp()) {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      });
      if (pos && pos.coords) {
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    }
  } catch (err) {
    console.warn('Native getCurrentPosition failed, falling back to navigator:', err);
  }

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
        console.warn('Navigator getCurrentPosition failed:', err.message);
        // Retry with low accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => resolve(null),
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
  await requestLocationPermissions();

  let watchId: string | number | null = null;
  let isCancelled = false;

  if (isNativeApp()) {
    try {
      const id = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 3000
        },
        (position, err) => {
          if (isCancelled) return;
          if (err) {
            console.warn('Capacitor Geolocation watchPosition error:', err);
            if (onError) onError(err);
            return;
          }
          if (position && position.coords) {
            onLocation(position.coords.latitude, position.coords.longitude);
          }
        }
      );
      watchId = id;

      return () => {
        isCancelled = true;
        if (watchId !== null) {
          Geolocation.clearWatch({ id: watchId as string }).catch(e => console.warn('clearWatch error:', e));
        }
      };
    } catch (err) {
      console.warn('Native watchPosition failed, falling back to web API:', err);
    }
  }

  if ('geolocation' in navigator) {
    const navWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isCancelled && pos && pos.coords) {
          onLocation(pos.coords.latitude, pos.coords.longitude);
        }
      },
      (err) => {
        if (!isCancelled && onError) onError(err);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );

    return () => {
      isCancelled = true;
      navigator.geolocation.clearWatch(navWatchId);
    };
  }

  return () => {
    isCancelled = true;
  };
}
