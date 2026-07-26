import { Permissions } from '@capacitor/permissions';

export async function requestLocationPermission(): Promise<boolean> {
  try {
    // Request location permission
    const result = await Permissions.requestPermissions({
      permissions: ['geolocation']
    });

    console.log('[Permission] Location permission result:', result);

    // Check if permission was granted
    const geolocationStatus = result.permissions.find(p => p.permission === 'geolocation');
    
    if (geolocationStatus?.state === 'granted') {
      console.log('[Permission] Location permission GRANTED');
      return true;
    } else {
      console.log('[Permission] Location permission DENIED');
      return false;
    }
  } catch (error) {
    console.log('[Permission] Error requesting location permission:', error);
    // If Capacitor fails, try browser geolocation
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          console.log('[Permission] Browser geolocation available');
          resolve(true);
        },
        () => {
          console.log('[Permission] Browser geolocation not available');
          resolve(false);
        }
      );
    });
  }
}
