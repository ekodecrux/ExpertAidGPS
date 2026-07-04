import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), "database_records_emulated.json");

interface DBState {
  organizations: any[];
  users: any[];
  vehicles: any[];
  routes: any[];
  trips: any[];
  logs: any[];
  payments: any[];
  classes: any[];
}

function getDBTableName(rawName: string): keyof DBState {
  const norm = rawName.toLowerCase();
  if (norm === "organization" || norm === "organizations") return "organizations";
  if (norm === "user" || norm === "users") return "users";
  if (norm === "vehicle" || norm === "vehicles") return "vehicles";
  if (norm === "route" || norm === "routes") return "routes";
  if (norm === "trip" || norm === "trips") return "trips";
  if (norm === "log" || norm === "logs") return "logs";
  if (norm === "payment" || norm === "payments") return "payments";
  if (norm === "class" || norm === "classes") return "classes";
  return norm as keyof DBState;
}

const getInitialState = (): DBState => {
  const now = new Date().toISOString();
  return {
    organizations: [
      {
        id: "demo-school",
        name: "Expert Transport Academy",
        sector: "Education",
        mobile: "+91 9876543210",
        email: "admin@demo-school.com",
        logoUrl: "",
        address: "Cyber Towers, Hitech City, Hyderabad, Telangana, India",
        plan: "premium",
        status: "active",
        totalPaidAmount: 7500.0,
        price: 499.0,
        onboardDate: now,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        latitude: 17.4504,
        longitude: 78.3808,
        eduType: "school"
      }
    ],
    users: [
      {
        uid: "demo-driver",
        email: "driver@example.com",
        name: "Suresh Kumar",
        phone: "+91 9876543210",
        role: "driver",
        orgId: "demo-school",
        routeId: "demo-route-1",
        vehicleId: "demo-vehicle-1",
        pickupPointId: "",
        studentId: "",
        updatedAt: now,
        status: "active",
        statusUpdatedAt: now,
        pickupStatus: "",
        pickupUpdatedAt: "",
        dropoffStatus: "",
        dropoffUpdatedAt: "",
        pickedAt: "",
        classId: "",
        section: "",
        avatarUrl: "",
        notifications: "[]"
      },
      {
        uid: "demo-student",
        email: "student@example.com",
        name: "Aarav Pendyala",
        phone: "+91 9123456789",
        role: "student",
        orgId: "demo-school",
        routeId: "demo-route-1",
        vehicleId: "demo-vehicle-1",
        pickupPointId: "stop-1",
        studentId: "STU-2026-001",
        updatedAt: now,
        status: "waiting",
        statusUpdatedAt: now,
        pickupStatus: "waiting",
        pickupUpdatedAt: now,
        dropoffStatus: "pending",
        dropoffUpdatedAt: now,
        pickedAt: "",
        classId: "class-1",
        section: "A",
        avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
        notifications: "[]"
      }
    ],
    vehicles: [
      {
        id: "demo-vehicle-1",
        orgId: "demo-school",
        name: "Yellow Bus 101",
        number: "TS 08 EX 9999",
        type: "Bus",
        capacity: 40,
        status: "active",
        latitude: 17.4402,
        longitude: 78.3482,
        lastUpdated: now
      }
    ],
    routes: [
      {
        id: "demo-route-1",
        orgId: "demo-school",
        name: "Hitech City Route",
        startPoint: "Gachibowli Circle",
        endPoint: "Cyber Towers",
        distance: "12.5 km",
        pickupPoints: JSON.stringify([
          { id: "stop-1", name: "Gachibowli Circle", lat: 17.4402, lng: 78.3482, time: "08:00 AM" },
          { id: "stop-2", name: "DLF Cybercity", lat: 17.4485, lng: 78.3561, time: "08:10 AM" },
          { id: "stop-3", name: "Kondapur X Roads", lat: 17.4572, lng: 78.3689, time: "08:20 AM" },
          { id: "ORG", name: "Cyber Towers, Hitech City", lat: 17.4504, lng: 78.3808, time: "08:35 AM" }
        ]),
        stops: JSON.stringify([
          { id: "stop-1", name: "Gachibowli Circle", lat: 17.4402, lng: 78.3482, time: "08:00 AM" },
          { id: "stop-2", name: "DLF Cybercity", lat: 17.4485, lng: 78.3561, time: "08:10 AM" },
          { id: "stop-3", name: "Kondapur X Roads", lat: 17.4572, lng: 78.3689, time: "08:20 AM" },
          { id: "ORG", name: "Cyber Towers, Hitech City", lat: 17.4504, lng: 78.3808, time: "08:35 AM" }
        ])
      }
    ],
    trips: [
      {
        id: "demo-trip-1",
        orgId: "demo-school",
        driverId: "demo-driver",
        vehicleId: "demo-vehicle-1",
        routeId: "demo-route-1",
        status: "active",
        direction: "pickup",
        startAddress: "Gachibowli Circle",
        endAddress: "Expert Transport Academy campus",
        startTime: now,
        endTime: "",
        currentLat: 17.4402,
        currentLng: 78.3482,
        currentStopId: "stop-1",
        eta: "5 mins",
        manifest: JSON.stringify([
          { studentId: "demo-student", name: "Aarav Pendyala", status: "waiting", direction: "pickup" }
        ])
      }
    ],
    logs: [
      {
        id: "log-1",
        entity: "system",
        action: "initialize",
        description: "Emulated MySQL DB Failover engine successfully loaded",
        organization: "demo-school",
        operator: "System Agent",
        timestamp: now
      }
    ],
    payments: [
      {
        id: "pay-1",
        orgId: "demo-school",
        amount: 7500.0,
        paymentMode: "stripe",
        transactionId: "tx_emulated_928172",
        note: "Subscription Payment",
        timestamp: now
      }
    ],
    classes: [
      {
        id: "class-1",
        orgId: "demo-school",
        name: "Grade 10",
        sections: "A,B,C"
      }
    ]
  };
};

