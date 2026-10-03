import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Locate, Maximize2, Minimize2, Layers, Plus, Minus, Target, Loader2, Check, X, Map } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
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
  const glow = shadowColor || color || '#3b82f6';
  const icon = new L.DivIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative flex flex-col items-center justify-center select-none pointer-events-auto" style="filter: drop-shadow(0 10px 20px rgba(0,0,0,0.22));">
        ${label ? `
          <div class="absolute -top-9 px-2.5 py-1 text-[8.5px] font-black rounded-full shadow-xl whitespace-nowrap uppercase tracking-wider border z-50 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200" 
               style="background-color: ${labelBgColor || '#0f172a'}; color: ${labelTextColor || '#ffffff'}; border-color: rgba(255,255,255,0.2); backdrop-filter: blur(8px);">
            <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background-color: ${color}"></span>
            <span class="drop-shadow-xs">${label}</span>
          </div>
        ` : ''}
        
        <!-- Radiant Ambient Glow Halo -->
        <div class="absolute w-12 h-12 rounded-full opacity-45 pointer-events-none" style="background-color: ${glow}; filter: blur(7px);"></div>
        
        <!-- Premium Hex/Rounded Core -->
        <div class="relative w-11 h-11 rounded-2xl flex items-center justify-center p-0.5 transition-transform duration-200 hover:scale-110 active:scale-95 shadow-md"
             style="background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%); border: 3px solid ${color};">
          <div class="w-full h-full rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-inner">
            <img src="${resolvedIconUrl}" class="w-6 h-6 object-contain drop-shadow-xs" alt="" />
          </div>
        </div>
        
        <!-- Sharp Downward Pointer Tip -->
        <div class="w-2.5 h-2.5 rotate-45 -mt-1 rounded-xs border-r-2 border-b-2 shadow-xs" 
             style="background-color: #f1f5f9; border-color: ${color};"></div>
      </div>
    `,
    iconSize: [46, 52],
    iconAnchor: [23, 50],
    popupAnchor: [0, -50],
  });

  iconCache[cacheKey] = icon;
  return icon;
};

const userLocationIcon = new L.DivIcon({
  className: 'user-location-icon',
  html: `
    <div class="relative flex items-center justify-center select-none pointer-events-none">
      <div class="absolute w-12 h-12 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
      <div class="absolute w-8 h-8 bg-blue-400/30 rounded-full animate-pulse"></div>
      <div class="relative w-4 h-4 bg-gradient-to-tr from-blue-700 to-blue-500 border-2 border-white rounded-full shadow-lg ring-4 ring-blue-500/25"></div>
    </div>
  `,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

export const vehicleIcon = createMarkerIcon('#3b82f6', getLocalIcon('bus'), '#3b82f6');
export const stationIcon = createMarkerIcon('#10b981', getLocalIcon('bus-stop'), '#34d399');
export const terminalIcon = createMarkerIcon('#f43f5e', getLocalIcon('marker'), '#fb7185');

function UserLocationMarker({ highAccuracy = true }: { highAccuracy?: boolean }) {
  const cached = getLastKnownLocation();
  const [position, setPosition] = useState<[number, number] | null>(
    cached ? [cached.lat, cached.lng] : null
  );
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    let isMounted = true;
    let capacitorWatchId: string | null = null;
    let browserWatchId: number | null = null;

    const startLocationTracking = async () => {
      // 1. Mobile Native App (Capacitor) High-Accuracy GPS
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            await Geolocation.requestPermissions();
          }
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
          if (pos?.coords && isMounted) {
            const { latitude: lat, longitude: lng } = pos.coords;
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              saveLastKnownLocation(lat, lng);
              setPosition([lat, lng]);
            }
          }

          capacitorWatchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true },
            (watchPos) => {
              if (!isMounted || !watchPos?.coords) return;
              const { latitude: lat, longitude: lng } = watchPos.coords;
              if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                saveLastKnownLocation(lat, lng);
                setPosition([lat, lng]);
              }
            }
          );
          return;
        } catch (capErr) {
          console.warn("Capacitor Geolocation notice:", capErr);
        }
      }

      // 2. High-Accuracy Browser Geolocation
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
          (err) => {
            console.warn("High-accuracy geolocation initial fix fallback:", err);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        browserWatchId = navigator.geolocation.watchPosition(
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
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    };

    startLocationTracking();

    return () => {
      isMounted = false;
      if (capacitorWatchId) {
        Geolocation.clearWatch({ id: capacitorWatchId }).catch(() => {});
      }
      if (browserWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(browserWatchId);
      }
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
    map.dragging.enable();
    if (map.touchZoom) {
      map.touchZoom.enable();
    }
    if (map.doubleClickZoom) {
      map.doubleClickZoom.enable();
    }
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

// High-resolution Google Maps tile layers providing all street details, building outlines,
// landmarks, transit stops, and POIs exactly matching standard Google Maps.
export const MAP_LAYERS = {
  standard: {
    name: 'Google Streets',
    tag: 'Standard Road Map',
    icon: '🗺️',
    desc: 'Google Maps street layout with landmarks, building footprints, house numbers, and POIs',
    url: 'https://mt{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20
  },
  satellite: {
    name: 'Google Satellite',
    tag: 'Satellite & Roads',
    icon: '🛰️',
    desc: 'High-resolution Google aerial satellite photography with street overlays and labels',
    url: 'https://mt{s}.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20
  },
  traffic: {
    name: 'Live Traffic',
    tag: 'Real-time Traffic',
    icon: '🚦',
    desc: 'Google Maps real-time traffic flow indicators, delays, and transit routes',
    url: 'https://mt{s}.google.com/vt/lyrs=m,traffic&hl=en&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20
  },
  terrain: {
    name: 'Google Terrain',
    tag: 'Elevation & Relief',
    icon: '⛰️',
    desc: 'Google Maps topographic relief, elevation contours, and landscape details',
    url: 'https://mt{s}.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    maxNativeZoom: 18
  },
  light: {
    name: 'Google Streets',
    tag: 'Standard Road Map',
    icon: '🗺️',
    desc: 'Google Maps street layout with landmarks, building footprints, house numbers, and POIs',
    url: 'https://mt{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20
  },
  dark: {
    name: 'Live Traffic',
    tag: 'Real-time Traffic',
    icon: '🚦',
    desc: 'Google Maps real-time traffic flow indicators, delays, and transit routes',
    url: 'https://mt{s}.google.com/vt/lyrs=m,traffic&hl=en&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20
  },
  topo: {
    name: 'Google Terrain',
    tag: 'Elevation & Relief',
    icon: '⛰️',
    desc: 'Google Maps topographic relief, elevation contours, and landscape details',
    url: 'https://mt{s}.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    maxNativeZoom: 18
  }
};

export type MapLayerType = keyof typeof MAP_LAYERS;

interface CustomControlsProps {
  mapType: MapLayerType;
  onToggleMapType: () => void;
  onSelectMapType?: (type: MapLayerType) => void;
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
  onSelectMapType,
  hideMapStyles = false, 
  position = 'top-right',
  driverCoords,
  targetStopCoords,
  isFullscreen = false,
  onToggleFullscreen
}: CustomControlsProps) {
  const map = useMap();
  const [isLocating, setIsLocating] = useState(false);
  const [isLayersOpen, setIsLayersOpen] = useState(false);

  const controlCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const onLocate = async () => {
    setIsLocating(true);

    // 1. Mobile Native App (Capacitor) High-Accuracy GPS
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          await Geolocation.requestPermissions();
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
        if (pos?.coords) {
          const { latitude: lat, longitude: lng } = pos.coords;
          if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            saveLastKnownLocation(lat, lng);
            map.flyTo([lat, lng], 18, { animate: true, duration: 0.8 });
            safeToast.success('Centered on current GPS location', { id: 'gps-locate' });
            setIsLocating(false);
            return;
          }
        }
      } catch (capErr: any) {
        console.warn("Capacitor onLocate notice:", capErr);
      }
    }

    // 2. High-Accuracy Web Geolocation
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            saveLastKnownLocation(lat, lng);
            map.flyTo([lat, lng], 18, { animate: true, duration: 0.8 });
            safeToast.success('Centered on current location', { id: 'gps-locate' });
          }
          setIsLocating(false);
        },
        (err) => {
          console.warn("High-accuracy locate fallback:", err);
          const cached = getLastKnownLocation();
          if (cached) {
            map.flyTo([cached.lat, cached.lng], 18, { animate: true, duration: 0.8 });
            safeToast.success('Centered on last known location', { id: 'gps-locate' });
          } else {
            safeToast.error('Please allow location permissions to locate your device', { id: 'gps-locate' });
          }
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsLocating(false);
      safeToast.error('Geolocation is not supported by your browser', { id: 'gps-locate' });
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
          "w-11 h-11 rounded-2xl shadow-xl border flex items-center justify-center transition-all active:scale-90 backdrop-blur-md",
          isLocating 
            ? "text-blue-600 bg-blue-50/95 border-blue-300 ring-2 ring-blue-400/30" 
            : "text-slate-700 bg-white/95 border-slate-200/90 hover:bg-white hover:text-blue-600 hover:shadow-2xl"
        )}
        title={isLocating ? "Locating current position..." : "Go to Current Location (Immediate)"}
      >
        {isLocating ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        ) : (
          <Locate className="w-5 h-5" />
        )}
      </button>

      {/* Zoom Controls */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col">
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            if (map.getZoom() < 21) {
              map.zoomIn(); 
            } else {
              safeToast.success('Maximum zoom level reached', { id: 'max-zoom' });
            }
          }}
          className="w-11 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100/80 border-b border-slate-100 transition-colors active:scale-95 cursor-pointer"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            if (map.getZoom() > 3) {
              map.zoomOut(); 
            }
          }}
          className="w-11 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100/80 transition-colors active:scale-95 cursor-pointer"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Map Style: 1-Click Direct Toggle (Default Map <-> Satellite Map) */}
      {!hideMapStyles && (
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            onToggleMapType();
          }}
          className={cn(
            "w-11 h-11 rounded-2xl shadow-xl border flex items-center justify-center transition-all active:scale-95 group backdrop-blur-md cursor-pointer",
            mapType === 'satellite'
              ? "text-blue-600 bg-blue-50/95 border-blue-300 ring-2 ring-blue-400/30 shadow-blue-100" 
              : "text-slate-700 bg-white/95 border-slate-200/90 hover:text-blue-600 hover:bg-white"
          )}
          title={mapType === 'satellite' ? "Switch to Default Map" : "Switch to Satellite Map"}
        >
          {mapType === 'satellite' ? (
            <Map className="w-5 h-5 text-blue-600" />
          ) : (
            <Layers className="w-5 h-5" />
          )}
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
          "w-11 h-11 rounded-2xl shadow-xl border flex items-center justify-center transition-all active:scale-95 backdrop-blur-md",
          isFullscreen 
            ? "text-blue-600 bg-blue-50/95 border-blue-300 ring-2 ring-blue-400/30" 
            : "text-slate-700 bg-white/95 border-slate-200/90 hover:text-blue-600 hover:bg-white"
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

  // 1-Click Toggle or select between Google Map styles: Standard (Streets), Satellite, Traffic, Terrain
  const toggleMapType = useCallback(() => {
    setMapType((prev) => {
      const types: MapLayerType[] = ['standard', 'satellite', 'traffic', 'terrain'];
      const nextIdx = (types.indexOf(prev) + 1) % types.length;
      const next = types[nextIdx];
      safeToast.info(`Switched to ${MAP_LAYERS[next]?.name || next}`, {
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

  const activeLayerConfig = MAP_LAYERS[mapType] || MAP_LAYERS.standard;

  const mapElement = (
    <div 
      className={cn(
        "rounded-2xl overflow-hidden shadow-lg border border-slate-200 relative group",
        isFullscreen 
          ? "fixed inset-0 z-[99999999] w-screen h-screen rounded-none border-none shadow-2xl bg-slate-950 m-0 p-0" 
          : "w-full z-0",
        className
      )} 
      style={{ 
        height: isFullscreen ? '100vh' : height,
        ...(isFullscreen ? { top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', position: 'fixed', zIndex: 99999999 } : {})
      }}
    >
      <MapContainer 
        center={[sanitizedCenter.lat, sanitizedCenter.lng]} 
        zoom={sanitizedZoom} 
        maxZoom={21}
        minZoom={3}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
        className={cn(
          "w-full h-full",
          mapType === 'satellite' ? "satellite-mode" : ""
        )}
      >
        {/* Base Tile Layer directly mounted inside MapContainer */}
        <TileLayer
          key={`${mapType}-${activeLayerConfig.url}`}
          attribution={activeLayerConfig.attribution}
          url={activeLayerConfig.url}
          subdomains={activeLayerConfig.subdomains || ['0', '1', '2', '3']}
          maxZoom={21}
          maxNativeZoom={activeLayerConfig.maxNativeZoom || 20}
          eventHandlers={{
            tileerror: (error: any) => {
              const img = error?.tile;
              if (img && img.dataset && !img.dataset.fallbackTried) {
                img.dataset.fallbackTried = 'true';
                const coords = error?.coords;
                if (coords) {
                  img.src = `https://mt2.google.com/vt/lyrs=m&hl=en&x=${coords.x}&y=${coords.y}&z=${coords.z}`;
                }
              }
            }
          }}
        />

        <ChangeView center={sanitizedCenter} zoom={sanitizedZoom} bounds={bounds} />
        <MapAutoResizer trigger={isFullscreen ? 'fullscreen' : height} />
        <MobileScrollHelper isFullscreen={isFullscreen} />

        {!hideControls && (
          <CustomControls 
            mapType={mapType}
            onToggleMapType={toggleMapType}
            onSelectMapType={(type) => setMapType(type)}
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

  if (isFullscreen && typeof document !== 'undefined') {
    return createPortal(mapElement, document.body);
  }

  return mapElement;
}

export { Marker, Popup, Polyline };
