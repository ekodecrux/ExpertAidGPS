import { auth } from './firebase';

export async function saveMySQLRecord(operation: 'insert' | 'update' | 'delete', table: string, id: string, data?: any) {
  try {
    let token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      token = localStorage.getItem("expert_gps_fallback_token") || undefined;
    }
    if (!token) throw new Error('Unauthenticated status. Please log in again.');
    
    const response = await fetch('/api/records/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ operation, table, id, data })
    });
    
    let result: any = {};
    const responseText = await response.text();
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse response as JSON:", responseText, e);
      const isHTML = responseText.trim().startsWith('<');
      throw new Error(isHTML 
        ? `Server returned HTML or crashed (Status ${response.status}).` 
        : `Non-JSON server response (Status ${response.status}): ${responseText.slice(0, 150)}...`
      );
    }
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Failed to ${operation} record in connected database`);
    }
    return result;
  } catch (err: any) {
    console.error(`[saveMySQLRecordError]: ${err.message}`);
    throw err;
  }
}

export async function saveMySQLRecordsBatch(operations: Array<{ operation: 'insert' | 'update' | 'delete', table: string, id: string, data?: any }>) {
  if (operations.length === 0) return { success: true, message: "No operations provided" };
  try {
    let token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      token = localStorage.getItem("expert_gps_fallback_token") || undefined;
    }
    if (!token) throw new Error('Unauthenticated status. Please log in again.');
    
    const response = await fetch('/api/records/save-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ operations })
    });
    
    let result: any = {};
    const responseText = await response.text();
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse batch response as JSON:", responseText, e);
      const isHTML = responseText.trim().startsWith('<');
      throw new Error(isHTML 
        ? `Server returned HTML or crashed (Status ${response.status}).` 
        : `Non-JSON server response (Status ${response.status}): ${responseText.slice(0, 150)}...`
      );
    }
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Failed to execute batch operations in connected database`);
    }
    return result;
  } catch (err: any) {
    console.error(`[saveMySQLRecordsBatchError]: ${err.message}`);
    throw err;
  }
}

export async function getMySQLAdminData() {
  let token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) {
    token = localStorage.getItem("expert_gps_fallback_token") || undefined;
  }
  if (!token) throw new Error('Unauthenticated');
  
  const response = await fetch('/api/records/admin-data', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch database data: ${response.statusText}`);
  }
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Failed to fetch database data");
  }
  return result;
}