function readDB(): DBState {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const data = fs.readFileSync(FILE_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("Emulated DB Read warning, recreating standard state:", err);
  }
  const init = getInitialState();
  writeDB(init);
  return init;
}

function writeDB(state: DBState) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Emulated DB Write Error:", err);
  }
}

function evaluateCondition(row: any, conditionStr: string): boolean {
  const cond = conditionStr.trim();
  if (!cond) return true;

  // Field IS NULL
  if (/is\s+null/i.test(cond)) {
    const fieldMatch = cond.match(/^[`"']?([a-zA-Z0-9_-]+)[`"']?\s+is\s+null/i);
    if (fieldMatch) {
      const field = fieldMatch[1];
      return row[field] === null || row[field] === undefined || row[field] === "";
    }
  }

  // Field IS NOT NULL
  if (/is\s+not\s+null/i.test(cond)) {
    const fieldMatch = cond.match(/^[`"']?([a-zA-Z0-9_-]+)[`"']?\s+is\s+not\s+null/i);
    if (fieldMatch) {
      const field = fieldMatch[1];
      return row[field] !== null && row[field] !== undefined && row[field] !== "";
    }
  }

  // General field comparisons: field = value OR field != value OR field LIKE value etc.
  const opMatch = cond.match(/^[`"']?([a-zA-Z0-9_-]+)[`"']?\s*(=|!=|<>|like)\s*(.*)$/i);
  if (opMatch) {
    const field = opMatch[1];
    const operator = opMatch[2];
    let expectedValStr = opMatch[3].trim();

    // strip outer quotes
    if ((expectedValStr.startsWith("'") && expectedValStr.endsWith("'")) ||
        (expectedValStr.startsWith('"') && expectedValStr.endsWith('"'))) {
      expectedValStr = expectedValStr.slice(1, -1);
    }

    const actualValue = row[field];
    const actualStr = actualValue === null || actualValue === undefined ? "" : String(actualValue);

    if (operator === "=") {
      return actualStr === expectedValStr;
    } else if (operator === "!=" || operator === "<>") {
      return actualStr !== expectedValStr;
    } else if (operator.toLowerCase() === "like") {
      const reg = new RegExp("^" + expectedValStr.replace(/%/g, ".*") + "$", "i");
      return reg.test(actualStr);
    }
  }

  return true;
}

function rowMatchesWhere(row: any, whereClause: string): boolean {
  if (!whereClause) return true;

  if (/\s+or\s+/i.test(whereClause)) {
    const parts = whereClause.split(/\s+or\s+/i);
    return parts.some(p => evaluateCondition(row, p));
  }

  const parts = whereClause.split(/\s+and\s+/i);
  return parts.every(p => evaluateCondition(row, p));
}

export class EmulatedMySQLConnection {
  async query(statement: string, params: any[] = []): Promise<any[]> {
    const cleanSql = statement.replace(/\s+/g, " ").trim();
    const lowerSql = cleanSql.toLowerCase();

    // 1. Substitute positional parameters '?' in SQL safely to prevent manual splits breaking on string content
    let paramIndex = 0;
    const sqlWithParams = cleanSql.replace(/\?/g, () => {
      const val = params[paramIndex++];
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "string") {
        return `'${val.replace(/'/g, "''")}'`;
      }
      return String(val);
    });

    const db = readDB();

    // A. SELECT operation
    if (lowerSql.startsWith("select")) {
      // Ex: SELECT * FROM `users` WHERE uid = ?
      const selectMatch = sqlWithParams.match(/select\s+(.*?)\s+from\s+[`"']?([a-zA-Z0-9_-]+)[`"']?(?:\s+where\s+(.*))?/i);
      if (selectMatch) {
        const tableName = getDBTableName(selectMatch[2]);
        const whereClause = selectMatch[3] || "";
        const tableRows = db[tableName] || [];

        const filtered = tableRows.filter((r: any) => rowMatchesWhere(r, whereClause));
        
        // Auto-seed user logic if trying to verify an email or uid and they aren't seeded yet
        if (tableName === "users" && filtered.length === 0 && whereClause.toLowerCase().includes("uid")) {
          // extract uid
          const uidMatch = whereClause.match(/uid\s*=\s*'([^']+)'/i);
          if (uidMatch) {
            const requestedUid = uidMatch[1];
            // Fetch potential email or details in query, but otherwise make a beautiful standard super_admin or staff record matching the name
            const newUser = {
              uid: requestedUid,
              email: "ravikumarpendyala9182@gmail.com",
              name: "Super Admin",
              phone: "+91 9123456789",
              role: "super_admin",
              orgId: "demo-school",
              routeId: "",
              vehicleId: "",
              pickupPointId: "",
              studentId: "",
              updatedAt: new Date().toISOString(),
              status: "active",
              statusUpdatedAt: new Date().toISOString(),
              pickupStatus: "",
              pickupUpdatedAt: "",
              dropoffStatus: "",
              dropoffUpdatedAt: "",
              pickedAt: "",
              classId: "",
              section: "",
              avatarUrl: "",
              notifications: "[]"
            };
            db.users.push(newUser);
            writeDB(db);
            return [[newUser], []];
          }
        }

        return [filtered, []];
      }
      return [[], []];
    }

    // B. INSERT operation
    if (lowerSql.startsWith("insert")) {
      // Ex: INSERT INTO users (uid, name) VALUES (?, ?)
      const insertMatch = cleanSql.match(/insert\s+into\s+[`"']?([a-zA-Z0-9_-]+)[`"']?\s*\((.*?)\)\s*values\s*\((.*?)\)/i);
      if (insertMatch) {
        const tableName = getDBTableName(insertMatch[1]);
        const fields = insertMatch[2].split(",").map(f => f.trim().replace(/[`"']/g, ""));
        const newRecord: any = {};
        
        // map parameters sequentially
        fields.forEach((f, idx) => {
          newRecord[f] = params[idx] !== undefined ? params[idx] : null;
        });

        // Ensure primary key ID exists
        const idCol = (tableName === "users") ? "uid" : "id";
        if (!newRecord[idCol]) {
          newRecord[idCol] = "id_generated_" + Math.random().toString(36).substring(2, 11);
        }

        // Add to db
        if (!db[tableName]) {
          (db as any)[tableName] = [];
        }
        
        // Remove duplicate if already exists
        const pkValue = newRecord[idCol];
        (db as any)[tableName] = db[tableName].filter((r: any) => r[idCol] !== pkValue);
        db[tableName].push(newRecord);

        writeDB(db);
        return [{ affectedRows: 1, insertId: 0 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }

    // C. UPDATE operation
    if (lowerSql.startsWith("update")) {
      // Ex: UPDATE users SET name = ? WHERE uid = ?
      const updateMatch = sqlWithParams.match(/update\s+[`"']?([a-zA-Z0-9_-]+)[`"']?\s+set\s+(.*?)(?:\s+where\s+(.*))?$/i);
      if (updateMatch) {
        const tableName = getDBTableName(updateMatch[1]);
        const setStr = updateMatch[2];
        const whereClause = updateMatch[3] || "";

        // Parse assignments while respecting commas inside values (only split on commas outside quotes)
        const assignments: any = {};
        const pairs = setStr.split(/,(?=(?:[^']*'[^']*')*[^']*$)/g);
        for (const p of pairs) {
          const eqIdx = p.indexOf("=");
          if (eqIdx !== -1) {
            const rawField = p.slice(0, eqIdx).trim().replace(/[`"']/g, "");
            let rawVal = p.slice(eqIdx + 1).trim();
            if ((rawVal.startsWith("'") && rawVal.endsWith("'")) ||
                (rawVal.startsWith('"') && rawVal.endsWith('"'))) {
              rawVal = rawVal.slice(1, -1);
            }
            assignments[rawField] = rawVal === "NULL" ? null : rawVal;
          }
        }

        let updatedCount = 0;
        if (db[tableName]) {
          db[tableName] = db[tableName].map((r: any) => {
            if (rowMatchesWhere(r, whereClause)) {
              updatedCount++;
              return { ...r, ...assignments };
            }
            return r;
          });
        }

        writeDB(db);
        return [{ affectedRows: updatedCount }, []];
      }
      return [{ affectedRows: 0 }, []];
    }

    // D. DELETE operation
    if (lowerSql.startsWith("delete")) {
      const deleteMatch = sqlWithParams.match(/delete\s+from\s+[`"']?([a-zA-Z0-9_-]+)[`"']?(?:\s+where\s+(.*))?/i);
      if (deleteMatch) {
        const tableName = getDBTableName(deleteMatch[1]);
        const whereClause = deleteMatch[2] || "";
        let originalLen = 0;
        let finalLen = 0;

        if (db[tableName]) {
          originalLen = db[tableName].length;
          db[tableName] = db[tableName].filter((r: any) => !rowMatchesWhere(r, whereClause));
          finalLen = db[tableName].length;
        }

        writeDB(db);
        return [{ affectedRows: originalLen - finalLen }, []];
      }
      return [{ affectedRows: 0 }, []];
    }

    // E. SHOW TABLES or structural checks
    if (lowerSql.includes("show tables")) {
      return [
        [
          { Tables_in_db: "organizations" },
          { Tables_in_db: "users" },
          { Tables_in_db: "vehicles" },
          { Tables_in_db: "routes" },
          { Tables_in_db: "trips" },
          { Tables_in_db: "logs" },
          { Tables_in_db: "payments" },
          { Tables_in_db: "classes" }
        ],
        []
      ];
    }

    // F. Default response for CREATE TABLE, ALTER TABLE, etc.
    return [{ affectedRows: 0 }, []];
  }

  async release() {}
  async end() {}
}

export function getEmulatedMySQLConnection() {
  return new EmulatedMySQLConnection();
}
