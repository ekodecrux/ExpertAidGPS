// Simple geolocation helper using browser API only
// No Capacitor - just native browser geolocation

export function watchPosition(
  onSuccess: (lat: number, lng: number) => void,
  onError: (error: string) => void,
  options: { enableHighAccuracy?: boolean } = {}
): string | null {
  try {
    console.log('[Geolocation] Starting watchPosition...');
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        console.log('[Geolocation] Got position:', position.coords);
        onSuccess(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.warn('[Geolocation] Error:', error.message);
        onError(error.message || 'Geolocation failed');
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: options.enableHighAccuracy ? 10000 : 30000,
        timeout: 30000
      }
    );
    
    console.log('[Geolocation] Watch ID:', watchId);
    return watchId.toString();
  } catch (err: any) {
    console.error('[Geolocation] Error setting up watch:', err);
    onError(err?.message || 'Failed to start geolocation');
    return null;
  }
}

export function clearWatch(watchId: string | null): void {
  if (!watchId) return;

  try {
    console.log('[Geolocation] Clearing watch:', watchId);
    navigator.geolocation.clearWatch(parseInt(watchId, 10));
  } catch (err) {
    console.warn('[Geolocation] Error clearing watch:', err);
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  // Browser handles permissions automatically
  // This is just a placeholder for compatibility
  return true;
}
