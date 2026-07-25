import { Geolocation } from '@capacitor/geolocation';
import { isPlatform } from '@capacitor/core';

let watchId: string | null = null;

export async function requestLocationPermission(): Promise<boolean> {
  try {
    // Only request on mobile platforms
    if (!isPlatform('hybrid')) {
      return true; // Browser has its own permission flow
    }

    console.log('[Geolocation] Requesting location permissions...');
    const permission = await Geolocation.requestPermissions();
    console.log('[Geolocation] Permission result:', permission);
    
    const hasPermission = permission.location === 'granted' || permission.location === 'prompt';
    console.log('[Geolocation] Has permission:', hasPermission);
    return hasPermission;
  } catch (err) {
    console.error('[Geolocation] Error requesting location permission:', err);
    return false;
  }
}

export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    if (!isPlatform('hybrid')) {
      // Use browser geolocation on web
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          },
          (error) => {
            console.warn('[Geolocation] Browser getCurrentPosition error:', error);
            reject(error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      });
    } else {
      // Use Capacitor Geolocation on mobile
      console.log('[Geolocation] Getting current position via Capacitor...');
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
      console.log('[Geolocation] Got position:', coordinates);
      return {
        latitude: coordinates.coords.latitude,
        longitude: coordinates.coords.longitude
      };
    }
  } catch (err: any) {
    console.error('[Geolocation] Error getting current position:', err);
    throw err;
  }
}

export function watchPosition(
  onSuccess: (lat: number, lng: number) => void,
  onError: (error: string) => void,
  options: { enableHighAccuracy?: boolean } = {}
): string | null {
  try {
    if (isPlatform('hybrid')) {
      // Use Capacitor Geolocation on mobile
      console.log('[Geolocation] Starting Capacitor watchPosition...');
      
      watchId = Geolocation.watchPosition(
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          maximumAge: options.enableHighAccuracy ? 10000 : 30000,
          timeout: 30000
        },
        (position, err) => {
          if (err) {
            console.warn('[Geolocation] Capacitor watchPosition error:', err);
            onError(err.message || 'Geolocation failed');
          } else if (position) {
            console.log('[Geolocation] Got position update:', position.coords);
            onSuccess(position.coords.latitude, position.coords.longitude);
          }
        }
      );
      
      console.log('[Geolocation] Watch ID:', watchId);
      return watchId;
    } else {
      // Use browser geolocation on web
      console.log('[Geolocation] Starting browser watchPosition...');
      
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          console.log('[Geolocation] Got browser position:', position.coords);
          onSuccess(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.warn('[Geolocation] Browser watchPosition error:', error);
          onError(error.message || 'Geolocation failed');
        },
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          maximumAge: options.enableHighAccuracy ? 10000 : 30000,
          timeout: 30000
        }
      );
      
      return watchId.toString();
    }
  } catch (err: any) {
    console.error('[Geolocation] Error setting up geolocation watch:', err);
    onError(err?.message || 'Failed to start geolocation');
    return null;
  }
}

export function clearWatch(watchIdToClear: string | null): void {
  if (!watchIdToClear) return;

  try {
    if (isPlatform('hybrid')) {
      // Capacitor geolocation
      console.log('[Geolocation] Clearing Capacitor watch:', watchIdToClear);
      Geolocation.clearWatch({ id: watchIdToClear }).catch(err =>
        console.warn('[Geolocation] Error clearing Capacitor watch:', err)
      );
    } else {
      // Browser geolocation
      console.log('[Geolocation] Clearing browser watch:', watchIdToClear);
      navigator.geolocation.clearWatch(parseInt(watchIdToClear, 10));
    }
    watchId = null;
  } catch (err) {
    console.warn('[Geolocation] Error clearing geolocation watch:', err);
  }
}
