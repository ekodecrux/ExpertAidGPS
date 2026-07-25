// Silent GPS tracking - suppresses all errors
// Just logs to console, never shows errors to user

let watchId: number | null = null;

export function watchPosition(
  onSuccess: (lat: number, lng: number) => void,
  onError: (error: string) => void,
  options: { enableHighAccuracy?: boolean } = {}
): string | null {
  try {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        try {
          const { latitude, longitude } = position.coords;
          onSuccess(latitude, longitude);
        } catch (e) {
          console.log('[GPS] Success callback error:', e);
        }
      },
      (error) => {
        // NEVER call onError - suppress completely
        console.log('[GPS] Position error code:', error.code);
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: 0,
        timeout: 10000
      }
    );
    
    return watchId?.toString() || null;
  } catch (err: any) {
    console.log('[GPS] Setup error:', err?.message);
    return null;
  }
}

export function clearWatch(watchIdToClear: string | null): void {
  if (!watchIdToClear) return;
  try {
    navigator.geolocation.clearWatch(parseInt(watchIdToClear, 10));
  } catch (err) {
    // Silent
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  return true;
}
