// Simple browser geolocation - no Capacitor, no permission dialogs
// Just native browser geolocation that works in WebView

let watchId: number | null = null;

export function watchPosition(
  onSuccess: (lat: number, lng: number) => void,
  onError: (error: string) => void,
  options: { enableHighAccuracy?: boolean } = {}
): string | null {
  try {
    console.log('[GPS] Starting GPS tracking...');
    
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('[GPS] Location:', { latitude, longitude });
        onSuccess(latitude, longitude);
      },
      (error) => {
        console.error('[GPS] Error:', error.code, error.message);
        onError(error.message || 'GPS unavailable');
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: 0,
        timeout: 10000
      }
    );
    
    return watchId?.toString() || null;
  } catch (err: any) {
    console.error('[GPS] Setup error:', err);
    onError(err?.message || 'GPS setup failed');
    return null;
  }
}

export function clearWatch(watchIdToClear: string | null): void {
  if (!watchIdToClear) return;
  try {
    navigator.geolocation.clearWatch(parseInt(watchIdToClear, 10));
  } catch (err) {
    console.warn('[GPS] Clear error:', err);
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  // Browser handles permissions automatically - just return true
  return true;
}
