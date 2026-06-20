import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, orderBy, Timestamp, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { Plus, Building2, CreditCard, ChevronRight, Settings2, Search, ShieldCheck, Trash2, Edit3, CircleDollarSign, History, Calendar, AlertCircle, X, Upload, Image as ImageIcon, Download, FileText, Table, Key, Mail, Database, Server, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { cn, getLocalIcon } from '../lib/utils';
import toast from 'react-hot-toast';
import { PhoneInput } from '../components/PhoneInput';
import { BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface Org {
  id: string;
  name: string;
  sector?: string;
  orgSector?: string;
  eduType?: string;
  mobile?: string;
  email?: string;
  logoUrl?: string;
  logo?: string;
  address?: string;
  billing: {
    price: number;
    gstPercent: number;
    gstAmount: number;
    totalAmount: number;
    initialPayment: number;
    paymentMode: string;
    transactionId?: string;
    note?: string;
  };
  totalPaidAmount?: number;
  subscriptionPlan: 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
  onboardDate?: any;
  expiryDate?: any;
  createdAt: any;
}

interface Payment {
  id: string;
  amount: number;
  paymentMode: string;
  transactionId?: string;
  note?: string;
  timestamp: any;
}

interface Log {
  id: string;
  action: string;
  details: string;
  userEmail: string;
  timestamp: any;
}

interface SettingsDoc {
  sectors: string[];
}

const safeDate = (val: any): Date => {
  if (!val) return new Date();
  if (typeof val.toDate === 'function') return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

export default function SuperAdminDashboard({ view = 'overview' }: { view?: 'overview' | 'clients' | 'logs' | 'settings' | 'reports' }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [settings, setSettings] = useState<SettingsDoc>({ sectors: ['Education', 'Corporate', 'Logistics', 'Retail'] });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [clientPayments, setClientPayments] = useState<Payment[]>([]);
  const [mysqlPayments, setMysqlPayments] = useState<any[]>([]);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  const copyToClipboard = (text: string, field: 'email' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success(`${field === 'email' ? 'Email' : 'Password'} copied!`);
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<Org | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActivatingClient, setIsActivatingClient] = useState(false);

  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSector, setNewOrgSector] = useState('');
  const [newOrgMobile, setNewOrgMobile] = useState('');
  const [newOrgEmail, setNewOrgEmail] = useState('');
  const [newOrgLogoUrl, setNewOrgLogoUrl] = useState('');
  const [newOrgAddress, setNewOrgAddress] = useState('');
  const [newOnboardDate, setNewOnboardDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTenureMonths, setNewTenureMonths] = useState(12);
  
  // Billing state
  const [price, setPrice] = useState<number>(0);
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [initialPayment, setInitialPayment] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'bank' | 'cheque' | 'others'>('upi');
  const [transactionId, setTransactionId] = useState('');
  const [note, setNote] = useState('');

  const [plan, setPlan] = useState<Org['subscriptionPlan']>('basic');
  const [isLoading, setIsLoading] = useState(true);

  // Computed values
  const gstAmount = Number((price * (gstPercent / 100)).toFixed(2));
  const totalAmount = price + gstAmount;
  
  // Settings specific state
  const [newSector, setNewSector] = useState('');
  const [editingSectorIdx, setEditingSectorIdx] = useState<number | null>(null);
  const [editingSectorValue, setEditingSectorValue] = useState<string>('');

  // Log filter state
  const [logSearch, setLogSearch] = useState('');

  // Reports State
  const [reportsTab, setReportsTab] = useState<'clients' | 'payments'>('clients');
  const [allPayments, setAllPayments] = useState<(Payment & { orgName: string; orgId: string })[]>([]);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false);
  const [paymentsSearch, setPaymentsSearch] = useState('');

  // Database connection states
  const [dbHost, setDbHost] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbDatabase, setDbDatabase] = useState('');
  const [dbPort, setDbPort] = useState(3306);
  const [dbProvider, setDbProvider] = useState('hostinger_vps');
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [dbLoader, setDbLoader] = useState(false);
  const [dbTestActive, setDbTestActive] = useState(false);
  const [dbSyncActive, setDbSyncActive] = useState(false);
  const [dbPullActive, setDbPullActive] = useState(false);
  const [dbTestStatus, setDbTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [dbSyncResult, setDbSyncResult] = useState<any | null>(null);

  // Automated snapshot backups state
  interface ServerBackup {
    filename: string;
    sizeBytes: number;
    mtime: string;
    type: string;
  }
  const [backups, setBackups] = useState<ServerBackup[]>([]);
  const [isBackupsLoading, setIsBackupsLoading] = useState(false);
  const [isBackupsTriggering, setIsBackupsTriggering] = useState(false);

  const getProviderLabel = (p: string) => {
    switch (p) {
      case 'bluehost': return 'Bluehost';
      case 'hostinger_shared': return 'Hostinger Shared';
      case 'hostinger_vps': return 'Hostinger VPS';
      case 'aws': return 'AWS RDS';
      case 'digitalocean': return 'DigitalOcean';
      case 'custom': return 'Custom Server / IP';
      default: return 'MySQL';
    }
  };

  const fetchDbConfig = async () => {
    setDbLoader(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/db-config', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDbHost(data.host || '');
        setDbUser(data.user || '');
        setDbDatabase(data.database || '');
        setDbPort(data.port || 3306);
        setDbProvider(data.provider || 'hostinger_vps');
        setHasSavedPassword(data.hasPassword || false);
      }
    } catch (e) {
      console.error("Failed to load DB config:", e);
    } finally {
      setDbLoader(false);
    }
  };

  const handleSaveDbConfig = async () => {
    if (!dbHost.trim() || !dbUser.trim()) {
      toast.error('Host and username are required.');
      return;
    }
    const targetDatabase = dbDatabase.trim() || dbUser.trim();
    setDbLoader(true);
    setDbTestStatus(null);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/db-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: dbHost,
          user: dbUser,
          password: dbPassword || undefined,
          database: targetDatabase,
          port: dbPort,
          provider: dbProvider
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Database settings updated!');
        if (dbPassword) {
          setHasSavedPassword(true);
          setDbPassword('');
        }
        fetchDbConfig();
      } else {
        toast.error(data.error || 'Failed to update database configuration');
      }
    } catch (e: any) {
      toast.error(e.message || 'Connection error');
    } finally {
      setDbLoader(false);
    }
  };

  const handleTestDbConnection = async () => {
    if (!dbHost.trim() || !dbUser.trim()) {
      toast.error('Please fill in Host and Username parameters first.');
      return;
    }
    const targetDatabase = dbDatabase.trim() || dbUser.trim();
    setDbTestActive(true);
    setDbTestStatus(null);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/db-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: dbHost,
          user: dbUser,
          password: dbPassword || undefined,
          database: targetDatabase,
          port: dbPort,
          provider: dbProvider
        })
      });
      const data = await res.json();
      if (res.ok) {
        setDbTestStatus({ success: true, message: data.message });
        toast.success(`Connected to ${getProviderLabel(dbProvider)} MySQL successfully!`);
      } else {
        setDbTestStatus({ success: false, message: data.error });
        toast.error('Database connection attempt failed.');
      }
    } catch (e: any) {
      setDbTestStatus({ success: false, message: e.message || 'Network request failed' });
      toast.error('Database connection network request failed.');
    } finally {
      setDbTestActive(false);
    }
  };

  const handleSyncDatabase = async () => {
    if (!window.confirm(`This will purge matching tables in your ${getProviderLabel(dbProvider)} MySQL database and overwrite them with all current records from Firestore. Proceed?`)) {
      return;
    }
    setDbSyncActive(true);
    setDbSyncResult(null);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/db-sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setDbSyncResult(data.stats);
        toast.success(data.message || 'Database synchronized successfully!');
      } else {
        toast.error(data.error || 'Sync process encountered an error.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Synchronization request failed.');
    } finally {
      setDbSyncActive(false);
    }
  };

  const handleDbPullSync = async () => {
    if (dbPullActive) return;
    setDbPullActive(true);
    const toastId = toast.loading('Connecting to MySQL and pulling database changes back to the app...');
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('You must be a verified super administrator.');
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/db-pull', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Reverse database sync pulled and synchronized successfully!', { id: toastId });
        fetchBackupsList();
      } else {
        toast.error(data.error || 'Failed to pull from MySQL.', { id: toastId });
      }
    } catch (e: any) {
      toast.error(e.message || 'Error occurred during reverse sync pull.', { id: toastId });
    } finally {
      setDbPullActive(false);
    }
  };

  const fetchBackupsList = async () => {
    setIsBackupsLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/backups-list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (e) {
      console.error("Failed to fetch server database backups list:", e);
    } finally {
      setIsBackupsLoading(false);
    }
  };

  const handleTriggerBackup = async () => {
    if (isBackupsTriggering) return;
    setIsBackupsTriggering(true);
    const toastId = toast.loading('Generating & saving backup snapshot on application disk...');
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('You must be a verified active admin.');
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/backups-trigger', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Backup snapshot written successfully!', { id: toastId });
        fetchBackupsList();
      } else {
        toast.error(data.error || 'Failed to trigger backup.', { id: toastId });
      }
    } catch (e: any) {
      toast.error(e.message || 'On-command snapshot creation failure.', { id: toastId });
    } finally {
      setIsBackupsTriggering(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    const toastId = toast.loading(`Initiating download of ${filename}...`);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      
      const res = await fetch(`/api/admin/backups-download/${encodeURIComponent(filename)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to stream requested file.');
      }
      const rawText = await res.text();
      
      const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      toast.success('Backup downloaded successfully!', { id: toastId });
    } catch (e: any) {
      toast.error(e.message || 'Download streaming failed.', { id: toastId });
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Are you absolutely sure you want to permanently delete "${filename}" from the server? This action is irreversible.`)) {
      return;
    }
    const toastId = toast.loading(`Deleting ${filename}...`);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Relational snapshot deleted from disk successfully.', { id: toastId });
        fetchBackupsList();
      } else {
        toast.error(data.error || 'Failed to purge selection.', { id: toastId });
      }
    } catch (e: any) {
      toast.error(e.message || 'Error occurred during deletion request.', { id: toastId });
    }
  };

  const handleDownloadSqlDump = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('You must be a verified active admin.');
        return;
      }
      toast.loading('Generating SQL database dump file...', { id: 'sql-dump-toast' });
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/db-dump', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to download SQL dump.');
      }
      const rawText = await res.text();
      
      const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'expertgps_mysql_dump.sql');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      
      toast.success('Logical schema & database dump (.sql) exported successfully!', { id: 'sql-dump-toast' });
    } catch (e: any) {
      toast.error(e.message || 'Dump generation request failed.', { id: 'sql-dump-toast' });
    }
  };

  const fetchReportsData = async () => {
    if (orgs.length === 0) return;
    setIsPaymentsLoading(true);

    // Eagerly pre-populate from MySQL to ensure instant and quota-resilient dashboard visualization
    const reportsPayments = mysqlPayments.map((p: any) => {
      const org = orgs.find((o: any) => o.id === p.orgId);
      return {
        ...p,
        orgName: org ? org.name : 'Unknown Client'
      };
    }).sort((a: any, b: any) => {
      const timeA = a.timestamp?.seconds || 0;
      const timeB = b.timestamp?.seconds || 0;
      return timeB - timeA;
    });
    setAllPayments(reportsPayments);

    try {
      const paymentsPromises = orgs.map(async (org) => {
        const paymentsRef = collection(db, 'organizations', org.id, 'payments');
        const snap = await getDocs(query(paymentsRef, orderBy('timestamp', 'desc')));
        return snap.docs.map(doc => ({
          id: doc.id,
          orgId: org.id,
          orgName: org.name,
          ...doc.data()
        })) as (Payment & { orgName: string; orgId: string })[];
      });
      const allResolved = await Promise.all(paymentsPromises);
      const flattened = allResolved.flat().sort((a, b) => {
        const timeA = a.timestamp?.seconds || a.timestamp?.toDate?.()?.getTime() || 0;
        const timeB = b.timestamp?.seconds || b.timestamp?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
      });
      setAllPayments(flattened);
    } catch (err: any) {
      console.warn('Firestore fetchReportsData background refresh failed (relying on MySQL cache):', err.message);
      // Suppress toast errors to ensure high resilience and no alarming messages for users when quota is out
    } finally {
      setIsPaymentsLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'reports' && orgs.length > 0) {
      fetchReportsData();
    }
  }, [view, orgs.length]);

  useEffect(() => {
    if (view === 'settings') {
      fetchDbConfig();
      fetchBackupsList();
    }
  }, [view]);

  const fetchAdminData = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch('/api/records/admin-data', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        let errMsg = 'Failed to fetch stats from MySQL';
        try {
          const errData = await response.json();
          if (errData && errData.details) {
            errMsg = errData.details;
          } else if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const res = await response.json();
      if (res.success) {
        const loadedOrgs = res.organizations || [];
        setOrgs(loadedOrgs);
        setLogs(res.logs || []);

        // Parse and store MySQL payments
        const parsedPayments = (res.payments || []).map((p: any) => ({
          ...p,
          amount: Number(p.amount || 0),
          timestamp: p.timestamp ? { seconds: Math.floor(new Date(p.timestamp).getTime() / 1000) } : null
        }));
        setMysqlPayments(parsedPayments);

        // Pre-populate report payments to survive potential Firestore quota limits
        const reportsPayments = parsedPayments.map((p: any) => {
          const org = loadedOrgs.find((o: any) => o.id === p.orgId);
          return {
            ...p,
            orgName: org ? org.name : 'Unknown Client'
          };
        }).sort((a: any, b: any) => {
          const timeA = a.timestamp?.seconds || 0;
          const timeB = b.timestamp?.seconds || 0;
          return timeB - timeA;
        });
        setAllPayments(reportsPayments);

        if (res.settings) {
          setSettings(res.settings);
          if (res.settings.sectors && res.settings.sectors.length > 0) {
            setNewOrgSector(res.settings.sectors[0]);
          }
        }
      }
    } catch (error: any) {
      console.error('Error loading data from connected MySQL database:', error);
      const msg = error?.message || 'Failed to fetch';
      if (!msg.includes("not fully configured yet")) {
        toast.error(`Database error: ${msg}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const saveMySQLRecord = async (operation: 'insert' | 'update' | 'delete', table: string, id: string, data?: any) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Unauthenticated');
    
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
        ? `Server returned HTML or crashed (Status ${response.status}). If you uploaded a large logo, the payload size might have been too large.` 
        : `Non-JSON server response (Status ${response.status}): ${responseText.slice(0, 150)}...`
      );
    }
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Failed to ${operation} record in connected database`);
    }
    
    // Refresh the dashboard data
    fetchAdminData();
    return result;
  };

  useEffect(() => {
    // Listen for auth state change to ensure getToken is available
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchAdminData();
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  const createLog = async (action: string, details: string) => {
    try {
      const logId = "log_" + Math.random().toString(36).substr(2, 9);
      await saveMySQLRecord('insert', 'logs', logId, {
        action,
        description: details,
        operator: auth.currentUser?.email || 'unknown',
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('Logging failed', e);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) { // 500KB limit for base64 storage in Firestore
        toast.error('Logo too large. Max 500KB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const exportLogsToExcel = () => {
    const data = logs.filter(log => 
      log.details.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(logSearch.toLowerCase())
    ).map(log => ({
      Action: log.action,
      Details: log.details,
      User: log.userEmail,
      Date: safeDate(log.timestamp).toLocaleDateString(),
      Time: safeDate(log.timestamp).toLocaleTimeString()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "System Logs");
    XLSX.writeFile(wb, `System_Logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Logs exported to Excel');
  };

  const exportLogsToPDF = () => {
    const doc = new jsPDF();
    const filtered = logs.filter(log => 
      log.details.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(logSearch.toLowerCase())
    );

    const body = filtered.map(log => [
      log.action,
      log.details,
      log.userEmail,
      safeDate(log.timestamp).toLocaleString()
    ]);

    (doc as any).autoTable({
      head: [['Action', 'Details', 'User', 'Timestamp']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    doc.save(`System_Logs_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Logs exported to PDF');
  };

  const handleAddOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isActivatingClient) return;
    if (!newOrgName.trim()) return;
    if (!newOrgEmail.trim()) {
      toast.error('Email is required to create client credentials');
      return;
    }

    const toastId = toast.loading('Adding and activating client in registry...');
    setIsActivatingClient(true);
    try {
      const onboard = new Date(newOnboardDate);
      const expiry = new Date(onboard);
      expiry.setMonth(onboard.getMonth() + newTenureMonths);

      const generatedId = "org_" + Math.random().toString(36).substr(2, 9);
      const newOrgData = {
        name: newOrgName,
        sector: newOrgSector || (settings.sectors[0] || 'Uncategorized'),
        mobile: newOrgMobile,
        email: newOrgEmail,
        logo: newOrgLogoUrl,
        logoUrl: newOrgLogoUrl,
        address: newOrgAddress,
        billing: {
          price,
          gstPercent,
          gstAmount,
          totalAmount,
          initialPayment,
          paymentMode,
          transactionId,
          note
        },
        subscriptionPlan: plan,
        status: 'active',
        totalPaidAmount: initialPayment,
        onboardDate: onboard.toISOString().split('T')[0],
        expiryDate: expiry.toISOString().split('T')[0],
        location: {
          lat: 17.4504,
          lng: 78.3808
        }
      };

      await saveMySQLRecord('insert', 'organizations', generatedId, newOrgData);

      // Create admin user for this organization
      try {
        const idToken = await auth.currentUser?.getIdToken();
        
        const response = await fetch('/api/admin/create-client', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            email: newOrgEmail,
            name: newOrgName,
            orgId: generatedId,
            mobile: newOrgMobile
          })
        });

        if (response.ok) {
          const result = await response.json();
          setGeneratedCredentials(result.credentials);
          setShowCredentialsModal(true);
          
          // Even if server succeeded, we can optionally ensure the doc is there or just trust it.
          // The server tried to set the doc, but if it logged an error, result might still be ok for auth?
          // Let's check if we have the UID.
          if (result.credentials?.uid) {
             try {
               await setDoc(doc(db, 'users', result.credentials.uid), {
                 uid: result.credentials.uid,
                 email: newOrgEmail,
                 name: newOrgName,
                 role: 'org_admin',
                 orgId: generatedId,
                 forcePasswordChange: true,
                 createdAt: serverTimestamp()
               }, { merge: true });
             } catch (fsErr) {
               console.warn("Client fallback failed (expected if server succeeded):", fsErr);
             }
          }

          if (!result.emailSent) {
            toast('User created, but email could not be sent. Please configure SMTP.', { icon: '⚠️' });
          }
        } else {
          // Robust JSON parsing for error responses
          let errorData: any = { error: 'Unknown server error' };
          const responseText = await response.text();
          try {
            errorData = JSON.parse(responseText);
          } catch (e) {
            console.error("Failed to parse error response as JSON:", responseText);
            const isHTML = responseText.trim().startsWith('<');
            errorData = { 
              error: isHTML ? 'SERVER_INTERNAL_ERROR' : 'NON_JSON_RESPONSE',
              message: isHTML ? 'The server returned an HTML error page. This usually means a crash or a configuration issue.' : `Raw response: ${responseText.slice(0, 100)}...`
            };
          }

          // If server failed, it might be just Firestore write.
          if (errorData.uid && errorData.error !== 'Email already exists') {
             try {
                await setDoc(doc(db, 'users', errorData.uid), {
                  uid: errorData.uid,
                  email: newOrgEmail,
                  name: newOrgName,
                  role: 'org_admin',
                  orgId: generatedId,
                  forcePasswordChange: true,
                  createdAt: serverTimestamp()
                }, { merge: true });
                toast.success('Admin user created (via secondary sync)');
             } catch (fallbackErr) {
                console.error("Critical: Admin user creation failed everywhere.", fallbackErr);
                toast.error(`Auth Error: ${errorData.error || errorData.message || 'Failed to create user'}`);
             }
          } else if (errorData.error === 'Email already exists') {
            // Clean up the newly created organization so it doesn't leave an orphan entry
            try {
              await saveMySQLRecord('delete', 'organizations', generatedId);
              console.log("Cleaned up orphan organization record for duplicated client email:", generatedId);
            } catch (cleanupErr) {
              console.error("Failed to clean up duplicate client organization record:", cleanupErr);
            }

            toast.error((t) => (
              <div className="flex flex-col gap-2 p-1">
                <span className="font-bold flex items-center gap-1 text-amber-600">
                  <AlertCircle size={14} /> Email Already Registered
                </span>
                <span className="text-[10px] leading-tight text-slate-600 font-medium">
                  This email is already registered to an existing driver, employee, or organization administrator in the registry. 
                  Please use a unique email address for this client's administrator.
                </span>
                <div className="flex gap-2 mt-2 self-end">
                   <button 
                     onClick={() => toast.dismiss(t.id)}
                     className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1.5 rounded hover:bg-slate-200 uppercase font-black tracking-widest border border-slate-200"
                   >
                     Okay
                   </button>
                </div>
              </div>
            ), { duration: 15000 });
          } else if (errorData.error === 'API_OR_IAM_ERROR') {
            const isIAM = errorData.link?.includes('iam-admin');
            toast.error((t) => (
              <div className="flex flex-col gap-2 p-1">
                <span className="font-bold flex items-center gap-1 text-red-600">
                  <AlertCircle size={14} /> {isIAM ? 'IAM Permissions Error' : 'System API Error'}
                </span>
                <span className="text-[10px] leading-tight">{errorData.message}</span>
                <div className="flex gap-2 mt-1">
                  <a 
                    href={errorData.link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 font-medium no-underline"
                    onClick={() => toast.dismiss(t.id)}
                  >
                    Go to {isIAM ? 'IAM Console' : 'Console'}
                  </a>
                  <button 
                    onClick={() => toast.dismiss(t.id)}
                    className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ), { duration: 20000 });
          } else {
            toast.error(`Auth creation failed: ${errorData.error}`);
          }
        }
      } catch (authErr) {
        console.error('Auth creation error:', authErr);
        toast.error('Client added, but failed to create login credentials automatically.');
      }

      await createLog('CREATE_CLIENT', `Created client: ${newOrgName}`);
      setIsModalOpen(false);
      
      // Reset state
      setNewOrgName('');
      setNewOrgSector('');
      setNewOrgMobile('');
      setNewOrgEmail('');
      setNewOrgLogoUrl('');
      setNewOrgAddress('');
      setNewOnboardDate(new Date().toISOString().split('T')[0]);
      setNewTenureMonths(12);
      setPrice(0);
      setInitialPayment(0);
      setTransactionId('');
      setNote('');
      
      toast.success('Client activated and synchronized successfully!', { id: toastId });
    } catch (error: any) {
      console.error("Client creation error:", error);
      handleFirestoreError(error, OperationType.CREATE, 'organizations');
      toast.error(`Failed to activate client: ${error.message || error}`, { id: toastId });
    } finally {
      setIsActivatingClient(false);
    }
  };

  const updateSectors = async (updatedSectors: string[]) => {
    try {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'settings', 'global'), { sectors: updatedSectors });
      await createLog('UPDATE_SETTINGS', 'Updated client sectors/types');
      toast.success('Settings updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
      toast.error('Failed to update settings');
    }
  };

  const renameSector = async (oldName: string, newName: string) => {
    try {
      if (!newName.trim() || oldName === newName) return;
      const updatedSectors = settings.sectors.map(s => s === oldName ? newName.trim() : s);
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'settings', 'global'), { sectors: updatedSectors });
      
      const affectedOrgs = orgs.filter(o => o.sector === oldName);
      for (const org of affectedOrgs) {
        await updateDoc(doc(db, 'organizations', org.id), { sector: newName.trim() });
      }
      
      await createLog('UPDATE_SETTINGS', `Renamed sector from "${oldName}" to "${newName.trim()}"`);
      toast.success(`Sector renamed and cascaded to ${affectedOrgs.length} client(s)`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
      toast.error('Failed to rename sector');
    }
  };

  const toggleStatus = async (org: Org) => {
    const newStatus = org.status === 'active' ? 'suspended' : 'active';
    try {
      await saveMySQLRecord('update', 'organizations', org.id, { status: newStatus });
      await createLog('UPDATE_CLIENT_STATUS', `Changed status of ${org.name} to ${newStatus}`);
      toast.success(`Client ${newStatus}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update status');
    }
  };

  const updatePlan = async (org: Org, newPlan: Org['subscriptionPlan']) => {
    try {
      await saveMySQLRecord('update', 'organizations', org.id, { subscriptionPlan: newPlan });
      await createLog('UPDATE_CLIENT_PLAN', `Changed plan of ${org.name} to ${newPlan}`);
      toast.success(`Plan updated to ${newPlan}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update plan');
    }
  };

  const confirmDelete = async () => {
    if (!orgToDelete || isDeleting) return;
    setIsDeleting(true);
    // Dismiss any active or pending toasts (like 'Generating login details...') before performing delete
    toast.dismiss();
    try {
      await saveMySQLRecord('delete', 'organizations', orgToDelete.id);
      await createLog('DELETE_CLIENT', `Deleted client: ${orgToDelete.name}`);
      toast.success('Client deleted');
      setIsDeleteModalOpen(false);
      setOrgToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete client');
    } finally {
      setIsDeleting(false);
    }
  };

  const openPaymentModal = async (org: Org) => {
    setSelectedOrg(org);
    setIsPaymentModalOpen(true);
    await fetchPayments(org.id);
  };

  const fetchPayments = async (orgId: string) => {
    // 1. Immediately present cache from MySQL payments
    const fallbackData = mysqlPayments.filter((p) => p.orgId === orgId);
    setClientPayments(fallbackData);

    // 2. Perform background refresh using Firestore if accessible
    try {
      const q = query(collection(db, 'organizations', orgId, 'payments'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Payment[];
      setClientPayments(data);
    } catch (error: any) {
      console.warn("Firestore fetchPayments failed, relying on MySQL fallback:", error.message);
      // Suppress Firestore list-error toasts during potential daily free quota limitations
    }
  };

  const handleCollectPayment = async (amount: number, mode: string, txnId: string, pNote: string) => {
    if (!selectedOrg) return;
    try {
      // 1. Add payment transaction details to Firestore
      await addDoc(collection(db, 'organizations', selectedOrg.id, 'payments'), {
        amount,
        paymentMode: mode,
        transactionId: txnId,
        note: pNote,
        timestamp: serverTimestamp()
      });

      // 2. Create standard system log (this asynchy updates Firestore & MySQL logs)
      await createLog('COLLECT_PAYMENT', `Collected ₹${amount} from ${selectedOrg.name}`);

      // 3. Update totalPaidAmount on the organization in Firestore
      const updatedTotalPaid = Number(selectedOrg.totalPaidAmount || 0) + amount;
      await updateDoc(doc(db, 'organizations', selectedOrg.id), {
        totalPaidAmount: updatedTotalPaid
      });

      // 4. Synchronize totalPaidAmount update with MySQL database
      await saveMySQLRecord('update', 'organizations', selectedOrg.id, {
        totalPaidAmount: updatedTotalPaid
      });

      // 5. Save the payment record in the MySQL payments table
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await saveMySQLRecord('insert', 'payments', paymentId, {
        orgId: selectedOrg.id,
        amount,
        paymentMode: mode,
        transactionId: txnId,
        note: pNote,
        timestamp: new Date().toISOString()
      });

      // 6. Update local states so dashboard displays instant updates
      setSelectedOrg(prev => prev ? { ...prev, totalPaidAmount: updatedTotalPaid } : null);
      setOrgs(prevOrgs => prevOrgs.map(o => o.id === selectedOrg.id ? { ...o, totalPaidAmount: updatedTotalPaid } : o));

      // 7. Refresh current client payment history and global stats list
      await fetchPayments(selectedOrg.id);
      fetchAdminData();
      
      toast.success('Payment successfully recorded and synchronized');
    } catch (error) {
      console.error("Payment collection error:", error);
      handleFirestoreError(error, OperationType.CREATE, `organizations/${selectedOrg.id}/payments`);
      toast.error('Failed to record payment');
    }
  };

  // Computed Stats for Overview
  const totalRevenue = orgs.reduce((acc, org) => acc + Number(org.billing?.totalAmount || 0), 0);
  const totalCollected = orgs.reduce((acc, org) => acc + Number(org.totalPaidAmount || 0), 0);
  const totalDue = totalRevenue - totalCollected;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayCollectionsFromPayments = logs
    .filter(log => log.action === 'COLLECT_PAYMENT' && safeDate(log.timestamp) >= today)
    .reduce((acc, log) => {
      const match = (log.details || '').match(/Collected ₹(\d+(\.\d+)?)/);
      return acc + (match ? parseFloat(match[1]) : 0);
    }, 0);

  const todayCollectionsFromOnboarding = orgs
    .filter(org => {
      const val = org.createdAt || org.onboardDate;
      if (!val) return false;
      let date: Date;
      if (val instanceof Timestamp) {
        date = val.toDate();
      } else if (typeof val === 'object' && val.seconds !== undefined) {
        date = new Date(val.seconds * 1000);
      } else if (typeof val === 'object' && typeof val.toDate === 'function') {
        date = val.toDate();
      } else {
        date = new Date(val);
      }
      return !isNaN(date.getTime()) && date >= today;
    })
    .reduce((acc, org) => acc + Number(org.billing?.initialPayment || org.totalPaidAmount || 0), 0);

  const todayTotalCollection = todayCollectionsFromPayments + todayCollectionsFromOnboarding;

  const showLoginDetails = async (org: Org) => {
    if (!org.email) {
      toast.error('Client email missing');
      return;
    }

    const tId = toast.loading('Generating login details...');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/admin/generate-login-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          email: org.email,
          name: org.name,
          orgId: org.id
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.dismiss(tId);
        setGeneratedCredentials(result.credentials);
        setShowCredentialsModal(true);
        if (result.emailSent) {
          toast.success('New credentials generated successfully', { id: tId });
        } else {
          toast('New credentials generated, but email failed. Check SMTP settings.', { id: tId, icon: '⚠️' });
        }
        await createLog('VIEW_RESET_CREDENTIALS', `Generated new credentials for client: ${org.name}`);
      } else {
        const errorData = await response.json();
        toast.dismiss(tId);
        if (errorData.error === 'API_OR_IAM_ERROR') {
          const isIAM = errorData.link?.includes('iam-admin');
          toast.error((t) => (
            <div className="flex flex-col gap-2 p-1">
              <span className="font-bold flex items-center gap-1 text-red-600">
                <AlertCircle size={14} /> {isIAM ? 'IAM Permissions Error' : 'System API Error'}
              </span>
              <span className="text-[10px] leading-tight">{errorData.message}</span>
              <div className="flex gap-2 mt-1">
                <a 
                  href={errorData.link} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 font-medium no-underline"
                  onClick={() => toast.dismiss(t.id)}
                >
                  Go to {isIAM ? 'IAM Console' : 'Console'}
                </a>
                <button 
                  onClick={() => toast.dismiss(t.id)}
                  className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ), { duration: 20000 });
        } else {
          toast.error(`Failed: ${errorData.error}`);
        }
      }
    } catch (err) {
      console.error(err);
      toast.dismiss(tId);
      toast.error('An error occurred');
    }
  };

  const renderOverview = () => (
    <div className="space-y-8">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 p-6 -m-8 mb-8 bg-slate-50 border-b border-slate-200 shrink-0">
        <StatCard label="Total Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} icon={Building2} color="blue" />
        <StatCard label="Total Collected" value={`₹${totalCollected.toLocaleString('en-IN')}`} icon={CreditCard} color="green" />
        <StatCard label="Due Balance" value={`₹${totalDue.toLocaleString('en-IN')}`} icon={AlertCircle} color="rose" />
        <StatCard label="Today Collection" value={`₹${todayTotalCollection.toLocaleString('en-IN')}`} icon={CircleDollarSign} color="indigo" />
      </section>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Recent Clients</h3>
          <div className="space-y-4">
            {orgs.slice(0, 5).map(org => (
              <div key={org.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white text-[10px] font-black uppercase">
                    {org.name.substring(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{org.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium uppercase">{org.sector || 'NO SECTOR'}</p>
                  </div>
                </div>
                <span className={cn(
                  "text-[9px] font-black px-2 py-0.5 rounded uppercase",
                  org.status === 'active' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                )}>
                  {org.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 uppercase text-[10px] tracking-widest border-b border-slate-50 pb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Infrastructure Status
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 transition-all hover:border-blue-200 group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Active Clients</p>
                  <p className="text-sm font-black text-slate-900 leading-none">{orgs.filter(o => o.status === 'active').length}</p>
                </div>
              </div>
              <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{orgs.length} Total</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 transition-all hover:border-green-200 group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pro Users</p>
                  <p className="text-sm font-black text-slate-900 leading-none">{orgs.filter(o => o.subscriptionPlan === 'pro').length}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 transition-all hover:border-purple-200 group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Enterprise</p>
                  <p className="text-sm font-black text-slate-900 leading-none">{orgs.filter(o => o.subscriptionPlan === 'enterprise').length}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 transition-all hover:border-indigo-200 group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Settings2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Logs</p>
                  <p className="text-sm font-black text-slate-900 leading-none">{logs.length.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderClients = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">Client Registry</h3>
          <p className="text-slate-500 text-xs font-medium">Manage licensed institutions, financial status, and operational constraints.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase">Active Accounts</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search clients..." 
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Identity</th>
                <th className="px-6 py-4">Timeline</th>
                <th className="px-6 py-4">Financial Status</th>
                <th className="px-6 py-4">Status & Tier</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orgs.map((org) => {
                const totalDue = Number(org.billing?.totalAmount || 0) - Number(org.totalPaidAmount || 0);
                const isOverdue = safeDate(org.expiryDate) < new Date();
                
                return (
                  <tr key={org.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const isCollege = org.orgSector === 'Education' || org.sector === 'Education'
                            ? (org.eduType === 'College' || (!org.eduType && (org.name?.toLowerCase().includes('college') || org.name?.toLowerCase().includes('university'))))
                            : false;
                          const defaultIcon = org.sector === 'Education'
                            ? (isCollege ? 'graduation-cap' : 'school')
                            : (org.sector === 'Healthcare'
                              ? 'hospital'
                              : (org.sector === 'Government'
                                ? 'museum'
                                : 'commercial'));
                          const logoSrc = org.logoUrl || org.logo || getLocalIcon(defaultIcon);
                          return (
                            <img src={logoSrc} alt={org.name} className="w-8 h-8 rounded-lg object-contain bg-slate-100 p-1" referrerPolicy="no-referrer" />
                          );
                        })()}
                        <div>
                          <span className="font-bold text-slate-800 block text-sm">{org.name}</span>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{org.sector || 'GENERIC'}</span>
                            <span className="text-[10px] text-slate-500 font-medium">{org.email} • {org.mobile}</span>
                            {org.address && <span className="text-[9px] text-slate-400 italic line-clamp-1">{org.address}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>On: {safeDate(org.onboardDate).toLocaleDateString() || 'N/A'}</span>
                        </div>
                        <div className={cn(
                          "flex items-center gap-1.5 font-bold",
                          isOverdue ? "text-red-500" : "text-slate-600"
                        )}>
                          <AlertCircle className={cn("w-3 h-3", isOverdue ? "text-red-500" : "text-slate-400")} />
                          <span>Exp: {safeDate(org.expiryDate).toLocaleDateString() || 'N/A'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex justify-between w-32">
                          <span className="text-slate-400">Total:</span>
                          <span className="font-bold text-slate-700">₹{org.billing?.totalAmount || 0}</span>
                        </div>
                        <div className="flex justify-between w-32">
                          <span className="text-slate-400">Paid:</span>
                          <span className="font-bold text-green-600">₹{org.totalPaidAmount || 0}</span>
                        </div>
                        <div className="flex justify-between w-32 pt-1 border-t border-slate-100">
                          <span className="text-slate-400 font-black">DUE:</span>
                          <span className={cn(
                            "font-black",
                            totalDue > 0 ? "text-red-600" : "text-blue-600"
                          )}>₹{totalDue}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <button 
                          onClick={() => toggleStatus(org)}
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black tracking-tight cursor-pointer hover:opacity-80 transition-opacity uppercase",
                            org.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}
                        >
                          {org.status}
                        </button>
                        <select 
                          value={org.subscriptionPlan}
                          onChange={(e) => updatePlan(org, e.target.value as any)}
                          className="block bg-transparent font-mono text-[9px] font-black text-slate-500 focus:outline-none cursor-pointer hover:text-blue-600 transition-colors uppercase"
                        >
                          <option value="basic">BASIC</option>
                          <option value="pro">PRO</option>
                          <option value="enterprise">ENTERPRISE</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => showLoginDetails(org)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Resend Login Details"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openPaymentModal(org)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                          title="Collect Payment"
                        >
                          <CircleDollarSign className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => { setSelectedOrg(org); setIsEditModalOpen(true); }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Client"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => { setOrgToDelete(org); setIsDeleteModalOpen(true); }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete Client"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderLogs = () => {
    const filteredLogs = logs.filter(log => 
      log.details.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(logSearch.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-800 tracking-tight">System Audit</h3>
            <p className="text-slate-500 text-xs font-medium">Real-time intelligence stream focusing on high-level administrative events.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={exportLogsToExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-sm"
            >
              <Table className="w-3.5 h-3.5" />
              Excel
            </button>
            <button 
              onClick={exportLogsToPDF}
              className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-sm"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase shrink-0">Intelligence Stream</h3>
            <div className="relative w-full md:max-w-xs transition-all focus-within:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Search by client, plan, user..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto custom-scrollbar">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                      log.action.includes('CREATE') ? "bg-green-100 text-green-700" :
                      log.action.includes('DELETE') ? "bg-red-100 text-red-700" :
                      log.action.includes('UPDATE') ? "bg-amber-100 text-amber-700" :
                      "bg-blue-100 text-blue-700"
                    )}>
                      {log.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {safeDate(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 font-bold">{log.details}</p>
                  <p className="text-[10px] text-slate-400 mt-1 italic font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Agent: {log.userEmail}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-12 text-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-slate-500 text-xs font-medium">No intelligence matches your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">System Settings</h3>
        <p className="text-slate-500 text-xs font-medium">Global configuration for client classification and sectors.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Client Sectors</h4>
          <div className="space-y-3 mb-6">
            {settings.sectors.map((sector, idx) => {
              const isDefaultSector = sector.toLowerCase() === 'education' || sector.toLowerCase() === 'corporate';
              const enrolledClients = orgs.filter(o => o.sector?.toLowerCase() === sector.toLowerCase());
              const hasEnrolledClients = enrolledClients.length > 0;
              const cannotDelete = isDefaultSector || hasEnrolledClients;

              return (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl group min-h-[56px]">
                  {editingSectorIdx === idx ? (
                    <div className="flex items-center gap-2 w-full">
                      <input 
                        type="text"
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={editingSectorValue}
                        onChange={(e) => setEditingSectorValue(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingSectorValue.trim()) {
                            renameSector(sector, editingSectorValue.trim());
                            setEditingSectorIdx(null);
                          } else if (e.key === 'Escape') {
                            setEditingSectorIdx(null);
                          }
                        }}
                      />
                      <button 
                        onClick={() => {
                          if (editingSectorValue.trim()) {
                            renameSector(sector, editingSectorValue.trim());
                          }
                          setEditingSectorIdx(null);
                          setEditingSectorValue('');
                        }}
                        className="text-blue-600 hover:text-blue-800 font-black text-[10px] uppercase tracking-widest px-2 py-1"
                      >
                        SAVE
                      </button>
                      <button 
                        onClick={() => {
                          setEditingSectorIdx(null);
                          setEditingSectorValue('');
                        }}
                        className="text-slate-400 hover:text-slate-600 font-black text-[10px] uppercase tracking-widest px-2 py-1"
                      >
                        CANCEL
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{sector}</span>
                        {hasEnrolledClients && (
                          <span className="text-[9px] text-blue-500 font-bold uppercase tracking-tight mt-0.5">
                            {enrolledClients.length} enrolled {enrolledClients.length === 1 ? 'client' : 'clients'}
                          </span>
                        )}
                        {isDefaultSector && !hasEnrolledClients && (
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                            Default System Sector
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setEditingSectorIdx(idx);
                            setEditingSectorValue(sector);
                          }}
                          className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all font-black text-[10px] uppercase tracking-widest"
                        >
                          EDIT
                        </button>
                        {cannotDelete ? (
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400/80 border border-slate-200/50 rounded-full px-2.5 py-1 bg-slate-100 italic" title={isDefaultSector ? "Default system sector can't be deleted" : "Engaged by enrolled clients"}>
                            {isDefaultSector ? 'SYSTEM' : 'ENROLLED'}
                          </span>
                        ) : (
                          <button 
                            onClick={() => updateSectors(settings.sectors.filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all font-black text-[10px] uppercase tracking-widest"
                          >
                            REMOVE
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newSector}
              onChange={(e) => setNewSector(e.target.value)}
              placeholder="Add new sector..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button 
              onClick={() => {
                if (newSector.trim()) {
                  updateSectors([...settings.sectors, newSector.trim()]);
                  setNewSector('');
                }
              }}
              className="bg-slate-900 text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800"
            >
              Add
            </button>
          </div>
        </div>

        <div className="bg-blue-600 p-8 rounded-3xl text-white">
          <h4 className="text-sm font-black uppercase tracking-widest mb-4">Metadata Engine</h4>
          <p className="text-xs text-blue-100 leading-relaxed mb-6">
            These sectors determine how client organizations are indexed and prioritized within the global tracking registry. Changes apply immediately to new client registrations.
          </p>
          <div className="p-4 bg-blue-500/30 rounded-2xl border border-blue-400/30">
            <p className="text-[10px] font-black uppercase tracking-tighter mb-2">Registry Stats</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-black">{settings.sectors.length}</p>
                <p className="text-[8px] uppercase font-bold text-blue-200">Active Sectors</p>
              </div>
              <div>
                <p className="text-2xl font-black">{orgs.length}</p>
                <p className="text-[8px] uppercase font-bold text-blue-200">Global Clients</p>
              </div>
            </div>
          </div>
        </div>
      </div>

       {/* Relational Database MySQL Integration Engine */}
      <div className="bg-slate-950 p-8 rounded-3xl text-white border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Database className="w-48 h-48 text-slate-400" />
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Server className="w-5 h-5" />
                </span>
                <h4 className="text-base font-black uppercase tracking-wider">{getProviderLabel(dbProvider)} Mirror Engine</h4>
              </div>
              <p className="text-slate-400 text-xs font-medium">
                Synchronize, backup, and mirror your platform's entire catalog into a remote {getProviderLabel(dbProvider)} relational database.
                <span className="text-emerald-400 font-bold block mt-1">
                  💡 Bidirectional Sync Active: Deleting or modifying records directly on your connected MySQL database immediately updates the application.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button 
                onClick={handleTestDbConnection}
                disabled={dbTestActive || dbSyncActive}
                className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
              >
                {dbTestActive ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                {dbTestActive ? 'Testing Connection...' : 'Test Connection'}
              </button>
              <button
                onClick={handleSyncDatabase}
                disabled={dbSyncActive || dbTestActive || dbPullActive || !dbHost}
                className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all shadow-lg hover:shadow-blue-500/25 cursor-pointer"
              >
                {dbSyncActive ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {dbSyncActive ? 'Mirroring Data...' : 'Sync & Overwrite'}
              </button>
              <button
                onClick={handleDbPullSync}
                disabled={dbPullActive || dbSyncActive || dbTestActive || !dbHost}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all shadow-lg hover:shadow-indigo-500/25 cursor-pointer font-bold"
                title="Immediately import deletions, updates, or creations from your connected database back into the application workspace."
              >
                {dbPullActive ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {dbPullActive ? 'Pulling Data...' : 'Pull Sync from MySQL'}
              </button>
              <button
                onClick={handleDownloadSqlDump}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/25 cursor-pointer font-bold"
                title="Generates and downloads a complete tables schema structures and raw tables records insertion dump file (.sql) for manual phpMyAdmin imports."
              >
                <Download className="w-3.5 h-3.5" />
                Export SQL Dump
              </button>
            </div>
          </div>

          {dbLoader ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest">Loading database credentials...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Config Form */}
              <div className="lg:col-span-7 bg-slate-900/50 p-6 rounded-2xl border border-slate-800/80 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-2">MySQL Configuration Parameters</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1.5 font-sans">Database Provider / Host Server</label>
                    <select
                      value={dbProvider}
                      onChange={(e) => setDbProvider(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-medium cursor-pointer"
                    >
                      <option value="hostinger_vps">Hostinger VPS</option>
                      <option value="hostinger_shared">Hostinger Shared Hosting</option>
                      <option value="bluehost">Bluehost Shared Hosting</option>
                      <option value="aws">AWS RDS (Relational Database Service)</option>
                      <option value="digitalocean">DigitalOcean Droplet / Managed Database</option>
                      <option value="custom">Custom Server / Private IP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1.5 font-sans">Host Address / IP</label>
                    <input 
                      type="text" 
                      value={dbHost}
                      onChange={(e) => setDbHost(e.target.value)}
                      placeholder={dbProvider === 'aws' ? 'xxxx.xxxx.us-east-1.rds.amazonaws.com' : 'e.g. database.domain.com or IP'} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1.5 font-sans">Username</label>
                    <input 
                      type="text" 
                      value={dbUser}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDbUser(val);
                        setDbDatabase(val);
                      }}
                      placeholder="e.g. database_user" 
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1.5 font-sans">Port</label>
                    <input 
                      type="number" 
                      value={dbPort}
                      onChange={(e) => setDbPort(parseInt(e.target.value) || 3306)}
                      placeholder="3306" 
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 font-sans font-black">Password</label>
                    {hasSavedPassword && (
                      <span className="text-[8px] text-green-400 font-bold uppercase tracking-tight bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 font-sans">Saved in Secure Admin Registry</span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    placeholder={hasSavedPassword ? "•••••••••••••••••" : "Database user password"} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-medium font-mono"
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800/80">
                  <button 
                    onClick={handleSaveDbConfig}
                    className="bg-white hover:bg-slate-150 text-slate-950 text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-xl transition-all cursor-pointer font-bold"
                  >
                    Save & Apply Config
                  </button>
                </div>
              </div>

              {/* Status and Sync overview */}
              <div className="lg:col-span-12 xl:col-span-5 flex flex-col justify-between gap-6">
                {/* Connection check card */}
                <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl flex-1 flex flex-col justify-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 pb-2 border-b border-slate-800 font-sans">Connection Health Status</p>
                  
                  {dbTestStatus ? (
                    <div className={cn(
                      "p-4 rounded-xl border flex gap-3 items-start",
                      dbTestStatus.success ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                    )}>
                      {dbTestStatus.success ? (
                        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-green-400" />
                      ) : (
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                      )}
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider mb-1 font-sans">
                          {dbTestStatus.success ? 'Verification Passed!' : 'Verification Failed'}
                        </p>
                        <p className="text-[10px] text-slate-300 font-mono leading-relaxed select-all w-full overflow-hidden text-ellipsis">
                          {dbTestStatus.message}
                        </p>
                        {!dbTestStatus.success && (
                          <p className="text-[10px] text-orange-400 mt-2 font-sans italic leading-relaxed">
                            {dbProvider === 'bluehost' && "* Note: Enable remote MySQL connections in your Bluehost cPanel under 'Remote MySQL' by adding our server's IP address or '%' wildcard for global testing access."}
                            {dbProvider === 'hostinger_shared' && "* Note: Go to Hostinger hPanel -> Databases -> MySQL Databases -> Enable Remote MySQL for your domain IP/wildcard."}
                            {dbProvider === 'hostinger_vps' && "* VPS Tip: Edit bind-address to 0.0.0.0 in /etc/mysql/mysql.conf.d/mysqld.cnf, run 'systemctl restart mysql', and execute 'ufw allow 3306/tcp' on your server."}
                            {dbProvider === 'aws' && "* AWS Tip: Verify your AWS RDS security group allows inbound TCP 3306 connections, and the instance is set to Publicly Accessible."}
                            {dbProvider === 'digitalocean' && "* DO Tip: Authorize public inbound access to port 3306 on your Droplet firewall, or add our IP to your Managed DB Trusted Sources."}
                            {dbProvider === 'custom' && "* Custom Server Tip: Check bind-address/interfaces mapping, open ports, and ensure your DB user has remote privileges granted."}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-500 flex flex-col items-center gap-2">
                      <Database className="w-10 h-10 text-slate-700" />
                      <p className="text-xs font-medium text-slate-400 font-sans">Connection not verified yet.</p>
                      <p className="text-[9px] text-slate-500 font-sans">Click "Test Connection" to check host accessibility.</p>
                      <div className="mt-2 text-[9px] text-slate-400 bg-slate-900 border border-slate-800 p-2.5 rounded-xl font-sans self-stretch text-left leading-relaxed">
                        <span className="font-bold text-blue-400 block mb-0.5 uppercase tracking-wide text-[8px]">Quick Guide:</span>
                        {dbProvider === 'bluehost' && "Enable remote MySQL connections in Bluehost cPanel -> 'Remote MySQL' (add '%' wildcard or source IPs)."}
                        {dbProvider === 'hostinger_shared' && "Authorize Remote MySQL in Hostinger hPanel -> Databases -> MySQL Databases."}
                        {dbProvider === 'hostinger_vps' && "Open port 3306 on VPS ('ufw allow 3306/tcp') and modify bind-address to 0.0.0.0 in mysql configurations."}
                        {dbProvider === 'aws' && "Enable Public Accessibility on AWS RDS configuration and configure security groups to allow port 3306."}
                        {dbProvider === 'digitalocean' && "Configure Cloud Firewalls -> inbound rules on DO dashboard or add source IPs."}
                        {dbProvider === 'custom' && "Verify server socket bindings, active firewalls, and MySQL user remote authorization rules."}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mirroring Result Overview */}
                <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl flex-1 flex flex-col justify-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 pb-2 border-b border-slate-800 font-sans">Relational Sync Summary</p>
                  
                  {dbSyncResult ? (
                    <div className="space-y-3">
                      <div className="text-green-400 text-xs font-black flex items-center gap-2 mb-2 font-sans">
                        <CheckCircle2 className="w-4 h-4" />
                        TABULAR COPIES COMPLETED!
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10px] font-mono text-slate-300 font-bold">
                        <div className="flex justify-between border-b border-slate-800/60 pb-1">
                          <span>Organizations</span>
                          <span className="text-blue-400">{dbSyncResult.organizations}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1">
                          <span>Users</span>
                          <span className="text-blue-400">{dbSyncResult.users}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1">
                          <span>Trips</span>
                          <span className="text-blue-400">{dbSyncResult.trips}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1">
                          <span>Vehicles</span>
                          <span className="text-blue-400">{dbSyncResult.vehicles}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1">
                          <span>Routes</span>
                          <span className="text-blue-400">{dbSyncResult.routes}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1">
                          <span>Payments</span>
                          <span className="text-blue-400">{dbSyncResult.payments}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-500 flex flex-col items-center gap-2 font-sans">
                      <RefreshCw className="w-8 h-8 text-slate-700" />
                      <p className="text-xs font-medium text-slate-400">Ready to replicate catalog registers.</p>
                      <p className="text-[9px] text-slate-500">Click "Sync & Overwrite" to begin tabular schema export.</p>
                      <div className="mt-2 text-[9px] text-slate-400 bg-slate-900 border border-slate-800 p-2.5 rounded-xl font-sans self-stretch text-left leading-relaxed">
                        <span className="font-bold text-emerald-400 block mb-0.5 uppercase tracking-wide text-[8px]">🎯 Dynamic Option for Offline / Manual Import:</span>
                        If remote port 3306 connection is closed, click the <strong className="text-emerald-400 font-bold">"Export SQL Dump"</strong> button at the top. It downloads a complete <span className="text-white">.sql</span> backup script containing all table structures and insert statements of your data. You can import this file inside your Hostinger / Bluehost phpMyAdmin database manager in one-click!
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Automated Everyday 2:00 AM Database Backups Panel */}
      <div className="bg-slate-950 p-8 rounded-3xl text-white border border-slate-800 shadow-2xl relative overflow-hidden mt-8">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <History className="w-48 h-48 text-slate-400" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5 font-sans">
                <span className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Calendar className="w-5 h-5 animate-pulse" />
                </span>
                <div>
                  <h4 className="text-base font-black uppercase tracking-wider">Scheduled Snapshots System</h4>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider font-mono">AUTOMATED 2:00 AM DAILY BACKUPS ACTIVE</p>
                </div>
              </div>
              <p className="text-slate-400 text-xs font-medium font-sans">
                The database is backed up automatically inside the application container workspace <strong className="text-emerald-400">every night at 2:00 AM</strong>. Only the last <strong className="text-emerald-400">10 days</strong> of backup files are retained.
              </p>
            </div>
            
            <div className="flex items-center gap-2.5">
              <button
                onClick={fetchBackupsList}
                disabled={isBackupsLoading}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer font-sans"
                title="Refresh backup records from local disk storage"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isBackupsLoading && "animate-spin")} />
                Refresh List
              </button>
              <button
                onClick={handleTriggerBackup}
                disabled={isBackupsTriggering}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/25 cursor-pointer font-bold font-sans"
                title="Manually record a snapshot backup database file to disk immediately"
              >
                <Plus className="w-3.5 h-3.5" />
                Trigger Snapshot Backup
              </button>
            </div>
          </div>

          {isBackupsLoading ? (
            <div className="border border-slate-800 bg-slate-900/10 rounded-2xl py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 font-sans">Scanning local disk backups...</span>
            </div>
          ) : backups.length === 0 ? (
            <div className="border border-dashed border-slate-850 bg-slate-900/10 rounded-2xl p-8 py-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <FileText className="w-10 h-10 text-slate-700 mb-1" />
              <p className="text-xs font-medium text-slate-400 font-sans">No database backup files exist yet.</p>
              <p className="text-[9px] text-slate-500 max-w-md mx-auto font-sans leading-relaxed">
                Automatic scheduled triggers execute at 2:00 AM. Click "Trigger Snapshot Backup" above to immediately generate your first backup.
              </p>
            </div>
          ) : (
            <div className="border border-slate-800/80 bg-slate-950 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 text-[10px] font-black uppercase tracking-widest font-sans">
                      <th className="px-6 py-4">Filename</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Storage Size</th>
                      <th className="px-6 py-4">Creation Date</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                    {backups.map((bak) => {
                      const sizeKb = (bak.sizeBytes / 1024).toFixed(2);
                      const formattedDate = new Date(bak.mtime).toLocaleString();
                      const isAuto = bak.filename.includes("_auto_");

                      return (
                        <tr key={bak.filename} className="hover:bg-slate-900/30 transition-all">
                          <td className="px-6 py-4 font-bold text-slate-200 break-all select-all selection:bg-emerald-550 selection:text-black">
                            {bak.filename}
                          </td>
                          <td className="px-6 py-4">
                            {isAuto ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Scheduled (2 AM)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                Manual Snapshot
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-300">
                            {sizeKb} KB
                          </td>
                          <td className="px-6 py-4 text-slate-400">
                            {formattedDate}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2.5 font-sans">
                              <button
                                onClick={() => handleDownloadBackup(bak.filename)}
                                className="bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 hover:border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all text-[10px] font-bold uppercase tracking-wide cursor-pointer font-sans"
                                title="Download script (.sql) to local machine"
                              >
                                <Download className="w-3 h-3" />
                                Download
                              </button>
                              <button
                                onClick={() => handleDeleteBackup(bak.filename)}
                                className="bg-slate-900 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/20 p-1.5 rounded-lg transition-all cursor-pointer"
                                title="Permanently delete from disk storage"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-slate-500 font-sans">
                <span className="font-medium">
                  Showing {backups.length} stored relational database logical scripts (Retaining last 10 days of backups list).
                </span>
                <span className="font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg text-[9px]">
                  Storage Location: /backups/
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const exportClientsCSV = () => {
    try {
      const headers = ['Client Name', 'Sector', 'Plan', 'Status', 'Onboard Date', 'Expiry Date', 'Total Paid (INR)', 'Monthly Cost (INR)'];
      const data = orgs.map(org => [
        org.name,
        org.sector || 'N/A',
        org.subscriptionPlan.toUpperCase(),
        org.status.toUpperCase(),
        org.onboardDate instanceof Timestamp ? org.onboardDate.toDate().toLocaleDateString() : (org.onboardDate ? new Date(org.onboardDate).toLocaleDateString() : 'N/A'),
        org.expiryDate instanceof Timestamp ? org.expiryDate.toDate().toLocaleDateString() : (org.expiryDate ? new Date(org.expiryDate).toLocaleDateString() : 'N/A'),
        org.totalPaidAmount || 0,
        org.billing?.price || 0
      ]);
      const csvContent = [headers.join(','), ...data.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `ExpertGPS_Clients_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Client list report exported successfully!');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  const exportPaymentsCSV = () => {
    if (allPayments.length === 0) {
      toast.error('No transactions to export');
      return;
    }
    try {
      const headers = ['Receipt ID', 'Organization Name', 'Payment Date', 'Amount Received (INR)', 'Payment Mode', 'Reference ID', 'Remarks'];
      const data = allPayments.map(p => [
        p.id,
        p.orgName,
        p.timestamp instanceof Timestamp ? p.timestamp.toDate().toLocaleDateString() : (p.timestamp ? new Date(p.timestamp).toLocaleDateString() : 'N/A'),
        p.amount,
        p.paymentMode.toUpperCase(),
        p.transactionId || 'N/A',
        p.note || 'N/A'
      ]);
      const csvContent = [headers.join(','), ...data.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `ExpertGPS_Payment_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Payments transaction ledger exported!');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  const renderReports = () => {
    const activeClientsNum = orgs.filter(o => o.status === 'active').length;
    const suspendedClientsNum = orgs.filter(o => o.status === 'suspended').length;
    
    const nowMs = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const nearExpiryCount = orgs.filter(o => {
      if (!o.expiryDate) return false;
      const expDate = o.expiryDate instanceof Timestamp ? o.expiryDate.toDate() : new Date(o.expiryDate);
      const diff = expDate.getTime() - nowMs;
      return diff > 0 && diff <= thirtyDaysMs;
    }).length;

    const sectorStats = settings.sectors.map(sector => {
      const enrolled = orgs.filter(o => o.sector?.toLowerCase() === sector.toLowerCase());
      const value = enrolled.length;
      return { name: sector, count: value, revenue: enrolled.reduce((acc, current) => acc + Number(current.totalPaidAmount || 0), 0) };
    }).filter(s => s.count > 0);

    const basicCount = orgs.filter(o => o.subscriptionPlan === 'basic').length;
    const proCount = orgs.filter(o => o.subscriptionPlan === 'pro').length;
    const enterpriseCount = orgs.filter(o => o.subscriptionPlan === 'enterprise').length;
    const planData = [
      { name: 'Basic', value: basicCount, color: '#64748B' },
      { name: 'Pro', value: proCount, color: '#3B82F6' },
      { name: 'Enterprise', value: enterpriseCount, color: '#10B981' }
    ].filter(p => p.value > 0);

    const totalProjected = orgs.reduce((sum, item) => sum + Number(item.billing?.totalAmount || 0), 0);
    const totalCollected = orgs.reduce((sum, item) => sum + Number(item.totalPaidAmount || 0), 0);
    const totalPending = totalProjected - totalCollected;

    const paymentModeCount: Record<string, number> = {};
    allPayments.forEach(p => {
      const mode = (p.paymentMode || 'others').toLowerCase();
      paymentModeCount[mode] = (paymentModeCount[mode] || 0) + p.amount;
    });
    const paymentColors: Record<string, string> = {
      upi: '#4F46E5',
      bank: '#06B6D4',
      cash: '#10B981',
      cheque: '#F59E0B',
      others: '#64748B'
    };
    const paymentModeData = Object.entries(paymentModeCount).map(([key, val]) => ({
      name: key.toUpperCase(),
      value: val,
      color: paymentColors[key] || '#94A3B8'
    }));

    const filteredPayments = allPayments.filter(p => {
      const searchStr = paymentsSearch.toLowerCase();
      return (
        p.orgName.toLowerCase().includes(searchStr) ||
        (p.transactionId || '').toLowerCase().includes(searchStr) ||
        (p.note || '').toLowerCase().includes(searchStr) ||
        p.paymentMode.toLowerCase().includes(searchStr)
      );
    });

    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -z-10" />
          <div>
            <span className="text-[10px] font-black tracking-[0.2em] text-blue-600 uppercase">System Analytics Hub</span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1 mb-2">Historical Analytics & Business Intelligence</h1>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              Real-time monitoring of active organizational sectors, subscription renewals, revenue optimization curves, outstanding claims, and the global payments journal.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={exportClientsCSV} 
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-xs shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export Clients
            </button>
            <button 
              onClick={exportPaymentsCSV} 
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-md shadow-blue-500/20 shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-blue-100" />
              Export Payments
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setReportsTab('clients')}
            className={cn(
              "px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2",
              reportsTab === 'clients' 
                ? "border-blue-600 text-blue-600 font-extrabold bg-blue-50/50 rounded-t-xl" 
                : "border-transparent text-slate-400 hover:text-slate-800"
            )}
          >
            <Building2 className="w-4 h-4" />
            Client Analytics
          </button>
          <button 
            onClick={() => setReportsTab('payments')}
            className={cn(
              "px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2",
              reportsTab === 'payments' 
                ? "border-blue-600 text-blue-600 font-extrabold bg-blue-50/50 rounded-t-xl" 
                : "border-transparent text-slate-400 hover:text-slate-800"
            )}
          >
            <CircleDollarSign className="w-4 h-4" />
            Financial & Outstanding Payments
          </button>
        </div>

        {reportsTab === 'clients' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Building2 className="w-5 h-5 font-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight leading-none mb-1">Total Enrolled Clients</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{orgs.length}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                  <ShieldCheck className="w-5 h-5 font-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight leading-none mb-1">Active Status</p>
                  <p className="text-2xl font-black text-emerald-600 leading-none">{activeClientsNum}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                  <AlertCircle className="w-5 h-5 font-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight leading-none mb-1">Near Expiry (30 days)</p>
                  <p className="text-2xl font-black text-amber-600 leading-none">{nearExpiryCount}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                  <AlertCircle className="w-5 h-5 font-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight leading-none mb-1">Suspended Clients</p>
                  <p className="text-2xl font-black text-rose-600 leading-none">{suspendedClientsNum}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Clients by Organizational Sectors</h3>
                {sectorStats.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl">
                    No sector registrations recorded yet.
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sectorStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                        <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
                        <ChartTooltip contentStyle={{ borderRadius: '12px', fontSize: '11px', border: '1px solid #E2E8F0' }} />
                        <Bar dataKey="count" name="Enrolled Clients" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Subscriptions Packages Breakdown</h3>
                {planData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl">
                    No plan subscriptions found.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center h-64">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={planData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {planData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ChartTooltip contentStyle={{ borderRadius: '12px', fontSize: '11px', border: '1px solid #E2E8F0' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-4">
                      {planData.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-xs font-bold text-slate-700">{p.name} Tier</span>
                          </div>
                          <span className="text-xs font-black text-slate-900">{p.value} Clients</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Demographic Segment Metrics Matrix</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Demographic Sector</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Total Enrolled</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-right">Revenue Contributed</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Active Ratio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {settings.sectors.map((sector, index) => {
                      const enrolled = orgs.filter(o => o.sector?.toLowerCase() === sector.toLowerCase());
                      const totalAmt = enrolled.reduce((acc, curr) => acc + Number(curr.totalPaidAmount || 0), 0);
                      const activeNum = enrolled.filter(o => o.status === 'active').length;
                      const activePercentage = enrolled.length > 0 ? Math.round((activeNum / enrolled.length) * 100) : 0;

                      return (
                        <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 font-bold text-xs text-slate-700">{sector}</td>
                          <td className="py-4 text-xs font-black text-slate-900 text-center">{enrolled.length} clients</td>
                          <td className="py-4 text-xs font-black text-slate-900 text-right">₹{totalAmt.toLocaleString('en-IN')}</td>
                          <td className="py-4 text-center">
                            {enrolled.length > 0 ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-100">
                                {activePercentage}% ACTIVE
                              </div>
                            ) : (
                              <span className="text-[9px] font-bold text-slate-400 uppercase italic">NO ENGAGEMENTS</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <CreditCard className="w-5 h-5 font-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight leading-none mb-1">Total Contract Values (Projected)</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">₹{totalProjected.toLocaleString('en-IN')}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                  <CircleDollarSign className="w-5 h-5 font-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight leading-none mb-1">Capital Income (Collected)</p>
                  <p className="text-2xl font-black text-emerald-600 leading-none">₹{totalCollected.toLocaleString('en-IN')}</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                  <History className="w-5 h-5 font-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight leading-none mb-1">Outstanding Backlog (Pending)</p>
                  <p className="text-2xl font-black text-rose-600 leading-none">₹{totalPending.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Income Realization Index</h3>
                  <p className="text-xs text-slate-400 mb-6">Percentage profile of contract billing values vs actual money deposited in registers.</p>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-2">
                      <span>Received Realization Ratio</span>
                      <span className="text-emerald-600 font-extrabold">{totalProjected > 0 ? Math.round((totalCollected / totalProjected) * 100) : 0}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-emerald-500 h-3 rounded-full" style={{ width: `${totalProjected > 0 ? (totalCollected / totalProjected) * 100 : 0}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-2">
                      <span>Pending Outstanding Debt Liability</span>
                      <span className="text-rose-600 font-extrabold">{totalProjected > 0 ? Math.round((totalPending / totalProjected) * 100) : 0}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-rose-500 h-3 rounded-full" style={{ width: `${totalProjected > 0 ? (totalPending / totalProjected) * 100 : 0}%` }} />
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 text-[10px] font-semibold text-slate-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Realization indices are calculated dynamically based on contract setup payments logs. Update pending dues in Clients &gt; Billing histories.</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Preferred Transaction Modes</h3>
                {paymentModeData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl">
                    No payment transaction logging found.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center h-64">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={paymentModeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {paymentModeData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ChartTooltip contentStyle={{ borderRadius: '12px', fontSize: '11px', border: '1px solid #E2E8F0' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-4">
                      {paymentModeData.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-xs font-bold text-slate-700">{p.name}</span>
                          </div>
                          <span className="text-xs font-black text-slate-900">₹{p.value.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Global Transactions Ledger</h3>
                  <p className="text-xs text-slate-400 mt-1">Full structural audit log of receipt deposits collected via super admin accounts.</p>
                </div>
                <div className="relative max-w-xs w-full">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text"
                    value={paymentsSearch}
                    onChange={(e) => setPaymentsSearch(e.target.value)}
                    placeholder="Search by client or TXID..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {isPaymentsLoading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Compiling Transactions...</span>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400 bg-slate-50/50 rounded-3xl">
                  No payment transactions matched search criteria or are logged.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Depositor Client Name</th>
                        <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Receipt Date</th>
                        <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-right">Deposited Amount</th>
                        <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Transfer Mode</th>
                        <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Transaction Ref ID</th>
                        <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Remarks / Logs description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredPayments.map((p, index) => {
                        return (
                          <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 font-bold text-xs text-slate-800">{p.orgName}</td>
                            <td className="py-3.5 text-xs font-semibold text-slate-500 text-center">
                              {p.timestamp instanceof Timestamp ? p.timestamp.toDate().toLocaleDateString() : (p.timestamp ? new Date(p.timestamp).toLocaleDateString() : 'N/A')}
                            </td>
                            <td className="py-3.5 text-xs font-black text-emerald-600 text-right">₹{p.amount.toLocaleString('en-IN')}</td>
                            <td className="py-3.5 text-center">
                              <span className="inline-block text-[9px] font-black uppercase tracking-wider px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                                {p.paymentMode}
                              </span>
                            </td>
                            <td className="py-3.5 font-mono text-xs text-slate-500">{p.transactionId || 'N/A'}</td>
                            <td className="py-3.5 text-xs text-slate-400 tracking-tight">{p.note || '--'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {view === 'overview' && renderOverview()}
      {view === 'clients' && renderClients()}
      {view === 'reports' && renderReports()}
      {view === 'logs' && renderLogs()}
      {view === 'settings' && renderSettings()}

      {isModalOpen && (
        <CreateClientModal 
          isOpen={isModalOpen} 
          onClose={() => !isActivatingClient && setIsModalOpen(false)} 
          settings={settings}
          onAdd={handleAddOrg}
          onLogoUpload={handleLogoUpload}
          isActivating={isActivatingClient}
          formStates={{
            newOrgName, setNewOrgName,
            newOrgSector, setNewOrgSector,
            newOrgMobile, setNewOrgMobile,
            newOrgEmail, setNewOrgEmail,
            newOrgLogoUrl, setNewOrgLogoUrl,
            price, setPrice,
            gstPercent, setGstPercent,
            initialPayment, setInitialPayment,
            paymentMode, setPaymentMode,
            transactionId, setTransactionId,
            note, setNote,
            plan, setPlan,
            gstAmount, totalAmount,
            newOnboardDate, setNewOnboardDate,
            newTenureMonths, setNewTenureMonths,
            newOrgAddress, setNewOrgAddress
          }}
        />
      )}

      {showCredentialsModal && generatedCredentials && (
        <CredentialsModal
          credentials={generatedCredentials}
          onClose={() => {
            setShowCredentialsModal(false);
            setGeneratedCredentials(null);
          }}
        />
      )}

      {isPaymentModalOpen && selectedOrg && (
        <PaymentModal 
          org={selectedOrg} 
          onClose={() => setIsPaymentModalOpen(false)} 
          payments={clientPayments}
          onCollect={handleCollectPayment}
        />
      )}

      {isEditModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl relative overflow-hidden">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute right-6 top-6 text-slate-400">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-6">Modify Client Profile</h2>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Company Name *</label>
                  <input 
                    type="text" 
                    value={selectedOrg.name}
                    onChange={(e) => setSelectedOrg({...selectedOrg, name: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Sector *</label>
                  <select 
                    value={selectedOrg.sector}
                    onChange={(e) => setSelectedOrg({...selectedOrg, sector: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {settings.sectors.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Support Email *</label>
                  <input 
                    type="email" 
                    value={selectedOrg.email}
                    onChange={(e) => setSelectedOrg({...selectedOrg, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Mobile *</label>
                  <PhoneInput 
                    value={selectedOrg.mobile || ''}
                    onChange={(val) => setSelectedOrg({...selectedOrg, mobile: val})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Subscription Tier *</label>
                  <select 
                    value={selectedOrg.subscriptionPlan}
                    onChange={(e) => setSelectedOrg({...selectedOrg, subscriptionPlan: e.target.value as any})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Status *</label>
                  <select 
                    value={selectedOrg.status}
                    onChange={(e) => setSelectedOrg({...selectedOrg, status: e.target.value as any})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Business Address</label>
                <textarea 
                  value={selectedOrg.address || ''}
                  onChange={(e) => setSelectedOrg({...selectedOrg, address: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  rows={2}
                  placeholder="Street, City, State, ZIP"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Onboard Date</label>
                  <input 
                    type="date" 
                    value={safeDate(selectedOrg.onboardDate).toISOString().split('T')[0]}
                    onChange={(e) => setSelectedOrg({...selectedOrg, onboardDate: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Expiry Date</label>
                  <input 
                    type="date" 
                    value={safeDate(selectedOrg.expiryDate).toISOString().split('T')[0]}
                    onChange={(e) => setSelectedOrg({...selectedOrg, expiryDate: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Company Logo</label>
                <div className="flex items-center gap-4">
                  {(() => {
                    const isCollege = selectedOrg.orgSector === 'Education' || selectedOrg.sector === 'Education'
                      ? (selectedOrg.eduType === 'College' || (!selectedOrg.eduType && (selectedOrg.name?.toLowerCase().includes('college') || selectedOrg.name?.toLowerCase().includes('university'))))
                      : false;
                    const defaultIcon = selectedOrg.sector === 'Education'
                      ? (isCollege ? 'graduation-cap' : 'school')
                      : (selectedOrg.sector === 'Healthcare'
                        ? 'hospital'
                        : (selectedOrg.sector === 'Government'
                          ? 'museum'
                          : 'commercial'));
                    const logoSrc = selectedOrg.logoUrl || selectedOrg.logo || getLocalIcon(defaultIcon);
                    return (
                      <div className="relative group">
                        <img src={logoSrc} alt="Logo" className="w-16 h-16 rounded-xl object-contain border bg-slate-50 p-2" />
                        {(selectedOrg.logoUrl || selectedOrg.logo) && (
                          <button 
                            type="button"
                            onClick={() => setSelectedOrg({...selectedOrg, logoUrl: '', logo: ''})}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex-1">
                    <label className="cursor-pointer bg-slate-900 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors inline-flex items-center gap-2">
                      <Upload className="w-3 h-3" />
                      Replace Logo
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => handleLogoUpload(e, (val) => setSelectedOrg({...selectedOrg, logoUrl: val, logo: val}))}
                      />
                    </label>
                    <p className="text-[8px] text-slate-400 mt-2">Maximum file size: 500KB. PNG/JPG preferred.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-[10px] uppercase tracking-widest text-slate-500"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const finalLogo = selectedOrg.logoUrl || selectedOrg.logo || '';
                      await saveMySQLRecord('update', 'organizations', selectedOrg.id, {
                        name: selectedOrg.name,
                        email: selectedOrg.email,
                        mobile: selectedOrg.mobile,
                        logo: finalLogo,
                        logoUrl: finalLogo,
                        sector: selectedOrg.sector,
                        subscriptionPlan: selectedOrg.subscriptionPlan,
                        status: selectedOrg.status,
                        address: selectedOrg.address || '',
                        onboardDate: safeDate(selectedOrg.onboardDate).toISOString().split('T')[0],
                        expiryDate: safeDate(selectedOrg.expiryDate).toISOString().split('T')[0]
                      });
                      toast.success('Client profile synchronized');
                      setIsEditModalOpen(false);
                    } catch (e) {
                      toast.error('Synchronization failed');
                    }
                  }}
                  className="flex-[2] bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 active:scale-[0.98] transition-all hover:from-blue-700 hover:to-indigo-700"
                >
                  Commit Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && orgToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Delete Client?</h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">{orgToDelete.name}</span>? This action is permanent and will wipe all associated records.
            </p>
            <div className="flex gap-3">
              <button 
                type="button"
                disabled={isDeleting}
                onClick={() => { setIsDeleteModalOpen(false); setOrgToDelete(null); }}
                className="flex-1 py-3.5 border border-slate-200 rounded-2xl font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="flex-[1.5] py-3.5 bg-red-600 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-red-200 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isDeleting ? 'Deleting...' : 'Delete Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateClientModal({ isOpen, onClose, settings, onAdd, formStates, onLogoUpload, isActivating }: any) {
  const {
    newOrgName, setNewOrgName,
    newOrgSector, setNewOrgSector,
    newOrgMobile, setNewOrgMobile,
    newOrgEmail, setNewOrgEmail,
    newOrgLogoUrl, setNewOrgLogoUrl,
    price, setPrice,
    gstPercent, setGstPercent,
    initialPayment, setInitialPayment,
    paymentMode, setPaymentMode,
    transactionId, setTransactionId,
    note, setNote,
    plan, setPlan,
    gstAmount, totalAmount,
    newOnboardDate, setNewOnboardDate,
    newTenureMonths, setNewTenureMonths,
    newOrgAddress, setNewOrgAddress
  } = formStates;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-8 pb-4 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Activate New Client</h2>
          <button onClick={onClose} disabled={isActivating} className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={onAdd} className="p-8 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <fieldset disabled={isActivating} className="contents">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Identity Column */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" />
                Client Identity
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Company Name *</label>
                  <input autoFocus type="text" required value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="e.g. Apollo" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Business Sector *</label>
                  <select value={newOrgSector} onChange={(e) => setNewOrgSector(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none">
                    {settings.sectors.map((s: string) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Subscription Tier *</label>
                  <select value={plan} onChange={(e) => setPlan(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none">
                    <option value="basic">Basic (Up to 5)</option>
                    <option value="pro">Pro (Up to 50)</option>
                    <option value="enterprise">Enterprise (Unlimited)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Support Email *</label>
                  <input type="email" required value={newOrgEmail} onChange={(e) => setNewOrgEmail(e.target.value)} placeholder="Support Email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mobile *</label>
                  <PhoneInput 
                    required 
                    value={newOrgMobile} 
                    onChange={(val) => setNewOrgMobile(val)} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Business Address</label>
                  <textarea value={newOrgAddress} onChange={(e) => setNewOrgAddress(e.target.value)} placeholder="Street, City, PIN" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" rows={2} />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Company Logo</label>
                  <div className="flex items-center gap-4">
                    {newOrgLogoUrl ? (
                      <div className="relative group">
                        <img src={newOrgLogoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-contain border bg-slate-50 p-2" />
                        <button 
                          type="button"
                          onClick={() => setNewOrgLogoUrl('')}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 text-slate-400">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    <label className="flex-1 cursor-pointer">
                      <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors text-slate-600 text-center border-dashed">
                        Upload Device Logo
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => onLogoUpload(e, setNewOrgLogoUrl)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Lifecycle Column */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Onboarding lifecycle
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Onboard Date *</label>
                  <input type="date" value={newOnboardDate} onChange={(e) => setNewOnboardDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Tenure (Months) *</label>
                  <input type="number" value={newTenureMonths} onChange={(e) => setNewTenureMonths(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                </div>
                <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 italic text-[10px] text-purple-700 leading-relaxed">
                  System will automatically calculate the expiry date based on selected onboard date and tenure months.
                </div>
              </div>
            </div>

            {/* Billing Column */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-green-600 uppercase tracking-widest flex items-center gap-2">
                <CreditCard className="w-3 h-3" />
                Financial Structure
              </h3>
              <div className="p-4 bg-slate-50 rounded-2xl space-y-4 border border-slate-100">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Price *</label>
                    <input type="number" required value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full px-3 py-2 text-sm border rounded-xl outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">GST % *</label>
                    <input type="number" required value={gstPercent} onChange={(e) => setGstPercent(Number(e.target.value))} className="w-full px-3 py-2 text-sm border rounded-xl outline-none" />
                  </div>
                </div>
                <div className="flex justify-between p-2 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-[10px] font-black text-blue-800 tracking-tighter">GRAND TOTAL:</span>
                  <span className="text-sm font-black text-blue-900">₹{totalAmount}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Initial Pay</label>
                    <input type="number" value={initialPayment} onChange={(e) => setInitialPayment(Number(e.target.value))} className="w-full px-4 py-2 text-sm border bg-slate-50 rounded-xl outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Mode</label>
                    <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)} className="w-full px-4 py-2.1 text-sm border bg-slate-50 rounded-xl outline-none">
                      <option value="upi">UPI</option>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank</option>
                    </select>
                  </div>
                </div>
                <input type="text" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Internal Ref / TXN ID" className="w-full px-4 py-2.5 text-sm border bg-slate-50 rounded-xl outline-none" />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Billing Remarks (Optional)" className="w-full px-4 py-2 text-sm border bg-slate-50 rounded-xl resize-none outline-none" rows={2} />
              </div>
            </div>
          </div>
          </fieldset>
          <div className="flex gap-4 mt-8 pt-6 border-t">
            <button type="button" onClick={onClose} disabled={isActivating} className="flex-1 py-4 border rounded-2xl font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 disabled:opacity-40">Cancel Onboarding</button>
            <button type="submit" disabled={isActivating} className="flex-[2] py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-blue-100 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {isActivating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Activating Client...
                </>
              ) : (
                'Activate & Synchronize Registry'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentModal({ org, onClose, payments, onCollect }: any) {
  const [amount, setAmount] = useState<number>(0);
  const [mode, setMode] = useState('upi');
  const [txnId, setTxnId] = useState('');
  const [pNote, setPNote] = useState('');

  const totalDue = (org.billing?.totalAmount || 0) - (org.totalPaidAmount || 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col md:flex-row overflow-hidden max-h-[95vh] md:max-h-[90vh] lg:max-h-[85vh]">
        {/* Left: History - Hidden on mobile, visible on desktop */}
        <div className="hidden md:flex flex-[1.2] border-r border-slate-100 bg-slate-50/50 p-6 lg:p-8 flex-col overflow-hidden">
          <div className="flex items-center gap-3 mb-6 lg:mb-8 shrink-0">
            <History className="w-5 h-5 text-slate-400" />
            <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">Payment History</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {payments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 grayscale opacity-50">
                <History className="w-12 h-12 mb-4" />
                <p className="text-[10px] font-bold uppercase tracking-widest">No transaction history</p>
              </div>
            ) : (
              payments.map((p: Payment) => (
                <div key={p.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-base font-black text-slate-900 tracking-tight">₹{p.amount}</span>
                    <span className="text-[8px] font-black bg-blue-50 px-2 py-0.5 rounded text-blue-600 uppercase tracking-widest">{p.paymentMode}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-[9px] text-slate-400 font-mono">
                    <div className="flex justify-between">
                      <span>Ref ID: {p.transactionId && p.transactionId.trim() !== '' ? p.transactionId : 'N/A'}</span>
                      <span>{safeDate(p.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="text-slate-300">Time: {safeDate(p.timestamp).toLocaleTimeString()}</div>
                  </div>
                  {p.note && <p className="text-[9px] text-slate-500 mt-2 bg-slate-50 p-2 rounded-lg leading-relaxed italic">"{p.note}"</p>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Collector */}
        <div className="flex-1 md:w-[420px] lg:w-[450px] p-5 md:p-6 lg:p-8 flex flex-col bg-white overflow-hidden min-h-0">
          <div className="flex justify-between mb-4 md:mb-5 items-start gap-4 shrink-0">
            <div className="min-w-0">
              <h3 className="font-black text-blue-600 uppercase tracking-widest text-[10px] mb-0.5">Collection Hub</h3>
              <div className="flex flex-col">
                <span className="text-sm md:text-base font-bold text-slate-900 truncate leading-tight">{org.name}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter truncate">{org.sector} • {org.mobile}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all shrink-0"><X className="w-5 h-5 text-slate-400" /></button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1 md:pr-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pb-4 min-h-0">
            {/* Box Summary Grid - Unified sizes */}
            <div className="grid grid-cols-3 gap-2 lg:gap-3">
              <div className="bg-blue-50 border border-blue-100 p-2.5 lg:p-3 rounded-2xl text-center flex flex-col justify-center h-16 lg:h-20 shadow-sm">
                <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Total Bill</p>
                <p className="text-xs lg:text-sm font-black text-blue-900 font-mono">₹{org.billing?.totalAmount || 0}</p>
              </div>
              <div className="bg-green-50 border border-green-100 p-2.5 lg:p-3 rounded-2xl text-center flex flex-col justify-center h-16 lg:h-20 shadow-sm">
                <p className="text-[8px] font-black text-green-600 uppercase tracking-widest mb-0.5">Paid Already</p>
                <p className="text-xs lg:text-sm font-black text-green-900 font-mono">₹{org.totalPaidAmount || 0}</p>
              </div>
              <div className="bg-rose-50 border border-rose-100 p-2.5 lg:p-3 rounded-2xl text-center flex flex-col justify-center h-16 lg:h-20 shadow-sm">
                <p className="text-[8px] font-black text-rose-600 uppercase tracking-widest mb-0.5">Due Amount</p>
                <p className="text-xs lg:text-sm font-black text-rose-900 font-mono">₹{totalDue}</p>
              </div>
            </div>

            <div className="bg-slate-950 rounded-2xl p-4 lg:p-6 text-white shadow-xl relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              <p className="text-[8px] lg:text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-0.5 lg:mb-1 relative z-10 font-black">Net Outstanding Balance</p>
              <p className="text-2xl lg:text-4xl font-extrabold tracking-tighter relative z-10 text-white drop-shadow-sm">₹{totalDue}</p>
            </div>

            <div className="space-y-4 lg:space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Receive Amount</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold group-focus-within:text-blue-500 transition-colors">₹</span>
                  <input 
                    type="number" 
                    value={amount === 0 ? '' : amount} 
                    onChange={(e) => setAmount(Number(e.target.value))} 
                    placeholder="0" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-4 py-2.5 lg:py-3 text-lg lg:text-xl font-black outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Payment Mode</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 lg:px-4 py-2.5 lg:py-3 text-[10px] font-black uppercase outline-none h-[42px] lg:h-[46px] cursor-pointer focus:ring-2 focus:ring-blue-500/10">
                    <option value="upi">UPI / Scanner</option>
                    <option value="cash">Hard Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="cheque">Cheque Payment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">TXN Ref ID</label>
                  <input type="text" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="TXN ID" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 lg:px-4 py-2.5 lg:py-3 text-[10px] font-bold uppercase outline-none h-[42px] lg:h-[46px] focus:ring-2 focus:ring-blue-500/10" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Admin Remarks</label>
                <textarea 
                  value={pNote} 
                  onChange={(e) => setPNote(e.target.value)} 
                  placeholder="Audit notes..." 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 lg:py-3 text-[10px] lg:text-xs font-medium resize-none outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" 
                  rows={2} 
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-2 shrink-0">
            <button 
              onClick={() => { onCollect(amount, mode, txnId, pNote); setAmount(0); setTxnId(''); setPNote(''); }}
              disabled={amount <= 0}
              className={cn(
                "w-full py-3.5 lg:py-4.5 rounded-2xl font-black text-[10px] lg:text-xs uppercase tracking-widest shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                amount > 0 
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-200 shadow-xl" 
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              <CircleDollarSign className="w-4 h-4 lg:w-5 lg:h-5" />
              Finalize Collection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, trend, icon: Icon, color }: { label: string, value: string | number, trend?: string, icon: any, color: 'blue' | 'green' | 'purple' | 'rose' | 'indigo' }) {
  const colorMap = {
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    green: 'text-green-600 bg-green-50 border-green-100',
    purple: 'text-purple-600 bg-purple-50 border-purple-100',
    rose: 'text-rose-600 bg-rose-50 border-rose-100',
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100'
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md group">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest min-w-0 flex-1 break-words">{label}</div>
        <div className={cn("p-2 rounded-xl border transition-colors shrink-0", colorMap[color])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <div className="text-2xl font-black text-slate-900 tracking-tighter truncate md:overflow-visible md:whitespace-normal">{value}</div>
        {trend && <span className="text-blue-500 text-[10px] font-bold italic ml-auto shrink-0">{trend} Records</span>}
      </div>
    </div>
  );
}

function CredentialsModal({ credentials, onClose }: { credentials: { email: string; password: string }; onClose: () => void }) {
  const [copiedField, setCopiedField] = useState<'email' | 'password' | 'all' | null>(null);

  const copyToClipboard = (text: string, field: 'email' | 'password' | 'all') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success(`${field === 'all' ? 'All info' : (field === 'email' ? 'Email' : 'Password')} copied!`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-8 pb-4 text-center">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Key className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Login Details</h2>
          <p className="text-slate-500 text-xs font-medium">Temporary credentials generated for this client. Please share them securely.</p>
        </div>
        
        <div className="p-8 pt-0 space-y-4">
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Username</label>
                <button 
                  onClick={() => copyToClipboard(credentials.email, 'email')}
                  className="text-[9px] font-black text-blue-600 hover:text-blue-700 uppercase"
                >
                  {copiedField === 'email' ? 'Copied!' : 'Copy Email'}
                </button>
              </div>
              <div className="text-sm font-black text-slate-700 bg-white border border-slate-200 px-4 py-2.5 rounded-xl transition-all hover:border-indigo-200">{credentials.email}</div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Generated Password</label>
                <button 
                  onClick={() => copyToClipboard(credentials.password, 'password')}
                  className="text-[9px] font-black text-blue-600 hover:text-blue-700 uppercase"
                >
                  {copiedField === 'password' ? 'Copied!' : 'Copy Pass'}
                </button>
              </div>
              <div className="text-sm font-black text-slate-700 bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-mono tracking-wider transition-all hover:border-indigo-200">{credentials.password}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => copyToClipboard(`Email: ${credentials.email}\nPassword: ${credentials.password}`, 'all')}
              className={cn(
                "w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm border",
                copiedField === 'all' ? "bg-green-500 text-white border-green-500" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              {copiedField === 'all' ? "All Credentials Copied" : "Copy All Access Info"}
            </button>
            <button 
              onClick={onClose}
              className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/10 hover:bg-indigo-700 transition-all font-sans"
            >
              Done / Securely Saved
            </button>
          </div>
          <p className="text-center text-[10px] font-bold text-indigo-600 italic">User must change this password after their first successful login.</p>
        </div>
      </div>
    </div>
  );
}
