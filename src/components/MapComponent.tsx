import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Locate, Maximize2, Layers, Plus, Minus, Navigation, Target } from 'lucide-react';
import { cn, getLocalIcon } from '../lib/utils';
import { getCurrentPosition } from '../lib/locationService';
import toast from 'react-hot-toast';

// Fix for default marker icons in Leaflet with React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: getLocalIcon('marker'),
  iconUrl: getLocalIcon('marker'),
  shadowUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
});

// Custom Icons using SVG for better quality and responsiveness
// Custom Icons cache to prevent recreating multiple identical DivIcons
const iconCache: Record<string, L.DivIcon> = {};

export const createMarkerIcon = (color: string, iconUrl?: string, shadowColor?: string, label?: string, labelBgColor?: string, labelTextColor?: string) => {
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

const vehicleIcon = createMarkerIcon('#3b82f6', getLocalIcon('bus'), '#3b82f6');
const stationIcon = createMarkerIcon('#10b981', getLocalIcon('bus-stop'), '#34d399');
const terminalIcon = createMarkerIcon('#f43f5e', getLocalIcon('marker'), '#fb7185');

function UserLocationMarker({ highAccuracy = false }: { highAccuracy?: boolean }) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const map = useMap();

  useEffect(() => {
    let fallbackTimer: any;
    let isFallback = false;

    const startLocating = (accuracy: boolean) => {
      map.locate({ 
        watch: true, 
        enableHighAccuracy: accuracy, 
        timeout: accuracy ? 15000 : 30000, 
        maximumAge: accuracy ? 10000 : 60000 
      });
    };

    const handleFound = (e: L.LocationEvent) => {
      setPosition([e.latlng.lat, e.latlng.lng]);
    };

    const handleError = (e: L.ErrorEvent) => {
      console.warn(`Location tracking error (highAccuracy=${!isFallback}):`, e.message);
      if (!isFallback && highAccuracy) {
        isFallback = true;
        map.stopLocate();
        fallbackTimer = setTimeout(() => {
          startLocating(false);
        }, 1000);
      }
    };

    map.on('locationfound', handleFound);
    map.on('locationerror', handleError);

    startLocating(highAccuracy);

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      map.stopLocate();
      map.off('locationfound', handleFound);
      map.off('locationerror', handleError);
    };
  }, [map, highAccuracy]);

  return position === null ? null : (
    <Marker position={position} icon={userLocationIcon}>
      <Popup>
        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">You are here</span>
      </Popup>
    </Marker>
  );
}

interface MapComponentProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  bounds?: [number, number][];
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

function MapReadyTrigger({ onMapReady }: { onMapReady?: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);
  return null;
}

function MapClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  const clickTimeout = React.useRef<NodeJS.Timeout | null>(null);

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
        }, 250); // 250ms is enough to detect double click
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

function ChangeView({ center, zoom, bounds }: { center: { lat: number; lng: number }, zoom: number, bounds?: [number, number][] }) {
  const map = useMap();
  const boundsString = bounds ? JSON.stringify(bounds) : '';

  useEffect(() => {
    const lat = typeof center?.lat === 'number' ? center.lat : parseFloat(center?.lat as any);
    const lng = typeof center?.lng === 'number' ? center.lng : parseFloat(center?.lng as any);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn("ChangeView blocked due to invalid coordinates:", center);
      return;
    }

    if (bounds && bounds.length > 0) {
      try {
        map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [50, 50], maxZoom: 16 });
      } catch (err) {
        console.warn("fitBounds failed", err);
      }
    } else {
      map.setView([lat, lng], zoom);
    }
  }, [center?.lat, center?.lng, zoom, boundsString]);
  return null;
}

