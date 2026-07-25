import { Geolocation } from '@capacitor/geolocation';
import { isPlatform } from '@capacitor/core';

export async function requestLocationPermission(): Promise<boolean> {
  try {
    // Only request on mobile platforms
    if (!isPlatform('hybrid')) {
      return true; // Browser has its own permission flow
    }

    const permission = await Geolocation.requestPermissions();
    return permission.location === 'granted' || permission.location === 'prompt';
  } catch (err) {
    console.error('Error requesting location permission:', err);
    return false;
  }
}

export function watchPosition(
  onSuccess: (lat: number, lng: number) => void,
  onError: (error: string) => void,
  options: { enableHighAccuracy?: boolean } = {}
): string | null {
  try {
    // Check if we're on a mobile platform
    if (isPlatform('hybrid')) {
      // Use Capacitor Geolocation on mobile
      const watchId = Geolocation.watchPosition(
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          maximumAge: options.enableHighAccuracy ? 10000 : 30000,
          timeout: 30000
        },
        (position, err) => {
          if (err) {
            console.warn('Capacitor geolocation error:', err);
            onError(err.message || 'Geolocation failed');
          } else if (position) {
            onSuccess(position.coords.latitude, position.coords.longitude);
          }
        }
      );
      return watchId.toString();
    } else {
      // Use browser geolocation on web
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          onSuccess(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.warn('Browser geolocation error:', error);
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
    console.error('Error setting up geolocation watch:', err);
    onError(err?.message || 'Failed to start geolocation');
    return null;
  }
}

export function clearWatch(watchId: string | null): void {
  if (!watchId) return;

  try {
    if (isPlatform('hybrid')) {
      // Capacitor geolocation
      Geolocation.clearWatch({ id: parseInt(watchId, 10) }).catch(err =>
        console.warn('Error clearing Capacitor watch:', err)
      );
    } else {
      // Browser geolocation
      navigator.geolocation.clearWatch(parseInt(watchId, 10));
    }
  } catch (err) {
    console.warn('Error clearing geolocation watch:', err);
  }
}
