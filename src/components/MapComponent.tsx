import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Locate, Maximize2, Minimize2, Layers, Plus, Minus, Target, Loader2, Check, X } from 'lucide-react';
import { cn, getLocalIcon } from '../lib/utils';
import { getLastKnownLocation, saveLastKnownLocation } from '../lib/locationService';
import toast from 'react-hot-toast';

// Safe toast helper to guarantee toasts are never invoked during a React render/reconciliation pass
const safeToast = {
  success: (msg: string, opts?: any) => {
    setTimeout(() => {
      try { toast.success(msg, opts); } catch (e) {}
    }, 0);
  },
  error: (msg: string, opts?: any) => {
    setTimeout(() => {
      try { toast.error(msg, opts); } catch (e) {}
    }, 0);
  },
  info: (msg: string, opts?: any) => {
    setTimeout(() => {
      try { toast(msg, opts); } catch (e) {}
    }, 0);
  }
};

// Fix for default marker icons in Leaflet with React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: getLocalIcon('marker'),
  iconUrl: getLocalIcon('marker'),
  shadowUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
});

// Custom Icons cache to prevent recreating multiple identical DivIcons
const iconCache: Record<string, L.DivIcon> = {};

export const createMarkerIcon = (
  color: string, 
  iconUrl?: string, 
  shadowColor?: string, 
  label?: string, 
  labelBgColor?: string, 
  labelTextColor?: string
) => {
  const cacheKey = `${color}|${iconUrl || ''}|${shadowColor || ''}|${label || ''}|${labelBgColor || ''}|${labelTextColor || ''}`;
  if (iconCache[cacheKey]) {
    return iconCache[cacheKey];
  }

  const resolvedIconUrl = getLocalIcon(iconUrl || 'bus');
  const icon = new L.DivIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative flex flex-col items-center justify-center">
        ${label ? `
          <div class="absolute -top-10 px-3 py-1 text-[10px] font-black rounded-lg shadow-2xl whitespace-nowrap uppercase tracking-[0.2em] border z-50 animate-in fade-in zoom-in duration-300" 
               style="background-color: ${labelBgColor || '#0f172a'}; color: ${labelTextColor || '#ffffff'}; border-color: ${labelBgColor || '#334155'}">
            ${label}
          </div>
        ` : ''}
        <div class="absolute w-14 h-14 rounded-full blur-xl opacity-60 animate-pulse" style="background-color: ${shadowColor || color}"></div>
        <div class="relative w-12 h-12 bg-white border-4 rounded-[1.5rem] flex items-center justify-center shadow-2xl hover:scale-110 hover:-rotate-3 transition-colors duration-300 overflow-hidden group" style="border-color: ${color}">
          <div class="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-slate-100 opacity-50"></div>
          <img src="${resolvedIconUrl}" class="relative w-8 h-8 object-contain drop-shadow-sm transition-transform" />
        </div>
        <div class="absolute -bottom-2 w-3 h-3 border-2 border-white rounded-full shadow-lg" style="background-color: ${color}"></div>
      </div>
    `,
    iconSize: [56, 56],
    iconAnchor: [28, 56],
    popupAnchor: [0, -56],
  });

  iconCache[cacheKey] = icon;
  return icon;
};

const userLocationIcon = new L.DivIcon({
  className: 'user-location-icon',
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-blue-500 rounded-full blur-sm opacity-40 animate-ping"></div>
      <div class="relative w-5 h-5 bg-blue-600 border-2 border-white rounded-full shadow-xl"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export const vehicleIcon = createMarkerIcon('#3b82f6', getLocalIcon('bus'), '#3b82f6');
export const stationIcon = createMarkerIcon('#10b981', getLocalIcon('bus-stop'), '#34d399');
export const terminalIcon = createMarkerIcon('#f43f5e', getLocalIcon('marker'), '#fb7185');

function UserLocationMarker({ highAccuracy = false }: { highAccuracy?: boolean }) {
  const cached = getLastKnownLocation();
  const [position, setPosition] = useState<[number, number] | null>(
    cached ? [cached.lat, cached.lng] : null
  );
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    let isMounted = true;

    // Fast initial check with browser geolocation for 0ms lag
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            saveLastKnownLocation(lat, lng);
            setPosition([lat, lng]);
          }
        },
        () => {},
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
      );
    }

    const handleFound = (e: L.LocationEvent) => {
      if (!isMounted) return;
      if (e.latlng && !isNaN(e.latlng.lat) && !isNaN(e.latlng.lng)) {
        saveLastKnownLocation(e.latlng.lat, e.latlng.lng);
        setPosition([e.latlng.lat, e.latlng.lng]);
      }
    };

    map.on('locationfound', handleFound);
    try {
      map.locate({ watch: true, enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 30000 });
    } catch (e) {
      console.warn('map.locate error', e);
    }

    return () => {
      isMounted = false;
      try {
        map.stopLocate();
        map.off('locationfound', handleFound);
      } catch (e) {}
    };
  }, [map, highAccuracy]);

  if (!position) return null;

  return (
    <Marker position={position} icon={userLocationIcon}>
      <Popup>
        <div className="p-1 text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Your Current Location</span>
        </div>
      </Popup>
    </Marker>
  );
}

interface MapComponentProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  bounds?: [number, number][] | any;
  children?: React.ReactNode;
  height?: string;
  className?: string;
  hideControls?: boolean;
  hideMapStyles?: boolean;
  hideUserLocation?: boolean;
  highAccuracy?: boolean;
  controlsPosition?: 'top-right' | 'bottom-right';
  onMapReady?: (map: L.Map) => void;
  onClick?: (lat: number, lng: number) => void;
  driverCoords?: { lat: number; lng: number } | null;
  targetStopCoords?: { lat: number; lng: number } | null;
}

function MapReadyTrigger({ 
  onMapReady, 
  onStoreMap 
}: { 
  onMapReady?: (map: L.Map) => void;
  onStoreMap?: (map: L.Map) => void;
}) {
  const map = useMap();
  const readyTriggeredRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    if (onStoreMap) {
      onStoreMap(map);
    }
    if (onMapReady && !readyTriggeredRef.current) {
      readyTriggeredRef.current = true;
      setTimeout(() => {
        try {
          onMapReady(map);
        } catch (e) {
          console.warn('onMapReady error:', e);
        }
      }, 0);
    }
  }, [map, onStoreMap]);

  return null;
}

function MapClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  const clickTimeout = useRef<NodeJS.Timeout | null>(null);

  useMapEvents({
    click(e) {
      if (clickTimeout.current) {
        clearTimeout(clickTimeout.current);
        clickTimeout.current = null;
      } else {
        clickTimeout.current = setTimeout(() => {
          if (onClick) {
            onClick(e.latlng.lat, e.latlng.lng);
          }
          clickTimeout.current = null;
        }, 250);
      }
    },
    dblclick() {
      if (clickTimeout.current) {
        clearTimeout(clickTimeout.current);
        clickTimeout.current = null;
      }
    },
  });
  return null;
}

function ChangeView({ 
  center, 
  zoom, 
  bounds 
}: { 
  center?: { lat: number; lng: number } | null; 
  zoom?: number; 
  bounds?: [number, number][] | any; 
}) {
  const map = useMap();
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastZoomRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;

    // Handle bounds safely if provided
    if (bounds) {
      try {
        let validPoints: [number, number][] = [];
        if (Array.isArray(bounds) && bounds.length >= 2) {
          validPoints = bounds
            .map((b: any) => {
              if (Array.isArray(b) && b.length >= 2) {
                const lat = typeof b[0] === 'number' ? b[0] : parseFloat(b[0]);
                const lng = typeof b[1] === 'number' ? b[1] : parseFloat(b[1]);
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                  return [lat, lng] as [number, number];
                }
              } else if (b && typeof b === 'object') {
                const lat = typeof b.lat === 'number' ? b.lat : parseFloat(b.lat);
                const lng = typeof b.lng === 'number' ? b.lng : parseFloat(b.lng);
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                  return [lat, lng] as [number, number];
                }
              }
              return null;
            })
            .filter((p): p is [number, number] => p !== null);
        }

        if (validPoints.length >= 2) {
          map.fitBounds(validPoints, { padding: [50, 50], maxZoom: 16 });
          return;
        }
      } catch (err) {
        console.warn('fitBounds failed gracefully:', err);
      }
    }

    // Safely update center & zoom
    if (center && typeof center === 'object') {
      const lat = typeof center.lat === 'number' ? center.lat : parseFloat(center.lat as any);
      const lng = typeof center.lng === 'number' ? center.lng : parseFloat(center.lng as any);

      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const targetZoom = typeof zoom === 'number' && !isNaN(zoom) ? zoom : map.getZoom();

        const prevCenter = lastCenterRef.current;
        const prevZoom = lastZoomRef.current;
        if (
          !prevCenter ||
          Math.abs(prevCenter.lat - lat) > 0.0001 ||
          Math.abs(prevCenter.lng - lng) > 0.0001 ||
          prevZoom !== targetZoom
        ) {
          lastCenterRef.current = { lat, lng };
          lastZoomRef.current = targetZoom;
          try {
            map.setView([lat, lng], targetZoom);
          } catch (err) {
            console.warn('setView failed gracefully:', err);
          }
        }
      }
    }
  }, [center?.lat, center?.lng, zoom, bounds, map]);

  return null;
}

function MobileScrollHelper({ isFullscreen }: { isFullscreen: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (isFullscreen) {
      map.dragging.enable();
      return;
    }

    const container = map.getContainer();
    if (!container) return;

    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouchDevice) {
      map.dragging.enable();
      return;
    }

    // Default when embedded on mobile: disable 1-finger map drag so the page scrolls freely with the user's hand
    map.dragging.disable();

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        map.dragging.enable();
      } else {
        map.dragging.disable();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        map.dragging.disable();
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [map, isFullscreen]);

  return null;
}

// Helper to detect night hours (7:00 PM to 6:00 AM local time) or system dark mode, matching Google Maps automatic night schedule
export const isNightTime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hours = new Date().getHours();
  const isNightHour = hours >= 19 || hours < 6;
  const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isNightHour || prefersDark;
};

// Reliable, high-resolution global tile layers that never require API keys,
// have zero watermarks, and eliminate "Map data not yet available" placeholders.
export const MAP_LAYERS = {
  standard: {
    name: 'Clean Streets',
    tag: 'Clean Street Map',
    icon: '🗺️',
    desc: 'Crisp roads, transit stops, landmarks and navigation paths',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 19
  },
  satellite: {
    name: 'Satellite View',
    tag: 'Aerial Imagery',
    icon: '🛰️',
    desc: 'High-resolution overhead satellite photography',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, Maxar',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 18 // Native zoom 18 upscaled smoothly by Leaflet to 19 so "data not yet available" dummy tile NEVER appears!
  },
  light: {
    name: 'Clean Streets',
    tag: 'Clean Street Map',
    icon: '🗺️',
    desc: 'Crisp roads, transit stops, landmarks and navigation paths',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 19
  },
  topo: {
    name: 'Topographic',
    tag: 'Terrain & Elevation',
    icon: '⛰️',
    desc: 'Contours, relief and terrain elevations',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; National Geographic, Esri, USGS',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 18
  },
  dark: {
    name: 'Google Night Mode',
    tag: 'Night Canvas',
    icon: '🌙',
    desc: 'Dark high-contrast Google Maps night navigation mode',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 19
  }
};

export type MapLayerType = keyof typeof MAP_LAYERS;

interface CustomControlsProps {
  mapType: MapLayerType;
  onToggleMapType: () => void;
  hideMapStyles?: boolean;
  position?: 'top-right' | 'bottom-right';
  driverCoords?: { lat: number; lng: number } | null;
  targetStopCoords?: { lat: number; lng: number } | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

function CustomControls({ 
  mapType,
  onToggleMapType,
  hideMapStyles = false, 
  position = 'top-right',
  driverCoords,
  targetStopCoords,
  isFullscreen = false,
  onToggleFullscreen
}: CustomControlsProps) {
  const map = useMap();
  const [isLocating, setIsLocating] = useState(false);

  const controlCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const onLocate = () => {
    // 1. Immediate execution: fly immediately to cached position (0ms latency)
    const cached = getLastKnownLocation();
    let hasCentered = false;

    if (cached && typeof cached.lat === 'number' && typeof cached.lng === 'number' && !isNaN(cached.lat) && !isNaN(cached.lng)) {
      hasCentered = true;
      map.flyTo([cached.lat, cached.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 });
      safeToast.success('Centered on current location', { id: 'gps-locate', duration: 1500 });
    }

    setIsLocating(true);

    // 2. Fast direct browser Geolocation with low-accuracy for instant cellular/WiFi fix
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            saveLastKnownLocation(lat, lng);
            map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 });
            safeToast.success('Centered on current location', { id: 'gps-locate', duration: 1500 });
          }
          setIsLocating(false);
        },
        (err) => {
          console.warn('Fast geolocation fallback:', err.message);
          // Try high accuracy fallback
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                saveLastKnownLocation(lat, lng);
                map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 });
                safeToast.success('Centered on current location', { id: 'gps-locate', duration: 1500 });
              }
              setIsLocating(false);
            },
            () => {
              setIsLocating(false);
              if (!hasCentered) {
                safeToast.error('Unable to retrieve location. Please check browser GPS permissions.', { id: 'gps-locate' });
              }
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        },
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
      );
    } else {
      setIsLocating(false);
      if (!hasCentered) {
        safeToast.error('Geolocation is not supported by your browser.', { id: 'gps-locate' });
      }
    }
  };

  const onFitDriverAndStop = () => {
    const coordsToFit: [number, number][] = [];
    
    if (driverCoords && typeof driverCoords.lat === 'number' && !isNaN(driverCoords.lat) && Math.abs(driverCoords.lat) > 0.1) {
      coordsToFit.push([driverCoords.lat, driverCoords.lng]);
    }
    
    if (targetStopCoords && typeof targetStopCoords.lat === 'number' && !isNaN(targetStopCoords.lat) && Math.abs(targetStopCoords.lat) > 0.1) {
      coordsToFit.push([targetStopCoords.lat, targetStopCoords.lng]);
    }

    if (coordsToFit.length >= 2) {
      const bounds = L.latLngBounds(coordsToFit);
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      safeToast.success('Framed Live Driver & Destination Stop', { id: 'focus-success' });
    } else if (coordsToFit.length === 1) {
      map.flyTo(coordsToFit[0], 15);
      safeToast.success('Centred on Live Location', { id: 'focus-success' });
    } else {
      safeToast.error('Waiting for Live Driver and Stop coordinates...', { id: 'focus-warn' });
    }
  };

  return (
    <div 
      ref={controlCallback} 
      className={cn(
        "absolute z-[2000] flex flex-col gap-2 pointer-events-auto",
        position === 'top-right' ? "top-20 right-4 animate-in fade-in slide-in-from-top-4 duration-500" : "bottom-36 right-4"
      )}
    >
      {/* Navigation / Locate Me */}
      <button 
        type="button"
        onClick={(e) => { e.stopPropagation(); onLocate(); }}
        disabled={isLocating}
        className={cn(
          "w-11 h-11 bg-white rounded-full shadow-xl border border-slate-200 flex items-center justify-center transition-all active:scale-90",
          isLocating 
            ? "text-blue-600 bg-blue-50 border-blue-300 ring-2 ring-blue-400/30" 
            : "text-slate-600 hover:text-blue-600 hover:bg-slate-50 hover:border-blue-100"
        )}
        title={isLocating ? "Locating current position..." : "Go to Current Location (Immediate)"}
      >
        {isLocating ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        ) : (
          <Locate className="w-5 h-5" />
        )}
      </button>

      {/* Zoom Controls with max zoom 19 clamp to eliminate 'data not yet available' */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            if (map.getZoom() < 19) {
              map.zoomIn(); 
            } else {
              safeToast.success('Maximum zoom level reached', { id: 'max-zoom' });
            }
          }}
          className="w-11 h-11 flex items-center justify-center text-slate-600 hover:bg-slate-50 border-b border-slate-100 transition-colors active:scale-95"
          title="Zoom In"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            if (map.getZoom() > 3) {
              map.zoomOut(); 
            }
          }}
          className="w-11 h-11 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors active:scale-95"
          title="Zoom Out"
        >
          <Minus className="w-5 h-5" />
        </button>
      </div>

      {/* 1-Click Map Style Toggle: Clean Street <-> Satellite (Icon remains consistent) */}
      {!hideMapStyles && (
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            onToggleMapType();
          }}
          className={cn(
            "w-11 h-11 bg-white rounded-full shadow-xl border flex items-center justify-center transition-all active:scale-95 group",
            mapType === 'satellite' 
              ? "text-blue-600 bg-blue-50 border-blue-300 ring-2 ring-blue-400/30 shadow-blue-100" 
              : "text-slate-600 border-slate-200 hover:text-blue-600 hover:bg-slate-50"
          )}
          title={mapType === 'satellite' ? "Switch to Clean Street Map" : "Switch to Satellite View"}
        >
          <Layers className="w-5 h-5" />
        </button>
      )}

      {/* Expand / Maximize (Full-screen view) */}
      <button 
        type="button"
        onClick={(e) => { 
          e.stopPropagation(); 
          if (onToggleFullscreen) {
            onToggleFullscreen();
          } else {
            const container = map.getContainer().parentElement;
            if (container) {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              } else {
                container.requestFullscreen().catch(() => {});
              }
            }
          }
        }}
        className={cn(
          "w-11 h-11 bg-white rounded-full shadow-xl border flex items-center justify-center transition-all active:scale-95",
          isFullscreen 
            ? "text-blue-600 bg-blue-50 border-blue-300 ring-2 ring-blue-400/30" 
            : "text-slate-600 border-slate-200 hover:text-blue-600 hover:bg-slate-50"
        )}
        title={isFullscreen ? "Exit Fullscreen (Esc)" : "Expand Map (Fullscreen)"}
      >
        {isFullscreen ? <Minimize2 className="w-5 h-5 text-blue-600" /> : <Maximize2 className="w-5 h-5" />}
      </button>

      {/* Focus Driver & Targeted Stop (only shown if coordinates exist) */}
      {(driverCoords || targetStopCoords) && (
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            onFitDriverAndStop();
          }}
          className="w-11 h-11 bg-emerald-600 rounded-full shadow-xl border border-emerald-500 flex items-center justify-center text-white hover:bg-emerald-700 hover:border-emerald-600 transition-all active:scale-90"
          title="Focus Driver & Targeted Stop in Single Frame"
        >
          <Target className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

function MapAutoResizer({ trigger }: { trigger?: any }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    if (!container) return;

    const forceResize = () => {
      try {
        map.invalidateSize({ pan: false, debounceMoveend: false });
        map.eachLayer((layer: any) => {
          if (typeof layer._update === 'function') {
            layer._update();
          }
        });
      } catch (e) {}
    };

    // 1. Immediate invalidation
    forceResize();

    // 2. Synchronous next animation frame checks
    const raf1 = requestAnimationFrame(forceResize);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(forceResize));

    // 3. Native ResizeObserver to catch any size/DOM reflow instantly (e.g. going fullscreen or flex resizing)
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        forceResize();
      });
      ro.observe(container);
    }

    // 4. Window & orientation listeners
    window.addEventListener('resize', forceResize, { passive: true });
    window.addEventListener('orientationchange', forceResize, { passive: true });

    // 5. Short staggered timers to catch delayed CSS or font layout adjustments
    const timers = [30, 80, 150, 300, 600, 1000].map((delay) =>
      setTimeout(forceResize, delay)
    );

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', forceResize);
      window.removeEventListener('orientationchange', forceResize);
      timers.forEach(clearTimeout);
    };
  }, [map, trigger]);

  return null;
}

export default function MapComponent({ 
  center = { lat: 17.4504, lng: 78.3808 }, 
  zoom = 12, 
  bounds,
  children, 
  height = '400px',
  className,
  hideControls = false,
  hideMapStyles = false,
  hideUserLocation = false,
  highAccuracy = false,
  controlsPosition = 'top-right',
  onMapReady,
  onClick,
  driverCoords,
  targetStopCoords
}: MapComponentProps) {
  // Clean Street Map is default
  const [mapType, setMapType] = useState<MapLayerType>('standard');
  // Automatically activates Google Night Mode between 7:00 PM and 6:00 AM local time
  const [isNightMode, setIsNightMode] = useState<boolean>(() => isNightTime());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Periodically check local environment (sunset/night hours and system dark theme)
  useEffect(() => {
    const updateNightMode = () => {
      setIsNightMode(isNightTime());
    };

    const timer = setInterval(updateNightMode, 30000);

    let mediaQuery: MediaQueryList | null = null;
    if (typeof window !== 'undefined' && window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      try {
        mediaQuery.addEventListener('change', updateNightMode);
      } catch (e) {
        try { (mediaQuery as any).addListener(updateNightMode); } catch (_) {}
      }
    }

    return () => {
      clearInterval(timer);
      if (mediaQuery) {
        try {
          mediaQuery.removeEventListener('change', updateNightMode);
        } catch (e) {
          try { (mediaQuery as any).removeListener(updateNightMode); } catch (_) {}
        }
      }
    };
  }, []);

  // 1-Click Toggle between Clean Street Map and Satellite View (no menu list)
  const toggleMapType = useCallback(() => {
    setMapType((prev) => {
      const next: MapLayerType = prev === 'satellite' ? 'standard' : 'satellite';
      safeToast.info(next === 'satellite' ? 'Switched to Satellite View' : 'Switched to Clean Street Map', {
        id: 'map-layer',
        duration: 1800,
        icon: null
      });
      return next;
    });
  }, []);

  // Derive sanitized center without keeping redundant internal state
  const sanitizedCenter = useMemo(() => {
    let lat = typeof center?.lat === 'number' && !isNaN(center?.lat) ? center.lat : 17.4504;
    let lng = typeof center?.lng === 'number' && !isNaN(center?.lng) ? center.lng : 78.3808;
    if (lat < -90 || lat > 90) lat = 17.4504;
    if (lng < -180 || lng > 180) lng = 78.3808;
    return { lat, lng };
  }, [center?.lat, center?.lng]);

  const sanitizedZoom = typeof zoom === 'number' && !isNaN(zoom) ? zoom : 12;

  // Handle escape key to exit fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Invalidate map size whenever fullscreen toggles or height changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const invalidate = () => {
      try {
        map.invalidateSize({ pan: false, debounceMoveend: false });
        map.eachLayer((l: any) => {
          if (typeof l._update === 'function') l._update();
        });
      } catch (e) {}
    };

    invalidate();
    const raf1 = requestAnimationFrame(invalidate);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(invalidate));
    const t1 = setTimeout(invalidate, 40);
    const t2 = setTimeout(invalidate, 120);
    const t3 = setTimeout(invalidate, 300);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isFullscreen, height]);

  // Decouple side effects completely from state updater
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      setTimeout(() => {
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.invalidateSize({ pan: false, debounceMoveend: false });
            mapInstanceRef.current.eachLayer((l: any) => {
              if (typeof l._update === 'function') l._update();
            });
          } catch (e) {}
        }
        if (next) {
          safeToast.success('Fullscreen map view enabled (Press Esc to exit)', { id: 'map-fullscreen', duration: 2500 });
        } else {
          safeToast.success('Exited fullscreen view', { id: 'map-fullscreen', duration: 1500 });
        }
      }, 20);
      return next;
    });
  }, []);

  const isNightActive = isNightMode && mapType !== 'satellite';
  const activeLayerConfig = mapType === 'satellite' ? MAP_LAYERS.satellite : MAP_LAYERS.standard;

  return (
    <div 
      className={cn(
        "rounded-2xl overflow-hidden shadow-lg border border-slate-200 relative group",
        isFullscreen 
          ? "fixed inset-0 z-[99999] w-screen h-screen rounded-none border-none shadow-2xl bg-slate-950 m-0 p-0" 
          : "w-full z-0",
        className
      )} 
      style={{ 
        height: isFullscreen ? '100vh' : height,
        ...(isFullscreen ? { top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', position: 'fixed' } : {})
      }}
    >
      {/* Top Banner when in fullscreen mode */}
      {isFullscreen && (
        <div className="absolute top-4 left-4 z-[2000] flex items-center gap-2.5 bg-slate-900/90 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-2xl border border-slate-700 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-black tracking-wide uppercase">Expanded Fullscreen Map</span>
          {isNightActive && (
            <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              🌙 Night Mode
            </span>
          )}
          {mapType === 'satellite' && (
            <span className="text-[10px] font-bold bg-blue-500/30 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              🛰️ Satellite View
            </span>
          )}
          <button 
            type="button"
            onClick={toggleFullscreen}
            className="ml-2 text-[11px] font-black bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
          >
            <Minimize2 className="w-3 h-3" />
            Exit (Esc)
          </button>
        </div>
      )}

      <MapContainer 
        center={[sanitizedCenter.lat, sanitizedCenter.lng]} 
        zoom={sanitizedZoom} 
        maxZoom={19}
        minZoom={3}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
        className={cn(
          "w-full h-full",
          mapType === 'satellite' ? "satellite-mode" : "",
          isNightActive ? "google-night-mode" : ""
        )}
      >
        {/* Base Tile Layer directly mounted inside MapContainer */}
        <TileLayer
          key={`${mapType}-${isNightActive ? 'night' : 'day'}`}
          attribution={activeLayerConfig.attribution}
          url={activeLayerConfig.url}
          subdomains={activeLayerConfig.subdomains || 'abc'}
          maxZoom={19}
          maxNativeZoom={activeLayerConfig.maxNativeZoom || 18}
        />

        <ChangeView center={sanitizedCenter} zoom={sanitizedZoom} bounds={bounds} />
        <MapAutoResizer trigger={isFullscreen ? 'fullscreen' : height} />
        <MobileScrollHelper isFullscreen={isFullscreen} />

        {!hideControls && (
          <CustomControls 
            mapType={mapType}
            onToggleMapType={toggleMapType}
            hideMapStyles={hideMapStyles} 
            position={controlsPosition} 
            driverCoords={driverCoords}
            targetStopCoords={targetStopCoords}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
        )}

        <MapReadyTrigger 
          onMapReady={onMapReady} 
          onStoreMap={(m) => { 
            mapInstanceRef.current = m;
            try {
              m.invalidateSize({ pan: false, debounceMoveend: false });
            } catch (e) {}
          }} 
        />
        {!hideUserLocation && <UserLocationMarker highAccuracy={highAccuracy} />}
        <MapClickHandler onClick={onClick} />
        {children}
      </MapContainer>
    </div>
  );
}

export { Marker, Popup, Polyline };