function CustomControls({ 
  hideMapStyles = false, 
  position = 'top-right',
  driverCoords,
  targetStopCoords
}: { 
  hideMapStyles?: boolean; 
  position?: 'top-right' | 'bottom-right';
  driverCoords?: { lat: number; lng: number } | null;
  targetStopCoords?: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const [mapType, setMapType] = useState<'voyager' | 'positron' | 'dark'>('voyager');

  const controlCallback = React.useCallback((node: HTMLDivElement | null) => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  useEffect(() => {
    // Invalidate size on mount to fix gray area issues in modals
    map.invalidateSize();
  }, [map]);

  const onLocate = async () => {
    const pos = await getCurrentPosition();
    if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
      map.flyTo([pos.lat, pos.lng], 16);
    } else {
      toast.error('Unable to retrieve current location. Please verify GPS settings.');
    }
  };

  const onFitDriverAndStop = () => {
    const coordsToFit: L.LatLngExpression[] = [];
    
    if (driverCoords && typeof driverCoords.lat === 'number' && !isNaN(driverCoords.lat) && Math.abs(driverCoords.lat) > 0.1) {
      coordsToFit.push([driverCoords.lat, driverCoords.lng]);
    }
    
    if (targetStopCoords && typeof targetStopCoords.lat === 'number' && !isNaN(targetStopCoords.lat) && Math.abs(targetStopCoords.lat) > 0.1) {
      coordsToFit.push([targetStopCoords.lat, targetStopCoords.lng]);
    }

    if (coordsToFit.length >= 2) {
      const bounds = L.latLngBounds(coordsToFit);
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      toast.success("Framed Live Driver & Destination Stop", { id: "focus-success" });
    } else if (coordsToFit.length === 1) {
      map.flyTo(coordsToFit[0], 15);
      toast.success("Centred on Live Location", { id: "focus-success" });
    } else {
      toast.error("Waiting for Live Driver and Stop coordinates...", { id: "focus-warn" });
    }
  };

  const layers = {
    voyager: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    positron: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
  };

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>, &copy; <a href="https://openstreetmap.org">OSM</a>'
        url={layers[mapType]}
      />
      
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
          className="w-11 h-11 bg-white rounded-full shadow-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 hover:border-blue-100 transition-all active:scale-90"
          title="Go to Current Location"
        >
          <Locate className="w-5 h-5" />
        </button>

        {/* Zoom Controls */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); map.zoomIn(); }}
            className="w-11 h-11 flex items-center justify-center text-slate-600 hover:bg-slate-50 border-b border-slate-100 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); map.zoomOut(); }}
            className="w-11 h-11 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>

        {/* Cycle Map Style */}
        {!hideMapStyles && (
          <button 
            type="button"
            onClick={(e) => { 
              e.stopPropagation(); 
              const nextType = mapType === 'voyager' ? 'positron' : mapType === 'positron' ? 'dark' : 'voyager';
              setMapType(nextType);
            }}
            className="w-11 h-11 bg-white rounded-full shadow-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-all active:scale-95"
            title="Cycle Map Style (Voyager / Positron / Dark)"
          >
            <Layers className="w-5 h-5" />
          </button>
        )}

        {/* Expand / Maximize */}
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            const container = map.getContainer().parentElement;
            if (container) {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                container.requestFullscreen();
              }
            }
          }}
          className="w-11 h-11 bg-white rounded-full shadow-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all active:scale-95"
          title="Toggle Fullscreen"
        >
          <Maximize2 className="w-5 h-5" />
        </button>

        {/* Focus Driver & Targeted Stop (ONLY show if coordinates are active & provided to prevent overflow) */}
        {(driverCoords || targetStopCoords) && (
          <button 
            type="button"
            onClick={(e) => { 
              e.stopPropagation(); 
              onFitDriverAndStop();
            }}
            className="w-11 h-11 bg-emerald-600 rounded-full shadow-xl border border-emerald-500 flex items-center justify-center text-white hover:bg-emerald-700 hover:border-emerald-600 transition-all active:scale-90"
            title="Show Driver & Stop in Single Frame"
          >
            <Target className="w-5 h-5" />
          </button>
        )}
      </div>
    </>
  );
}

function InvalidateSize({ trigger }: { trigger: any }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
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
  hideMapStyles = true,
  hideUserLocation = false,
  highAccuracy = false,
  controlsPosition = 'top-right',
  onMapReady,
  onClick,
  driverCoords,
  targetStopCoords
}: MapComponentProps) {
  const [currentCenter, setCurrentCenter] = useState(center || { lat: 17.4504, lng: 78.3808 });
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [currentHeight, setCurrentHeight] = useState(height);

  useEffect(() => {
    if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
      setCurrentCenter(center);
    }
  }, [center?.lat, center?.lng]);

  useEffect(() => {
    setCurrentZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    setCurrentHeight(height);
  }, [height]);

  let mapCenterLat = typeof currentCenter?.lat === 'number' && !isNaN(currentCenter?.lat) ? currentCenter.lat : 17.4504;
  let mapCenterLng = typeof currentCenter?.lng === 'number' && !isNaN(currentCenter?.lng) ? currentCenter.lng : 78.3808;
  if (mapCenterLat < -90 || mapCenterLat > 90) mapCenterLat = 17.4504;
  if (mapCenterLng < -180 || mapCenterLng > 180) mapCenterLng = 78.3808;

  return (
    <div className={cn("w-full rounded-2xl overflow-hidden shadow-lg border border-slate-200 relative group z-0", className)} style={{ height: currentHeight }}>
      <MapContainer 
        center={[mapCenterLat, mapCenterLng]} 
        zoom={currentZoom} 
        scrollWheelZoom={true}
        zoomControl={false} // We use custom controls
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <ChangeView center={{ lat: mapCenterLat, lng: mapCenterLng }} zoom={currentZoom} bounds={bounds} />
        <InvalidateSize trigger={currentHeight} />
        {!hideControls && (
          <CustomControls 
            hideMapStyles={hideMapStyles} 
            position={controlsPosition} 
            driverCoords={driverCoords}
            targetStopCoords={targetStopCoords}
          />
        )}
        {hideControls && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>, &copy; <a href="https://openstreetmap.org">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
        )}
        <MapReadyTrigger onMapReady={onMapReady} />
        {!hideUserLocation && <UserLocationMarker highAccuracy={highAccuracy} />}
        <MapClickHandler onClick={onClick} />
        {children}
      </MapContainer>
    </div>
  );
}

export { Marker, Popup, Polyline, vehicleIcon, stationIcon, terminalIcon };
