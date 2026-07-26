import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  MapPin,
  Users,
  CheckCircle,
  XCircle,
  Square,
  Navigation,
  Activity,
  Download,
  Filter,
  Search,
  Calendar,
  Clock,
  X,
  Target,
  Shield,
  ChevronRight,
} from "lucide-react";
import MapComponent, {
  Marker,
  vehicleIcon,
  stationIcon,
  Popup,
  createMarkerIcon,
  Polyline,
} from "../components/MapComponent";
import { useAuth } from "../contexts/AuthContext";
import { watchLocation } from "../lib/locationService";
import {
  doc,
  onSnapshot,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  query,
  where,
  getDocs,
  setDoc,
  arrayUnion,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import {
  cn,
  isValidCoordinate,
  getSectorTerminology,
  getSortedStops,
  getLocalAvatar, getUserAvatar,
  getLocalIcon,
} from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import toast from "react-hot-toast";
import { saveMySQLRecord, saveMySQLRecordsBatch } from "../lib/mysql";

interface DriverDashboardProps {
  driverData?: any;
  setDriverData?: (d: any) => void;
  driverDataLoading?: boolean;
  activeTrip?: any;
  setActiveTrip?: (t: any) => void;
}

export default function DriverDashboard({
  driverData,
  setDriverData,
  driverDataLoading,
  activeTrip: propActiveTrip,
  setActiveTrip: propSetActiveTrip,
}: DriverDashboardProps = {}) {
  const { userData } = useAuth();
  const [route, setRoute] = useState<any>(null);
  const [allAssignedRoutes, setAllAssignedRoutes] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [localActiveTrip, setLocalActiveTrip] = useState<any>(null);
  const activeTrip = propActiveTrip !== undefined ? propActiveTrip : localActiveTrip;
  const setActiveTrip = propSetActiveTrip !== undefined ? propSetActiveTrip : setLocalActiveTrip;
  const [tripType, setTripType] = useState<"pickup" | "dropoff">("pickup");
  const [isTracking, setIsTracking] = useState(false);
  const [manifest, setManifest] = useState<any[]>([]);
  const [filterStopId, setFilterStopId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyTrips, setHistoryTrips] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [roadCoords, setRoadCoords] = useState<[number, number][]>([]);

  const sortedStopsList = React.useMemo(() => {
    return getSortedStops(
      route?.pickupPoints,
      activeTrip,
      activeTrip?.direction || "pickup",
    );
  }, [route?.pickupPoints, activeTrip]);

  const watchId = useRef<number | null>(null);
  const lastFetchedCoordsRef = useRef<string>("");
  const transitionPending = useRef<string | null>(null);

  const getDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => {
    const R = 6371e3; // meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // meters
  };

  const parseToDate = (val: any): Date | null => {
    if (!val) return null;
    try {
      if (typeof val.toDate === "function") {
        return val.toDate();
      }
      if (val instanceof Date) {
        return val;
      }
      if (typeof val === 'object' && val.seconds) {
        return new Date(val.seconds * 1000);
      }
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const isToday = (dateVal: any) => {
    if (!dateVal) return false;
    try {
      let d: Date;
      if (typeof dateVal.toDate === "function") {
        d = dateVal.toDate();
      } else if (dateVal instanceof Date) {
        d = dateVal;
      } else {
        d = new Date(dateVal);
      }

      const today = new Date();
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    } catch (e) {
      return false;
    }
  };

  const isHandled = (u: any, direction: "pickup" | "dropoff") => {
    // Check direction-specific status first
    const dirStatus =
      direction === "dropoff" ? u.dropoffStatus : u.pickupStatus;
    const dirUpdatedAt =
      direction === "dropoff" ? u.dropoffUpdatedAt : u.pickupUpdatedAt;

    if (dirStatus && dirStatus !== "waiting" && isToday(dirUpdatedAt)) {
      if (dirStatus === "absent") return true;
      if (direction === "dropoff") return dirStatus === "dropped";
      return dirStatus === "picked" || dirStatus === "dropped";
    }

    // Fallback to legacy status if today
    if (
      u.status &&
      u.status !== "waiting" &&
      isToday(u.statusUpdatedAt || u.pickedAt)
    ) {
      if (u.status === "absent") return true;
      if (direction === "dropoff") return u.status === "dropped";
      return u.status === "picked" || u.status === "dropped";
    }

    return false;
  };

  // Separate cleanup for geolocation watch to ensure navigation doesn't leak
  useEffect(() => {
    return () => {
      if (watchId.current) {
        if (typeof watchId.current === 'function') {
          (watchId.current as any)();
        } else if (typeof watchId.current === 'number') {
          navigator.geolocation.clearWatch(watchId.current);
        }
      }
    };
  }, []);

  // Sync the Driver Dashboard data entirely using MySQL (polling at 3s if no parent-level data is provided)
  useEffect(() => {
    const currentDriverId = userData?.id || userData?.uid;
    if (!currentDriverId) return;

    const processData = (res: any) => {
      // Set Organization (straight from MySQL)
      if (res.org) {
        setOrg(res.org);
      }

      // Set Route details
      let targetRoute = null;
      let matchedRoutes = [];
      const cDriverId = userData?.id || userData?.uid;
      if (res.routes) {
        matchedRoutes = res.routes.filter(
          (r: any) =>
            r &&
            (r.id === userData?.routeId ||
              (cDriverId && r.driverId === cDriverId)),
        );
        setAllAssignedRoutes(matchedRoutes);

        let matchedTrip = null;
        if (res.trips) {
          matchedTrip = res.trips.find(
            (t: any) =>
              t &&
              t.driverId === cDriverId &&
              (t.status === "ongoing" || t.status === "live"),
          );
        }

        if (matchedTrip?.routeId) {
          targetRoute =
            matchedRoutes.find((r: any) => r.id === matchedTrip.routeId) ||
            res.routes.find((r: any) => r.id === matchedTrip.routeId);
        } else if (selectedRouteId) {
          targetRoute =
            matchedRoutes.find((r: any) => r.id === selectedRouteId) ||
            matchedRoutes[0];
        } else {
          targetRoute = matchedRoutes[0];
        }

        if (targetRoute) {
          setRoute(targetRoute);
          if (!selectedRouteId) {
            setSelectedRouteId(targetRoute.id);
          }
        }
      }

      // Set Route Manifest (assigned users)
      const targetRouteId = targetRoute?.id || userData?.routeId;
      if (res.users && targetRouteId) {
        const routeUsers = res.users.filter(
          (u: any) => u && u.routeId === targetRouteId && (u.role === "user" || u.role === "member"),
        );
        setManifest(
          routeUsers.map((user: any) => {
            const pickupStatus =
              user.pickupStatus && isToday(user.pickupUpdatedAt)
                ? user.pickupStatus
                : "waiting";
            const dropoffStatus =
              user.dropoffStatus && isToday(user.dropoffUpdatedAt)
                ? user.dropoffStatus
                : "waiting";
            return {
              id: user.uid || user.id,
              ...user,
              pickupStatus,
              dropoffStatus,
            };
          }),
        );
      }

      // Set Active Trip
      let matchedTrip = null;
      if (res.trips) {
        matchedTrip = res.trips.find(
          (t: any) =>
            t &&
            t.driverId === cDriverId &&
            (t.status === "ongoing" || t.status === "live"),
        );
        if (matchedTrip) {
          setActiveTrip(matchedTrip);
          if (matchedTrip.direction) setTripType(matchedTrip.direction);
          setIsTracking(true);
        } else {
          setActiveTrip(null);
          setIsTracking(false);
        }
      }

      // Set Vehicle details
      if (res.vehicles) {
        const trackingVehicleId =
          matchedTrip?.vehicleId ||
          targetRoute?.vehicleId ||
          userData?.vehicleId ||
          "DEV-V1";
        const matchedVehicle = res.vehicles.find(
          (v: any) => v && v.id === trackingVehicleId,
        );
        if (matchedVehicle) {
          setVehicle(matchedVehicle);
        } else {
          setVehicle({
            id: trackingVehicleId,
            plateNumber: "BUS-01",
            status: "active",
          });
        }
      }
    };

    if (driverData) {
      processData(driverData);
      return;
    }

    const fetchMySQLDriverData = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const resObj = await fetch("/api/records/user-data", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (resObj.ok) {
          const res = await resObj.json();
          if (res.success) {
            processData(res);
          }
        }
      } catch (e) {
        console.warn("Driver MySQL polling error:", e);
      }
    };

    fetchMySQLDriverData();
    // Poll the endpoint every 3 seconds for extremely responsive tracking updates
    const interval = setInterval(fetchMySQLDriverData, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [
    userData?.id,
    userData?.uid,
    userData?.orgId,
    userData?.routeId,
    selectedRouteId,
    driverData,
  ]);

  const fetchRoadPath = async (stops: [number, number][]) => {
    if (stops.length < 2) {
      setRoadCoords([]);
      return;
    }

    const coordinates = stops.map((s) => `${s[1]},${s[0]}`).join(";");

    if (lastFetchedCoordsRef.current === coordinates) return;
    lastFetchedCoordsRef.current = coordinates;

    const urls = [
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
      `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
      `/api/proxy/osrm/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) continue;

        const data = await response.json();
        if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
          const path: [number, number][] =
            data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
          setRoadCoords(path);
          return; // Success! Exit early
        }
      } catch (err) {
        console.warn(
          `Failed fetching OSRM road path from ${url} on driver map`,
          err,
        );
      }
    }

    // fallback to straight lines if all fail
    setRoadCoords(stops);
  };

  useEffect(() => {
    if (!route?.pickupPoints) return;

    const stops: [number, number][] = [];
    if (
      vehicle?.location &&
      isValidCoordinate(vehicle.location.lat, vehicle.location.lng)
    ) {
      stops.push([vehicle.location.lat, vehicle.location.lng]);
    }

    const hub =
      org?.location && isValidCoordinate(org.location.lat, org.location.lng)
        ? ([org.location.lat, org.location.lng] as [number, number])
        : null;

    const direction = activeTrip?.direction || "pickup";
    const allMembersHandled =
      manifest.length > 0 && manifest.every((m) => isHandled(m, direction));

    if (allMembersHandled) {
      if (hub) {
        stops.push(hub);
      }
      if (stops.length >= 2) {
        fetchRoadPath(stops);
      } else {
        setRoadCoords([]);
      }
      return;
    }

    const points = getSortedStops(route.pickupPoints, activeTrip, direction);
    const currentStopId = activeTrip?.currentStopId;
    const currentStopIndexVal = points.findIndex(
      (p: any) => String(p.id) === String(currentStopId),
    );

    const routeStops = points
      .filter((p: any) => isValidCoordinate(p.lat, p.lng))
      .map((p: any) => [p.lat, p.lng] as [number, number]);

    if (direction === "pickup") {
      if (currentStopId === "ORG") {
        if (hub) stops.push(hub);
      } else if (currentStopIndexVal !== -1) {
        stops.push(
          ...points
            .slice(currentStopIndexVal)
            .map((p: any) => [p.lat, p.lng] as [number, number]),
        );
      } else {
        stops.push(...routeStops);
      }
    } else {
      // dropoff sequence
      if (currentStopIndexVal !== -1) {
        stops.push(
          ...points
            .slice(currentStopIndexVal)
            .map((p: any) => [p.lat, p.lng] as [number, number]),
        );
      } else {
        stops.push(...routeStops);
      }
    }

    if (stops.length >= 2) {
      fetchRoadPath(stops);
    } else {
      setRoadCoords([]);
    }
  }, [
    route?.id,
    vehicle?.location,
    org?.location,
    activeTrip?.currentStopId,
    activeTrip?.direction,
    manifest,
    activeTrip?.customStopsOrder,
  ]);

  // Automated stop advancement logic (from DriverMapView)
  useEffect(() => {
    if (
      !isTracking ||
      !activeTrip ||
      !route?.pickupPoints ||
      !vehicle?.location
    )
      return;

    const points = sortedStopsList;
    const currentIdx = points.findIndex(
      (p: any) => String(p.id) === String(activeTrip.currentStopId),
    );

    // 1. Auto-Target First Pending Stop in Sequence if none active
    if (currentIdx === -1 && !activeTrip.currentStopId) {
      let firstPendingStopId = null;

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (isValidCoordinate(p.lat, p.lng)) {
          const members = manifest.filter(
            (m) => String(m.pickupPointId) === String(p.id),
          );
          const direction = activeTrip.direction || "pickup";
          const allHandled =
            members.length === 0 ||
            members.every((m) => isHandled(m, direction));
          if (!allHandled) {
            firstPendingStopId = p.id;
            break;
          }
        }
      }

      if (firstPendingStopId && !transitionPending.current) {
        handleUpdateStop(String(firstPendingStopId));
      }
    }

    // 2. Advance to next stop
    if (activeTrip.currentStopId && vehicle?.location && currentIdx !== -1) {
      const currentStop = points[currentIdx];
      if (transitionPending.current === activeTrip.currentStopId) return;

      if (currentStop && isValidCoordinate(currentStop.lat, currentStop.lng)) {
        const distToCurrent = getDistance(
          vehicle.location.lat,
          vehicle.location.lng,
          currentStop.lat,
          currentStop.lng,
        );
        const members = manifest.filter(
          (m) => String(m.pickupPointId) === String(activeTrip.currentStopId),
        );
        const direction = activeTrip.direction || "pickup";
        const allHandled =
          members.length === 0 || members.every((m) => isHandled(m, direction));

        if (distToCurrent < 50 || allHandled) {
          // Find next pending stop
          let nextStopId = null;
          for (let i = currentIdx + 1; i < points.length; i++) {
            const p = points[i];
            const m = manifest.filter(
              (user) => String(user.pickupPointId) === String(p.id),
            );
            const handled =
              m.length === 0 || m.every((u) => isHandled(u, direction));
            if (!handled) {
              nextStopId = p.id;
              break;
            }
          }

          if (nextStopId) {
            transitionPending.current = activeTrip.currentStopId;
            setTimeout(() => handleUpdateStop(String(nextStopId)), 5000);
          } else if (String(activeTrip.currentStopId) !== "ORG") {
            transitionPending.current = activeTrip.currentStopId;
            setTimeout(() => handleUpdateStop("ORG"), 5000);
          }
        }
      }
    }
  }, [
    vehicle?.location,
    activeTrip?.currentStopId,
    route,
    isTracking,
    manifest,
    sortedStopsList,
  ]);

  const handleUpdateStop = async (stopId: string) => {
    if (!activeTrip) return;
    try {
      await saveMySQLRecord("update", "trips", activeTrip.id, {
        currentStopId: stopId,
      });
      transitionPending.current = null;
    } catch (e) {
      console.error("Error updating stop:", e);
    }
  };

  const orgIconUrl = getLocalIcon(
    org?.logo ||
      org?.logoUrl ||
      (org?.sector === "Education"
        ? org?.eduType === "College"
          ? "graduation-cap"
          : "school"
        : org?.sector === "Healthcare"
          ? "hospital"
          : org?.sector === "Government"
            ? "museum"
            : "commercial"),
  );
  const termPlural = getSectorTerminology(org?.sector);
  const termSingular = getSectorTerminology(org?.sector, false);

  const toggleTrip = async () => {
    try {
      if (isTracking) {
        // STOP TRIP
        setIsTracking(false);
        if (watchId.current) {
          if (typeof watchId.current === 'function') {
            (watchId.current as any)();
          } else if (typeof watchId.current === 'number') {
            navigator.geolocation.clearWatch(watchId.current);
          }
          watchId.current = null;
        }
        
        const activeTripId = activeTrip?.id;

        // Optimistic parent & local state updates
        setActiveTrip(null);
        if (setDriverData && driverData && activeTripId) {
          const updatedTrips = (driverData.trips || []).filter((t: any) => t && t.id !== activeTripId);
          setDriverData({
            ...driverData,
            trips: updatedTrips
          });
        }

        toast.success("Trip completed", { id: 'trip-toggle' });

        if (activeTripId) {
          // Fire database writes concurrently in background
          Promise.all([
            saveMySQLRecord("update", "trips", activeTripId, {
              status: "completed",
              endTime: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              manifest: JSON.stringify(
                manifest.map((m) => ({
                  uid: m.uid || m.id,
                  studentId: m.studentId || "",
                  name: m.name,
                  pickupStatus: m.pickupStatus || "waiting",
                  dropoffStatus: m.dropoffStatus || "waiting",
                  pickupUpdatedAt: m.pickupUpdatedAt || null,
                  dropoffUpdatedAt: m.dropoffUpdatedAt || null,
                  pickupPointId: m.pickupPointId,
                })),
              ),
            }),
            updateDoc(doc(db, 'trips', activeTripId), {
              status: 'completed',
              endTime: serverTimestamp()
            }).catch((err) => {
              console.warn("[StopTrip] Firestore trip completion failed:", err.message);
            }),
            vehicle ? saveMySQLRecord("update", "vehicles", vehicle.id, {
              status: "active",
            }) : Promise.resolve(),
            vehicle ? updateDoc(doc(db, 'vehicles', vehicle.id), {
              status: 'active'
            }).catch((err) => {
              console.warn("[StopTrip] Firestore vehicle completion failed:", err.message);
            }) : Promise.resolve()
          ]).catch((err) => {
            console.warn("[StopTrip] background writes failed:", err);
          });

          // Send notifications in the background
          try {
            const tripSummary =
              activeTrip.direction === "pickup"
                ? "Pick to School trip"
                : "Drop to Home trip";
            const batchOps = manifest.map((m) => {
              const existingNotifs = Array.isArray(m.notifications)
                ? m.notifications
                : [];
              const updatedNotifs = [
                ...existingNotifs,
                {
                  message: `🏁 ${tripSummary} for ${route?.name || "your route"} has been completed by ${userData.name}.`,
                  timestamp: new Date().toISOString(),
                  type: "trip_end",
                  dismissed: false,
                },
              ];
              return {
                operation: "update" as const,
                table: "users",
                id: m.uid || m.id,
                data: {
                  notifications: JSON.stringify(updatedNotifs)
                }
              };
            });
            saveMySQLRecordsBatch(batchOps).catch((err) => {
              console.warn("Background trip end notification batch failed:", err);
            });
          } catch (err) {
            console.error("Error setting up trip end notifications:", err);
          }
        }
      } else {
        // START TRIP
        if (!route || !vehicle) {
          return toast.error("Route/Vehicle configuration missing", { id: 'trip-toggle-err' });
        }

        setIsTracking(true);
        const newTripId =
          "TRIP-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        const isPickup = tripType === "pickup";
        const resetOps = manifest.map((m) => {
          const resetData: any = {};
          if (isPickup) {
            resetData.pickupStatus = "waiting";
            resetData.pickupUpdatedAt = null;
          } else {
            resetData.dropoffStatus = "waiting";
            resetData.dropoffUpdatedAt = null;
          }
          return {
            operation: "update" as const,
            table: "users",
            id: m.uid || m.id,
            data: resetData
          };
        });

        // Create a clean manifest based on the direction resetting
        const cleanManifest = manifest.map((m) => ({
          ...m,
          pickupStatus: isPickup ? "waiting" : m.pickupStatus,
          dropoffStatus: !isPickup ? "waiting" : m.dropoffStatus,
          pickupUpdatedAt: isPickup ? null : m.pickupUpdatedAt,
          dropoffUpdatedAt: !isPickup ? null : m.dropoffUpdatedAt,
        }));
        setManifest(cleanManifest);

        // Determine the first stop with pending members in the sorted order
        let initialStopId: any = null;
        if (route?.pickupPoints && route.pickupPoints.length > 0) {
          const sortedPoints = getSortedStops(route.pickupPoints, null, tripType);
          for (const p of sortedPoints) {
            if (isValidCoordinate(p.lat, p.lng)) {
              const stopMembers = cleanManifest.filter(u => String(u.pickupPointId) === String(p.id));
              const targetStatus = tripType === 'dropoff' ? 'dropped' : 'picked';
              const allHandled = stopMembers.length === 0 || stopMembers.every(u => u.status === targetStatus || u.status === 'absent');
              if (!allHandled) {
                initialStopId = p.id;
                break;
              }
            }
          }
          if (!initialStopId && sortedPoints.length > 0) {
            initialStopId = sortedPoints[0].id;
          }
        }

        const currentDriverId = userData?.id || userData?.uid;
        const createdTrip = {
          id: newTripId,
          routeId: route.id,
          vehicleId: vehicle.id,
          driverId: currentDriverId,
          status: "live",
          direction: tripType,
          currentLocation: JSON.stringify({
            lat: org?.location?.lat || 0,
            lng: org?.location?.lng || 0,
          }),
          startedAt: new Date().toISOString(),
          startTime: new Date().toISOString(),
          orgId: userData.orgId,
          currentStopId: initialStopId,
          manifest: JSON.stringify(
            cleanManifest.map((m) => ({
              uid: m.uid || m.id,
              studentId: m.studentId || "",
              name: m.name,
              pickupStatus: m.pickupStatus,
              dropoffStatus: m.dropoffStatus,
              pickupUpdatedAt: m.pickupUpdatedAt,
              dropoffUpdatedAt: m.dropoffUpdatedAt,
              pickupPointId: m.pickupPointId,
            }))
          ),
        };

        // Optimistic parent & local state updates
        setActiveTrip({
          id: newTripId,
          routeId: route.id,
          vehicleId: vehicle.id,
          direction: tripType,
          currentStopId: initialStopId,
          status: "live",
        });

        if (setDriverData && driverData) {
          const otherTrips = (driverData.trips || []).filter((t: any) => t && t.driverId !== currentDriverId);
          setDriverData({
            ...driverData,
            trips: [...otherTrips, createdTrip]
          });
        }

        toast.success("Trip sequence initiated", { id: 'trip-toggle' });

        // Notify all users on this route via MySQL in a single fast batch!
        const tripSummary = tripType === "pickup" ? "Pick Up" : "Drop Off";
        const notifyOps = manifest.map((m) => {
          const existingNotifs = Array.isArray(m.notifications)
            ? m.notifications
            : [];
          const updatedNotifs = [
            ...existingNotifs,
            {
              message: `🚌 ${tripSummary} for ${route?.name} has started! ${userData.name} is driving Bus ${vehicle.plateNumber || ""}.`,
              timestamp: new Date().toISOString(),
              type: "trip_start",
              dismissed: false,
            },
          ];
          return {
            operation: "update" as const,
            table: "users",
            id: m.uid || m.id,
            data: {
              notifications: JSON.stringify(updatedNotifs)
            }
          };
        });

        // Fire all start trip operations concurrently in the background
        Promise.all([
          saveMySQLRecordsBatch(resetOps).catch((err) => {
            console.warn("[StartTrip] MySQL reset statuses batch failed:", err.message);
          }),
          saveMySQLRecord("insert", "trips", newTripId, createdTrip).catch((err) => {
            console.warn("[StartTrip] MySQL trip insert failed:", err.message);
          }),
          setDoc(doc(db, 'trips', newTripId), {
            orgId: userData.orgId,
            routeId: route.id,
            driverId: currentDriverId,
            vehicleId: vehicle.id,
            status: 'live',
            direction: tripType,
            startTime: serverTimestamp(),
            currentLocation: { lat: org?.location?.lat || 0, lng: org?.location?.lng || 0 },
            currentStopId: initialStopId
          }).catch((err) => {
            console.warn("[StartTrip] Firestore trip set failed:", err.message);
          }),
          saveMySQLRecord("update", "vehicles", vehicle.id, {
            status: "on-trip",
          }).catch((err) => {
            console.warn("[StartTrip] MySQL vehicle update failed:", err.message);
          }),
          updateDoc(doc(db, 'vehicles', vehicle.id), { status: 'on-trip' }).catch((err) => {
            console.warn("[StartTrip] Firestore vehicle update failed:", err.message);
          }),
          saveMySQLRecordsBatch(notifyOps).catch((err) => {
            console.warn("[StartTrip] MySQL notifications batch failed:", err.message);
          })
        ]).catch((err) => {
          console.warn("[StartTrip] background writes failed:", err);
        });

        // Start geolocation tracking
        watchLocation(
          (latitude, longitude) => {
            if (isValidCoordinate(latitude, longitude)) {
              // Update Firestore for real-time maps
              updateDoc(doc(db, "vehicles", vehicle.id), {
                location: { lat: latitude, lng: longitude },
                updatedAt: new Date().toISOString(),
              }).catch((e) =>
                console.warn("Vehicle tracking Firestore update error:", e),
              );

              // Update MySQL
              saveMySQLRecord("update", "vehicles", vehicle.id, {
                latitude: latitude,
                longitude: longitude,
                location: { lat: latitude, lng: longitude },
                updatedAt: new Date().toISOString(),
              }).catch((err) =>
                console.warn(
                  "Failed to update vehicle coords in MySQL:",
                  err,
                ),
              );
            }
          },
          (err) => {
            console.warn("DriverDashboard watchLocation error:", err);
          }
        ).then((stopFn) => {
          (watchId as any).current = stopFn;
        });
      }
    } catch (error) {
      console.error("Error toggling trip status:", error);
      toast.error("Failed to update trip. Please try again.");
    }
  };

  const updateMemberStatus = async (
    memberId: string,
    status: string,
    type: "pickup" | "dropoff",
  ) => {
    try {
      const field = type === "pickup" ? "pickupStatus" : "dropoffStatus";
      const timeField =
        type === "pickup" ? "pickupUpdatedAt" : "dropoffUpdatedAt";

      // 1. Calculate and update local state immediately so UI updates and final manifest contains changes
      const updatedManifest = manifest.map((m) => {
        if (m.id === memberId || m.uid === memberId) {
          return {
            ...m,
            [field]: status,
            [timeField]: new Date().toISOString(),
            pickupStatus: type === "pickup" ? status : m.pickupStatus,
            dropoffStatus: type === "dropoff" ? status : m.dropoffStatus,
            pickupUpdatedAt: type === "pickup" ? new Date().toISOString() : m.pickupUpdatedAt,
            dropoffUpdatedAt: type === "dropoff" ? new Date().toISOString() : m.dropoffUpdatedAt
          };
        }
        return m;
      });
      setManifest(updatedManifest);

      // 2. Update the user member status in MySQL
      await saveMySQLRecord("update", "users", memberId, {
        [field]: status,
        [timeField]: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: status,
        statusUpdatedAt: new Date().toISOString(),
      });

      // 3. Keep the active trip's manifest updated dynamically in MySQL
      if (activeTrip) {
        await saveMySQLRecord("update", "trips", activeTrip.id, {
          manifest: JSON.stringify(
            updatedManifest.map((m) => ({
              uid: m.uid || m.id,
              studentId: m.studentId || "",
              name: m.name,
              pickupStatus: m.pickupStatus || "waiting",
              dropoffStatus: m.dropoffStatus || "waiting",
              pickupUpdatedAt: m.pickupUpdatedAt || null,
              dropoffUpdatedAt: m.dropoffUpdatedAt || null,
              pickupPointId: m.pickupPointId,
            }))
          ),
        });
      }

      const targetUser = manifest.find((m) => m.id === memberId);
      if (status === "picked" || status === "dropped" || status === "absent") {
        let message = "";
        if (status === "picked")
          message = `✅ You have been picked up from ${route?.pickupPoints?.find((p: any) => p.id === targetUser?.pickupPointId)?.name || "your stop"} by ${userData.name}.`;
        else if (status === "dropped")
          message = `🏠 You have been dropped off securely by ${userData.name}. Thank you!`;
        else if (status === "absent")
          message = `⚠️ You were recorded as ABSENT for the ${type === "pickup" ? "Pick-up" : "Drop-off"} trip.`;

        const existingNotifs = Array.isArray(targetUser?.notifications)
          ? targetUser.notifications
          : [];
        const updatedNotifs = [
          ...existingNotifs,
          {
            message,
            timestamp: new Date().toISOString(),
            type: `status_${status}`,
            dismissed: false,
          },
        ];

        await saveMySQLRecord("update", "users", memberId, {
          notifications: JSON.stringify(updatedNotifs),
        });
      }

      // Attractive Custom Notification - Modernized
      toast.custom(
        (t) => (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9, rotate: -2 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className={cn(
              "flex items-center gap-4 px-6 py-4 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-2 backdrop-blur-xl",
              status === "picked"
                ? "bg-emerald-500/90 border-emerald-400 text-white"
                : status === "dropped"
                  ? "bg-blue-500/90 border-blue-400 text-white"
                  : "bg-rose-500/90 border-rose-400 text-white",
            )}
          >
            <div
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center bg-white/20 shadow-inner",
              )}
            >
              {status === "picked" ? (
                <CheckCircle size={26} strokeWidth={3} />
              ) : status === "dropped" ? (
                <Navigation size={26} strokeWidth={3} />
              ) : (
                <XCircle size={26} strokeWidth={3} />
              )}
            </div>
            <div>
              <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em] leading-none mb-1">
                Success
              </p>
              <p className="text-sm font-black text-white uppercase italic tracking-tight leading-none">
                {manifest.find((m) => m.id === memberId)?.name || "Passenger"}{" "}
                {status}
              </p>
            </div>
          </motion.div>
        ),
        { duration: 3000, position: "top-center" },
      );
    } catch (e) {
      console.error("Error updating status:", e);
      toast.error("Failed to update status");
    }
  };

  const fetchHistory = async () => {
    if (!userData?.orgId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const resObj = await fetch("/api/records/user-data", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (resObj.ok) {
        const res = await resObj.json();
        if (res.success && res.trips) {
          const completedTrips = res.trips.filter(
            (t: any) =>
              t.routeId === userData.routeId && t.status === "completed",
          );
          const filtered = completedTrips.filter((t: any) => {
            const date = (t.startedAt || t.endedAt || "").split("T")[0];
            return date >= startDate && date <= endDate;
          });
          setHistoryTrips(
            filtered.sort((a: any, b: any) =>
              (b.startedAt || "").localeCompare(a.startedAt || ""),
            ),
          );
          setShowHistory(true);
        }
      }
    } catch (e) {
      console.error("History fetch error:", e);
      toast.error("Failed to fetch history");
    }
  };

  const exportHistory = () => {
    if (historyTrips.length === 0)
      return toast.error("No history found for this range");

    // Header for detailed multi-trip report
    let csv =
      "Trip Date,Direction,Route,Passenger Name,Passenger ID,Pickup Status,Pickup Time,Dropoff Status,Dropoff Time,Trip Start,Trip End\n";

    const userSummary: Record<
      string,
      { name: string; studentId: string; pickups: number; drops: number }
    > = {};

    historyTrips.forEach((t) => {
      const startDateObj = parseToDate(t.startedAt);
      const endDateObj = parseToDate(t.endedAt);
      const date = startDateObj ? startDateObj.toLocaleDateString() : "N/A";
      const start = startDateObj ? startDateObj.toLocaleTimeString() : "N/A";
      const end = endDateObj ? endDateObj.toLocaleTimeString() : "N/A";
      const direction =
        t.direction === "pickup" ? "Pick to ORG" : "Drop to Home";
      const routeName = route?.name || "N/A";

      if (t.manifest && Array.isArray(t.manifest) && t.manifest.length > 0) {
        t.manifest.forEach((m: any) => {
          const pType = parseToDate(m.pickupUpdatedAt);
          const dType = parseToDate(m.dropoffUpdatedAt);

          const pTime = pType ? pType.toLocaleTimeString() : "---";
          const dTime = dType ? dType.toLocaleTimeString() : "---";

          const currentMember = manifest.find(
            (pm: any) => pm.uid === m.uid || pm.id === m.uid || pm.id === m.id,
          );
          const passengerId = m.studentId || currentMember?.studentId || "";

          csv += `"${date}","${direction}","${routeName}","${m.name}","${passengerId}","${m.pickupStatus}","${pTime}","${m.dropoffStatus}","${dTime}","${start}","${end}"\n`;

          // Track summary
          if (m.uid) {
            if (!userSummary[m.uid]) {
              userSummary[m.uid] = {
                name: m.name,
                studentId: passengerId,
                pickups: 0,
                drops: 0,
              };
            }
            if (m.pickupStatus === "picked") userSummary[m.uid].pickups++;
            if (m.dropoffStatus === "dropped") userSummary[m.uid].drops++;
          }
        });
      } else {
        csv += `"${date}","${direction}","${routeName}","N/A","N/A","N/A","N/A","N/A","N/A","${start}","${end}"\n`;
      }
    });

    // Append Summary Section
    csv += "\n\nUSER-WISE TRIP SUMMARY\n";
    csv += "User Name,User ID,Total Pickups,Total Drops\n";
    Object.entries(userSummary).forEach(([uid, data]) => {
      csv += `"${data.name}","${data.studentId}","${data.pickups}","${data.drops}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `detailed_trip_report_${startDate}_to_${endDate}.csv`;
    a.click();
    toast.success("Detailed history exported");
  };

  const handleExport = () => {
    if (manifest.length === 0) return toast.error("No data to export");

    const headers = [
      "Name",
      "Stop Name",
      "Pickup Status",
      "Pickup Time",
      "Dropoff Status",
      "Dropoff Time",
      "ID",
      "Email",
    ];
    const rows = manifest.map((m) => {
      const pDate = m.pickupUpdatedAt ? parseToDate(m.pickupUpdatedAt) : null;
      const dDate = m.dropoffUpdatedAt ? parseToDate(m.dropoffUpdatedAt) : null;
      const pTime = pDate ? pDate.toLocaleTimeString() : "---";
      const dTime = dDate ? dDate.toLocaleTimeString() : "---";

      return [
        m.name,
        route?.pickupPoints?.find((p: any) => p.id === m.pickupPointId)?.name ||
          "Unassigned",
        m.pickupStatus || "waiting",
        pTime,
        m.dropoffStatus || "waiting",
        dTime,
        m.studentId || "",
        m.email || "",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const fileName = `manifest_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Manifest exported successfully");
  };

  const filteredManifest = manifest.filter((person) => {
    const matchesStop =
      filterStopId === "all" || person.pickupPointId === filterStopId;

    let matchesStatus = true;
    if (filterStatus !== "all") {
      // In filters, we check either pickup or dropoff status depending on filter selection
      // Or if it's 'any' we can check both
      matchesStatus =
        person.pickupStatus === filterStatus ||
        person.dropoffStatus === filterStatus;
    }

    const matchesSearch = person.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesStop && matchesStatus && matchesSearch;
  });

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-700">
      {/* Active Trip Header */}
      <div
        className={cn(
          "rounded-[2rem] p-6 text-white relative overflow-hidden shadow-xl border transition-all duration-500",
          isTracking
            ? "bg-blue-600 border-blue-400"
            : "bg-slate-900 border-slate-800",
        )}
      >
        <div className="relative z-10 flex flex-col gap-6">
          <div>
            <div
              className={cn(
                "inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] mb-3 border transition-colors",
                isTracking
                  ? "bg-white/20 border-white/20 text-white"
                  : "bg-blue-600/20 border-blue-600/30 text-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.2)]",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full mr-2",
                  isTracking ? "bg-white animate-pulse" : "bg-blue-500",
                )}
              ></span>
              {isTracking ? "Trip in Progress" : "Ready to Start"}
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-2 uppercase italic leading-none">
              {route?.name || "Route Not Assigned"}
            </h2>
            {!isTracking && allAssignedRoutes.length > 1 && (
              <div className="mb-4">
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/50 mb-1.5 animate-pulse">
                  Select Route
                </label>
                <div className="relative">
                  <select
                    id="driver-route-selector"
                    value={selectedRouteId || ""}
                    onChange={(e) => {
                      const rId = e.target.value;
                      setSelectedRouteId(rId);
                      const matched = allAssignedRoutes.find(
                        (r) => r.id === rId,
                      );
                      if (matched) {
                        setRoute(matched);
                      }
                    }}
                    className="w-full bg-white/10 border border-white/15 text-white rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none appearance-none focus:border-white/30 transition-all cursor-pointer"
                  >
                    {allAssignedRoutes.map((r: any) => (
                      <option
                        key={r.id}
                        value={r.id}
                        className="text-slate-900 bg-white font-sans"
                      >
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-white/50">
                    <ChevronRight className="w-4 h-4 rotate-90" />
                  </div>
                </div>
              </div>
            )}
            {!isTracking && (
              <div className="flex bg-white/10 p-1.5 rounded-2xl gap-1 mb-4 border border-white/5">
                <button
                  onClick={() => setTripType("pickup")}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                    tripType === "pickup"
                      ? "bg-white text-slate-900 shadow-lg"
                      : "text-white/60 hover:bg-white/5",
                  )}
                >
                  Pick to ORG
                </button>
                <button
                  onClick={() => setTripType("dropoff")}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                    tripType === "dropoff"
                      ? "bg-white text-slate-900 shadow-lg"
                      : "text-white/60 hover:bg-white/5",
                  )}
                >
                  Drop to Home
                </button>
              </div>
            )}
            <div className="flex items-center gap-4 text-white/50 text-[9px] font-black uppercase tracking-widest">
              <span className="flex items-center gap-2">
                <MapPin className="w-3 h-3" />{" "}
                {route?.pickupPoints?.length || 0} Stops
              </span>
              <span className="flex items-center gap-2">
                <Users className="w-3 h-3" /> {manifest.length} {termPlural}
              </span>
            </div>
          </div>
          <button
            onClick={toggleTrip}
            className={cn(
              "w-full py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center transition-all shadow-xl active:scale-95 group",
              isTracking
                ? "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20"
                : "bg-white text-slate-900 hover:bg-slate-100 shadow-white/10",
            )}
          >
            {isTracking ? (
              <>
                <Square className="w-4 h-4 mr-2 fill-current" /> End Trip
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2 fill-current" /> Start Trip
              </>
            )}
          </button>
        </div>

        {/* Background Atmosphere */}
        <div className="absolute top-[-40%] right-[-10%] w-80 h-80 bg-white/5 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] left-[-5%] w-64 h-64 bg-blue-400/10 rounded-full blur-[80px] pointer-events-none"></div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Navigation Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center leading-none">
              <Navigation className="w-4 h-4 mr-2 text-blue-600" />
              Trip Map
            </h3>
            <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
              <Activity className="w-3 h-3 text-blue-500" />
              <span className="text-[8px] text-slate-400 font-black uppercase tracking-tighter italic">
                Live Map
              </span>
            </div>
          </div>
          <div className="rounded-[2rem] overflow-hidden border border-slate-100 shadow-xl bg-white h-[400px] relative">
            <MapComponent
              height="100%"
              zoom={15}
              hideMapStyles={true}
              center={
                vehicle?.location &&
                isValidCoordinate(vehicle.location.lat, vehicle.location.lng)
                  ? { lat: vehicle.location.lat, lng: vehicle.location.lng }
                  : org?.location &&
                      isValidCoordinate(org.location.lat, org.location.lng)
                    ? { lat: org.location.lat, lng: org.location.lng }
                    : undefined
              }
            >
              {isTracking && roadCoords.length > 1 && (
                <Polyline
                  positions={roadCoords}
                  color="#3b82f6"
                  weight={6}
                  opacity={0.8}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              {org?.location &&
                isValidCoordinate(org.location.lat, org.location.lng) && (
                  <Marker
                    key="desktop-driver-org-marker"
                    position={[org.location.lat, org.location.lng]}
                    icon={createMarkerIcon(
                      activeTrip?.currentStopId === "ORG"
                        ? "#2563eb"
                        : "#f97316",
                      orgIconUrl,
                      activeTrip?.currentStopId === "ORG"
                        ? "#2563eb"
                        : "#f97316",
                      org?.name || "BASE",
                    )}
                  >
                    <Popup>
                      <div className="p-2 text-center">
                        <p className="text-[10px] font-black text-slate-800 uppercase italic leading-none">
                          {org.name}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {org.sector || "Main Base"}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                )}
              {vehicle?.location &&
                isValidCoordinate(
                  vehicle.location.lat,
                  vehicle.location.lng,
                ) && (
                  <Marker
                    key="desktop-driver-vehicle-marker"
                    position={[vehicle.location.lat, vehicle.location.lng]}
                    icon={createMarkerIcon(
                      "#2563eb",
                      "bus",
                      "#2563eb",
                      "YOUR BUS",
                    )}
                  />
                )}
              {isTracking &&
                route?.pickupPoints?.map((p: any) => {
                  const stopUsers = manifest.filter(
                    (m) => m.pickupPointId === p.id,
                  );
                  const isCurrent = activeTrip?.currentStopId === p.id;
                  const direction = activeTrip?.direction || "pickup";
                  const isHandledStop =
                    stopUsers.length > 0 &&
                    stopUsers.every((m) => isHandled(m, direction));

                  const markerColor = isCurrent
                    ? "#2563eb"
                    : isHandledStop
                      ? "#10b981"
                      : "#94a3b8";
                  const labelBg = isCurrent
                    ? "#2563eb"
                    : isHandledStop
                      ? "#10b981"
                      : "#0f172a";

                  return (
                    isValidCoordinate(p.lat, p.lng) && (
                      <Marker
                        key={p.id}
                        position={[p.lat, p.lng]}
                        icon={createMarkerIcon(
                          markerColor,
                          "bus-stop",
                          markerColor,
                          `${p.name} (${stopUsers.length})`,
                          labelBg,
                        )}
                        eventHandlers={{
                          click: () => {
                            if (isTracking) handleUpdateStop(p.id);
                          },
                        }}
                      >
                        <Popup>
                          <div className="p-2 text-center">
                            <p className="text-[10px] font-black text-slate-800 uppercase italic leading-none">
                              {p.name}
                            </p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              Bus Stop • {stopUsers.length} {termPlural}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  );
                })}
            </MapComponent>

            {/* Stats Overlay on Map */}
            {isTracking && (
              <div className="absolute top-4 left-4 right-16 z-[1000] pointer-events-none">
                <div className="flex bg-white/90 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-white/50 pointer-events-auto justify-between items-center overflow-x-auto scrollbar-hide">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                        Handled
                      </span>
                      <span className="text-sm font-black text-slate-900 tabular-nums">
                        {
                          manifest.filter((m) =>
                            isHandled(m, activeTrip?.direction || "pickup"),
                          ).length
                        }
                        <span className="text-[10px] text-slate-400 font-normal">
                          /{manifest.length}
                        </span>
                      </span>
                    </div>
                    <div className="w-px h-6 bg-slate-100"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1">
                        Absent
                      </span>
                      <span className="text-sm font-black text-rose-600 tabular-nums">
                        {
                          manifest.filter((m) => {
                            const direction = activeTrip?.direction || "pickup";
                            const dirStatus =
                              direction === "dropoff"
                                ? m.dropoffStatus
                                : m.pickupStatus;
                            const dirUpdatedAt =
                              direction === "dropoff"
                                ? m.dropoffUpdatedAt
                                : m.pickupUpdatedAt;
                            return (
                              (dirStatus === "absent" &&
                                isToday(dirUpdatedAt)) ||
                              (m.status === "absent" &&
                                isToday(m.statusUpdatedAt || m.pickedAt))
                            );
                          }).length
                        }
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
                    <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></div>
                    <span className="text-[8px] font-black text-blue-700 uppercase tracking-widest">
                      {activeTrip?.direction === "dropoff"
                        ? "Drop to Home"
                        : "Pick to ORG"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Stops Bar overlay like Live Map */}
            {isTracking && (
              <div className="absolute bottom-4 left-4 right-4 z-[1000] flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
                <div className="flex gap-2">
                  {sortedStopsList?.map((p: any) => {
                    const isCurrent = activeTrip?.currentStopId === p.id;
                    const members = manifest.filter(
                      (m) => m.pickupPointId === p.id,
                    );
                    const direction = activeTrip?.direction || "pickup";
                    const isHandledStop =
                      members.length > 0 &&
                      members.every((m) => isHandled(m, direction));

                    return (
                      <button
                        key={p.id}
                        onClick={() => handleUpdateStop(p.id)}
                        className={cn(
                          "flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm transition-all active:scale-95",
                          isCurrent
                            ? "bg-blue-600 text-white border-blue-400 z-10"
                            : isHandledStop
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : "bg-white text-slate-500 border-slate-100",
                        )}
                      >
                        {isCurrent ? (
                          <Target size={12} className="animate-pulse" />
                        ) : isHandledStop ? (
                          <CheckCircle size={12} />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        )}
                        <span className="text-[9px] font-black uppercase whitespace-nowrap">
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handleUpdateStop("ORG")}
                    className={cn(
                      "flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm transition-all active:scale-95",
                      activeTrip?.currentStopId === "ORG"
                        ? "bg-blue-600 text-white border-blue-400"
                        : "bg-white text-slate-500 border-slate-100",
                    )}
                  >
                    <Shield size={12} />
                    <span className="text-[9px] font-black uppercase whitespace-nowrap">
                      ORG HUB
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Passenger List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center leading-none">
              <Users className="w-4 h-4 mr-2 text-blue-600" />
              {termSingular} Status
            </h3>
            <div className="flex gap-2">
              <button
                onClick={fetchHistory}
                className="flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors active:scale-95"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">
                  History
                </span>
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">
                  Export CSV
                </span>
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white rounded-3xl border border-slate-100 p-3 shadow-sm space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-2xl px-2">
                <Filter className="w-3 h-3 text-slate-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-transparent text-[8px] font-black uppercase tracking-widest text-slate-600 focus:outline-none py-2"
                >
                  <option value="all">Any Status</option>
                  <option value="waiting">Waiting</option>
                  <option value="picked">Picked Up</option>
                  <option value="dropped">Dropped Off</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
            </div>

            <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
              <button
                onClick={() => setFilterStopId("all")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest whitespace-nowrap transition-all",
                  filterStopId === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-400 hover:bg-slate-200",
                )}
              >
                All Stops
              </button>
              {sortedStopsList?.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => setFilterStopId(p.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest whitespace-nowrap transition-all",
                    filterStopId === p.id
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-400 hover:bg-slate-200",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm flex flex-col p-3 space-y-2 max-h-[500px] overflow-y-auto scrollbar-hide">
            {filteredManifest.length === 0 ? (
              <div className="py-20 text-center opacity-30 select-none">
                <Users className="w-16 h-16 mx-auto mb-4" />
                <p className="text-[10px] font-black tracking-widest uppercase">
                  No {termPlural.toLowerCase()} found
                </p>
              </div>
            ) : (
              filteredManifest.map((person) => (
                <PassengerItem
                  key={person.id}
                  name={person.name}
                  point={
                    route?.pickupPoints?.find(
                      (p: any) => p.id === person.pickupPointId,
                    )?.name || "Point Unassigned"
                  }
                  pickupStatus={person.pickupStatus}
                  dropoffStatus={person.dropoffStatus}
                  onUpdate={(st: string, type: "pickup" | "dropoff") =>
                    updateMemberStatus(person.id, st, type)
                  }
                  uid={person.uid}
                  avatarUrl={person.avatarUrl}
                  isTracking={isTracking}
                  activeTripType={activeTrip?.direction}
                />
              ))
            )}
            <div className="pt-6 border-t border-slate-50 mt-4 text-center">
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                End of List
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[8000] bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-[3.5rem] p-8 pb-12 max-h-[90vh] overflow-hidden flex flex-col gap-6 shadow-2xl"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
                  Trip History
                </h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                <div className="flex-1 space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-2">
                    From
                  </p>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-transparent text-[10px] font-black uppercase px-2 focus:outline-none"
                  />
                </div>
                <div className="w-px h-8 bg-slate-200 self-center"></div>
                <div className="flex-1 space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-2">
                    To
                  </p>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-transparent text-[10px] font-black uppercase px-2 focus:outline-none"
                  />
                </div>
                <button
                  onClick={fetchHistory}
                  className="bg-slate-900 text-white p-3 rounded-xl active:scale-90 transition-all"
                >
                  <Search size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                {historyTrips.length === 0 ? (
                  <div className="py-20 text-center text-slate-300">
                    <Clock size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-[10px] font-black uppercase tracking-widest">
                      No history found
                    </p>
                  </div>
                ) : (
                  historyTrips.map((t: any) => (
                    <div
                      key={t.id}
                      className="p-4 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-2xl border flex items-center justify-center",
                            t.direction === "dropoff"
                              ? "bg-amber-50 text-amber-500 border-amber-100"
                              : "bg-blue-50 text-blue-500 border-blue-100",
                          )}
                        >
                          {t.direction === "dropoff" ? (
                            <MapPin size={18} />
                          ) : (
                            <Target size={18} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-black text-slate-900 uppercase italic leading-none">
                              {parseToDate(t.startedAt)?.toLocaleDateString() ||
                                "Past Trip"}
                            </p>
                            <span
                              className={cn(
                                "text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                                t.direction === "dropoff"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700",
                              )}
                            >
                              {t.direction === "dropoff" ? "Drop" : "Pick"}
                            </span>
                          </div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            {t.manifest?.length || 0} Passengers Handled •{" "}
                            {parseToDate(t.startedAt)
                              ?.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const directionLabel =
                            t.direction === "pickup"
                              ? "Pick to ORG"
                              : "Drop to Home";
                          let csv =
                            "Date,Direction,Name,ID,Pickup Status,Pickup Time,Dropoff Status,Dropoff Time\n";

                          t.manifest?.forEach((m: any) => {
                            const pDate = m.pickupUpdatedAt ? parseToDate(m.pickupUpdatedAt) : null;
                            const dDate = m.dropoffUpdatedAt ? parseToDate(m.dropoffUpdatedAt) : null;
                            const pTime = pDate ? pDate.toLocaleTimeString() : "---";
                            const dTime = dDate ? dDate.toLocaleTimeString() : "---";
                            const currentMember = manifest.find(
                              (pm: any) =>
                                pm.uid === m.uid ||
                                pm.id === m.uid ||
                                pm.id === m.id,
                            );
                            const passengerId =
                              m.studentId || currentMember?.studentId || "";
                            const tripStartDate = parseToDate(t.startedAt);
                            const tripDateStr = tripStartDate ? tripStartDate.toLocaleDateString() : "N/A";
                            csv += `"${tripDateStr}","${directionLabel}","${m.name}","${passengerId}","${m.pickupStatus}","${pTime}","${m.dropoffStatus}","${dTime}"\n`;
                          });

                          const blob = new Blob([csv], { type: "text/csv" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `trip_${t.id}_manifest.csv`;
                          a.click();
                        }}
                        className="p-3 bg-white text-blue-600 rounded-xl border border-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={exportHistory}
                className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                <Download size={18} />
                <span>Download History</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PassengerItem({
  name,
  point,
  pickupStatus,
  dropoffStatus,
  onUpdate,
  uid,
  avatarUrl,
  isPickupPoint,
  isTracking,
  activeTripType,
}: any) {
  if (isPickupPoint) {
    return (
      <div className="flex items-center justify-between p-4 rounded-3xl bg-blue-50 border border-blue-100 group">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-white border border-blue-200 flex items-center justify-center text-blue-600">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-black text-blue-900 leading-none mb-1 uppercase italic tracking-tighter">
              {name}
            </p>
            <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest opacity-60">
              Bus Stop • {point}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const canUpdatePickup = isTracking && activeTripType === "pickup";
  const canUpdateDropoff = isTracking && activeTripType === "dropoff";

  return (
    <div className="flex flex-col gap-3 p-4 rounded-3xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm group-hover:scale-110 transition-transform duration-500">
            <img
              src={getUserAvatar(avatarUrl, undefined, name, uid)}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 leading-none mb-1 uppercase italic tracking-tighter">
              {name}
            </p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest opacity-60">
              {point}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Pickup Control */}
        <div
          className={cn(
            "bg-slate-50/50 rounded-2xl p-2 border border-slate-100 transition-opacity",
            !canUpdatePickup &&
              isTracking &&
              "opacity-40 grayscale pointer-events-none",
            !isTracking && "opacity-40 grayscale pointer-events-none",
          )}
        >
          <div className="flex justify-between items-center mb-2 px-1">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
              Pickup Status
            </p>
            {!isTracking && <Clock size={8} className="text-slate-300" />}
          </div>
          <div className="flex items-center justify-between">
            {pickupStatus === "waiting" || !pickupStatus ? (
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    canUpdatePickup && onUpdate("picked", "pickup")
                  }
                  disabled={!canUpdatePickup}
                  className="p-2 bg-white text-green-500 rounded-xl border border-slate-100 shadow-sm active:scale-90 transition-all disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    canUpdatePickup && onUpdate("absent", "pickup")
                  }
                  disabled={!canUpdatePickup}
                  className="p-2 bg-white text-rose-500 rounded-xl border border-slate-100 shadow-sm active:scale-90 transition-all disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <span
                className={cn(
                  "text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border w-full text-center",
                  pickupStatus === "picked"
                    ? "bg-green-50 text-green-700 border-green-100"
                    : "bg-rose-50 text-rose-700 border-rose-100",
                )}
              >
                {pickupStatus}
              </span>
            )}
          </div>
        </div>

        {/* Dropoff Control */}
        <div
          className={cn(
            "bg-slate-50/50 rounded-2xl p-2 border border-slate-100 transition-opacity",
            !canUpdateDropoff &&
              isTracking &&
              "opacity-40 grayscale pointer-events-none",
            !isTracking && "opacity-40 grayscale pointer-events-none",
          )}
        >
          <div className="flex justify-between items-center mb-2 px-1">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
              Dropoff Status
            </p>
            {!isTracking && (
              <Clock size={8} className="text-slate-300 text-right" />
            )}
          </div>
          <div className="flex items-center justify-between">
            {dropoffStatus === "waiting" || !dropoffStatus ? (
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    canUpdateDropoff && onUpdate("dropped", "dropoff")
                  }
                  disabled={!canUpdateDropoff}
                  className="p-2 bg-white text-blue-500 rounded-xl border border-slate-100 shadow-sm active:scale-90 transition-all disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    canUpdateDropoff && onUpdate("absent", "dropoff")
                  }
                  disabled={!canUpdateDropoff}
                  className="p-2 bg-white text-rose-500 rounded-xl border border-slate-100 shadow-sm active:scale-90 transition-all disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <span
                className={cn(
                  "text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border w-full text-center",
                  dropoffStatus === "dropped"
                    ? "bg-blue-50 text-blue-700 border-blue-100"
                    : "bg-rose-50 text-rose-700 border-rose-100",
                )}
              >
                {dropoffStatus}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
