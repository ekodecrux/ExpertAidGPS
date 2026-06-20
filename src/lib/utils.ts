import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function isValidCoordinate(lat: any, lng: any): boolean {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  return !isNaN(latitude) && !isNaN(longitude) && 
         latitude >= -90 && latitude <= 90 && 
         longitude >= -180 && longitude <= 180;
}

export function getSectorTerminology(sector: string, plural: boolean = true) {
  const s = sector?.toLowerCase() || '';
  if (s === 'education') {
    return plural ? 'Students' : 'Student';
  }
  if (s === 'transport') {
    return plural ? 'Passengers' : 'Passenger';
  }
  // Default for Organization / Corporate or others
  return plural ? 'Employees' : 'Employee';
}

export function getSortedStops(pickupPoints: any[] | undefined, activeTrip: any, selectedDirection?: 'pickup' | 'dropoff') {
  if (!pickupPoints) return [];
  const validPoints = pickupPoints.filter(p => p && p.id);
  
  // 1. If activeTrip has a custom sequence defined
  if (activeTrip?.customStopsOrder && Array.isArray(activeTrip.customStopsOrder)) {
    return [...validPoints].sort((a: any, b: any) => {
      const idxA = activeTrip.customStopsOrder.indexOf(String(a.id));
      const idxB = activeTrip.customStopsOrder.indexOf(String(b.id));
      const valA = idxA !== -1 ? idxA : 999;
      const valB = idxB !== -1 ? idxB : 999;
      return valA - valB;
    });
  }

  // 2. If no custom stops order, check activeTrip direction (or explicit direction)
  const direction = selectedDirection || activeTrip?.direction || 'pickup';
  if (direction === 'dropoff') {
    return [...validPoints].sort((a: any, b: any) => {
      // Prioritize explicit dropoffOrder
      const orderA = a.dropoffOrder !== undefined && !isNaN(Number(a.dropoffOrder)) 
        ? Number(a.dropoffOrder) 
        : (validPoints.length - (a.order !== undefined && !isNaN(Number(a.order)) ? Number(a.order) : 0) + 1);
      const orderB = b.dropoffOrder !== undefined && !isNaN(Number(b.dropoffOrder)) 
        ? Number(b.dropoffOrder) 
        : (validPoints.length - (b.order !== undefined && !isNaN(Number(b.order)) ? Number(b.order) : 0) + 1);
      return orderA - orderB;
    });
  }

  // 3. Default: pickup order
  return [...validPoints].sort((a: any, b: any) => {
    const valA = a.order !== undefined && !isNaN(Number(a.order)) ? Number(a.order) : 0;
    const valB = b.order !== undefined && !isNaN(Number(b.order)) ? Number(b.order) : 0;
    return valA - valB;
  });
}

export function getLocalAvatar(name?: string, uid?: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs>` +
      `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
        `<stop offset="0%" stop-color="#22c55e"/>` +
        `<stop offset="100%" stop-color="#16a34a"/>` +
      `</linearGradient>` +
    `</defs>` +
    `<circle cx="50" cy="50" r="50" fill="url(#g)"/>` +
    `<circle cx="50" cy="38" r="16" fill="#ffffff"/>` +
    `<path d="M50 58c-18 0-28 10-28 22v2h56v-2c0-12-10-22-28-22z" fill="#ffffff"/>` +
  `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getUserAvatar(avatarUrl?: string, photoURL?: string, name?: string, uid?: string): string {
  const url = avatarUrl || photoURL || '';
  if (url && typeof url === 'string' && !url.includes('dicebear.com') && !url.includes('api.dicebear.com') && (url.startsWith('http') || url.startsWith('data:'))) {
    return url;
  }
  return getLocalAvatar(name, uid);
}

export function getLocalIcon(type: string): string {
  if (!type) return '';
  if (type.startsWith('data:') || type.startsWith('http')) {
    return type;
  }
  const norm = type.toLowerCase();

  if (norm.includes('bus-stop') || norm.includes('station')) {
    return 'https://img.icons8.com/fluency/50/bus-stop.png';
  } else if (norm.includes('bus')) {
    return 'https://img.icons8.com/fluency/50/bus.png';
  } else if (norm.includes('marker') || norm.includes('terminal') || norm.includes('hub')) {
    return 'https://img.icons8.com/fluency/50/marker.png';
  } else if (norm.includes('graduation') || norm.includes('college')) {
    return 'https://img.icons8.com/fluency/48/graduation-cap.png';
  } else if (norm.includes('school') || norm.includes('education')) {
    return 'https://img.icons8.com/fluency/48/school.png';
  } else if (norm.includes('hospital') || norm.includes('healthcare')) {
    return 'https://img.icons8.com/fluency/48/hospital.png';
  } else if (norm.includes('museum') || norm.includes('government')) {
    return 'https://img.icons8.com/fluency/48/museum.png';
  } else if (norm.includes('commercial') || norm.includes('building')) {
    return 'https://img.icons8.com/fluency/48/commercial.png';
  }

  return 'https://img.icons8.com/fluency/48/commercial.png';
}

export function cleanMessage(msg: string): string {
  if (!msg) return '';
  return msg.replace(/^[\u2705\ud83c\udfe0\u26a0\ud83d\ude8c✅🏠⚠️🚌]\s*/u, '');
}



