import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

async function main() {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
  process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
  
  if (getApps().length === 0) {
    initializeApp({ projectId: firebaseConfig.projectId });
  }
  
  const firestoreDb = firebaseConfig.firestoreDatabaseId 
    ? getFirestore(undefined, firebaseConfig.firestoreDatabaseId) 
    : getFirestore();
    
  console.log("Connected to Firestore:", firebaseConfig.firestoreDatabaseId || "default");
  
  // 1. Fetch DB Config
  const configDoc = await firestoreDb.collection("settings").doc("database").get();
  if (!configDoc.exists) {
    console.log("No database settings document exists!");
    return;
  }
  const config = configDoc.data();
  console.log("Database Host:", config.host);
  console.log("Database User:", config.user);
  console.log("Database Name:", config.database);
  
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: parseInt(config.port || "3306")
  });
  
  try {
    console.log("Connected to MySQL database.");
    
    // Query all users on this route
    const [userRows] = await connection.query("SELECT * FROM users WHERE routeId = 'ROUTE-3T56NPT'") as any[];
    console.log("\n================ ALL USERS ON ROUTE ROUTE-3T56NPT ================");
    userRows.forEach((u: any) => {
      console.log(`- UID: ${u.uid || u.id}, Name: ${u.name}, Email: ${u.email}, pickupPointId: ${u.pickupPointId}, Role: ${u.role}, pickupStatus: ${u.pickupStatus}`);
    });
      
    // Query their route
    const [routeRows] = await connection.query("SELECT * FROM routes WHERE id = 'ROUTE-3T56NPT'") as any[];
    if (routeRows && routeRows.length > 0) {
      console.log("\n================ ROUTE DETAILS ================");
      const route = routeRows[0];
      console.log("Route Name:", route.name);
      console.log("Driver ID:", route.driverId);
      console.log("Vehicle ID:", route.vehicleId);
      try {
        const stops = JSON.parse(route.pickupPoints || "[]");
        console.log("Stops configuration count:", stops.length);
        stops.forEach((s: any) => {
          console.log(`- Stop ID: ${s.id}, Name: ${s.name}, Order: ${s.order}, DropoffOrder: ${s.dropoffOrder}, Lat: ${s.lat}, Lng: ${s.lng}`);
        });
      } catch (rErr) {
        console.log("Stops (raw):", route.pickupPoints);
      }
    }
      
      // Query active or completed trips for their route
      const [tripRows] = await connection.query(
        "SELECT * FROM trips WHERE id = ?", 
        ["TRIP-1781181479074-7yxzj57"]
      ) as any[];
      console.log("\n================ TRIPS DETAIL ================");
      if (tripRows && tripRows.length > 0) {
        console.log("Trip data:", JSON.stringify(tripRows[0], null, 2));
      } else {
        console.log("Trip not found");
      }
      
      const [allTrips] = await connection.query(
        "SELECT * FROM trips WHERE routeId = 'ROUTE-3T56NPT' ORDER BY startTime DESC LIMIT 5"
      ) as any[];
      console.log("\n================ TRIP HISTORY (Limit 5) ================");
      if (allTrips && allTrips.length > 0) {
        for (const trip of allTrips) {
          console.log(`- Trip ID: ${trip.id}, Status: ${trip.status}, Direction: ${trip.direction}, Started: ${trip.startTime}, Ended: ${trip.endTime}, Current Stop: ${trip.currentStopId}`);
        }
      } else {
        console.log("No trips recorded for this route.");
      }
    } finally {
      await connection.end();
    }
}

function isFresh(dateVal: any) {
  if (!dateVal) return false;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  
  const diffMs = Math.abs(today.getTime() - d.getTime());
  if (diffMs < 18 * 60 * 60 * 1000) return true;
  
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
}

main().catch(console.error);
