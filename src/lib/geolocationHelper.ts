import { App } from '@capacitor/app';
import { isPlatform } from '@capacitor/core';

let watchId: number | null = null;

export async function requestLocationPermission(): Promise<boolean> {
  try {
    // Only on mobile
    if (!isPlatform('hybrid')) {
      return true;
    }

    console.log('[Geolocation] Requesting location permission via Android system...');
    
    // On Android, we need to request permissions through the system
    // The browser will show the permission dialog when we call watchPosition
    return true;
  } catch (err) {
    console.error('[Geolocation] Error:', err);
    return true; // Proceed anyway
  }
}

export function watchPosition(
  onSuccess: (lat: number, lng: number) => void,
  onError: (error: string) => void,
  options: { enableHighAccuracy?: boolean } = {}
): string | null {
  try {
    console.log('[Geolocation] Starting watchPosition with high accuracy:', options.enableHighAccuracy);
    
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        console.log('[Geolocation] Position update:', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        onSuccess(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.error('[Geolocation] Error code:', error.code, 'Message:', error.message);
        
        // Error codes:
        // 1 = PERMISSION_DENIED
        // 2 = POSITION_UNAVAILABLE
        // 3 = TIMEOUT
        
        if (error.code === 1) {
          onError('Location permission denied. Please enable GPS in app settings.');
        } else if (error.code === 2) {
          onError('GPS is not available. Please enable GPS on your device.');
        } else if (error.code === 3) {
          onError('GPS location request timed out. Please try again.');
        } else {
          onError(error.message || 'Geolocation failed');
        }
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: 0,
        timeout: 30000
      }
    );
    
    console.log('[Geolocation] Watch started with ID:', watchId);
    return watchId?.toString() || null;
  } catch (err: any) {
    console.error('[Geolocation] Error starting watch:', err);
    onError(err?.message || 'Failed to start geolocation');
    return null;
  }
}

export function clearWatch(watchIdToClear: string | null): void {
  if (!watchIdToClear) return;

  try {
    const id = parseInt(watchIdToClear, 10);
    console.log('[Geolocation] Clearing watch ID:', id);
    navigator.geolocation.clearWatch(id);
    watchId = null;
  } catch (err) {
    console.warn('[Geolocation] Error clearing watch:', err);
  }
}
