import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Plus, Car, Calendar, MapPin, ChevronRight, LogOut, Search, Download, Map as MapIcon, Users, ZoomIn, ZoomOut, ChevronLeft, RotateCcw, Edit2, CheckCircle2, XCircle, Loader2, Trash2, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { TripMapModal } from './TripMap';
import { Header } from './Header';
import clsx from 'clsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function TripsList() {
  const { user, logout, isAdmin, profile } = useAuth();
  const [trips, setTrips] = useState<any[]>([]);
  const [managerEmployees, setManagerEmployees] = useState<{id: string, name: string, email: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [sortColumn, setSortColumn] = useState<'date' | 'vehicle' | 'purpose' | 'distance' | 'amount' | 'status'>('date');
  const [mapTrip, setMapTrip] = useState<any | null>(null);
  const [previewImages, setPreviewImages] = useState<{urls: string[], index: number} | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [checkedTrips, setCheckedTrips] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single' | 'bulk', id?: string } | null>(null);

  const toggleTripSelection = (tripId: string) => {
    const newSet = new Set(checkedTrips);
    if (newSet.has(tripId)) {
      newSet.delete(tripId);
    } else {
      newSet.add(tripId);
    }
    setCheckedTrips(newSet);
  };

  const handleBulkStatusUpdate = async (status: 'Approved' | 'Rejected') => {
    if (!user || checkedTrips.size === 0) return;
    setIsBulkProcessing(true);
    
    // Convert Set to Array to process them
    const tripIds = Array.from(checkedTrips) as string[];
    
    try {
      // Process one by one or Promise.all - firestore is usually fine with parallel updates
      await Promise.all(tripIds.map(async (tripId) => {
        const tripRef = doc(db, 'trips', tripId);
        await updateDoc(tripRef, {
          status,
          approvedBy: user.email,
          updatedAt: serverTimestamp()
        });
      }));
      // Clear selection after successful update
      setCheckedTrips(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `trips/bulk`);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      if (deleteConfirm.type === 'single' && deleteConfirm.id) {
        await deleteDoc(doc(db, 'trips', deleteConfirm.id));
        setCheckedTrips(prev => {
          const next = new Set(prev);
          next.delete(deleteConfirm.id!);
          return next;
        });
      } else if (deleteConfirm.type === 'bulk') {
        const tripIds = Array.from(checkedTrips) as string[];
        await Promise.all(tripIds.map(id => deleteDoc(doc(db, 'trips', id))));
        setCheckedTrips(new Set());
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `trips/${deleteConfirm.type}`);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleStatusUpdate = async (tripId: string, status: 'Approved' | 'Rejected') => {
    if (!user) return;
    setProcessingId(tripId);
    try {
      const tripRef = doc(db, 'trips', tripId);
      await updateDoc(tripRef, {
        status,
        approvedBy: user.email,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `trips/${tripId}`);
    } finally {
      setProcessingId(null);
    }
  };

  useEffect(() => {
    if (!user || !profile) return;
    
    let unsubs: (() => void)[] = [];

    const fetchTrips = () => {
      let q;
      if (isAdmin) {
        q = query(
          collection(db, 'trips'),
          orderBy('createdAt', 'desc')
        );
      } else if (profile.role === 'manager') {
        const empQuery = query(collection(db, 'users'), where('managerId', '==', user.uid));
        const unsubscribeEmps = onSnapshot(empQuery, (empSnap) => {
          const empIds = empSnap.docs.map(d => d.id);
          setManagerEmployees(empIds);
          
          if (empIds.length > 0) {
            // Firestore 'in' query has a max of 10 items.
            // If more than 10 employees, you'd need client-side filtering or multiple queries.
            // Assuming < 10 for this demo.
            const chunks = [];
            for (let i = 0; i < Math.min(empIds.length, 30); i += 10) {
              chunks.push(empIds.slice(i, i + 10));
            }
            
            // Clean up old trip listeners
            while (unsubs.length > 1) {
              const u = unsubs.pop();
              if (u) u();
            }

            Promise.all(chunks.map(chunk => {
              return new Promise<any[]>((resolve) => {
                 const tripQuery = query(
                   collection(db, 'trips'),
                   where('userId', 'in', chunk),
                   orderBy('createdAt', 'desc')
                 );
                 const unsubTrip = onSnapshot(tripQuery, (snapshot) => {
                   const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                   resolve(tripsData); // Hacky for initial load, to just update state
                 }, (error) => {
                   handleFirestoreError(error, OperationType.LIST, 'trips');
                 });
                 unsubs.push(unsubTrip);
              });
            })).then(results => {
              // Note: the hacky promise setup is just to get initial data cleanly if we chunk.
              // We'll actually want to just set up a single onSnapshot if < 10. Let's simplify.
            });
          } else {
            setTrips([]);
          }
        });
        unsubs.push(unsubscribeEmps);
        return; // we will handle fetching in the manager block differently to avoid complexity here
      } else {
        q = query(
          collection(db, 'trips'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
      }

      if (q) {
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setTrips(tripsData);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'trips');
        });
        unsubs.push(unsubscribe);
      }
    };
    
    // We handle the Manager case properly in a different way down below
    if (profile.role === 'manager') {
       const empQuery = query(collection(db, 'users'), where('managerId', '==', user.uid));
       const unsubscribeEmps = onSnapshot(empQuery, (empSnap) => {
         const emps = empSnap.docs.map(d => ({
           id: d.id,
           name: d.data().displayName || d.data().email || 'Unknown',
           email: d.data().email || 'Unknown'
         }));
         setManagerEmployees(emps);
         const empIds = emps.map(e => e.id);
         
         if (empIds.length > 0) {
           const chunks = [];
           for (let i = 0; i < Math.min(empIds.length, 30); i += 10) {
             chunks.push(empIds.slice(i, i + 10));
           }

           // Cleanup previous trip unsubs if they exist
           while(unsubs.length > 1) {
              const u = unsubs.pop();
              if (u) u();
           }

           // We will maintain a map of chunks to trips to aggregate them
           const tripsMap = new Map<number, any[]>();
           
           chunks.forEach((chunk, chunkIndex) => {
             const tripQuery = query(
               collection(db, 'trips'),
               where('userId', 'in', chunk),
               orderBy('createdAt', 'desc')
             );
             const unsubTrip = onSnapshot(tripQuery, (snapshot) => {
               const chunkTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
               tripsMap.set(chunkIndex, chunkTrips);
               
               // Aggregate all chunks
               let allTrips: any[] = [];
               tripsMap.forEach(chunkList => {
                 allTrips = [...allTrips, ...chunkList];
               });
               allTrips.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
               setTrips(allTrips);
             }, (error) => {
               handleFirestoreError(error, OperationType.LIST, 'trips');
             });
             unsubs.push(unsubTrip);
           });
         } else {
           setTrips([]);
         }
       }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'users');
       });
       unsubs.push(unsubscribeEmps);
    } else {
       fetchTrips();
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [user, profile, isAdmin]);

  const uniqueUsers = Array.from(new Set(trips.map(t => t.userEmail || t.userDisplayName || 'Unknown'))).filter(Boolean).sort() as string[];

  const filteredTrips = trips.filter(trip => {
    // Search query filter
    const lowerQuery = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || (
      trip.vehicleNumber?.toLowerCase().includes(lowerQuery) ||
      trip.travellingFrom?.toLowerCase().includes(lowerQuery) ||
      trip.travellingTo?.toLowerCase().includes(lowerQuery)
    );

    // Status filter
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter || (!trip.status && statusFilter === 'Pending');

    // User filter
    let matchesUser = true;
    if (userFilter !== 'all') {
      if (profile?.role === 'manager') {
        matchesUser = trip.userId === userFilter;
      } else {
        const tripUser = trip.userEmail || trip.userDisplayName || 'Unknown';
        matchesUser = tripUser === userFilter;
      }
    }

    // Date range filter
    let tripDateStr = trip.date;
    if (!tripDateStr && trip.createdAt) {
      try {
        tripDateStr = format(trip.createdAt.toDate(), 'yyyy-MM-dd');
      } catch (e) {
        tripDateStr = '';
      }
    }
    
    const matchesDate = (!startDate || tripDateStr >= startDate) &&
                        (!endDate || tripDateStr <= endDate);

    return matchesSearch && matchesStatus && matchesDate && matchesUser;
  }).sort((a, b) => {
    let aVal: any = '';
    let bVal: any = '';

    switch (sortColumn) {
      case 'date':
        aVal = a.date ? new Date(a.date).getTime() : (a.createdAt?.toMillis() || 0);
        bVal = b.date ? new Date(b.date).getTime() : (b.createdAt?.toMillis() || 0);
        break;
      case 'vehicle':
        aVal = (a.vehicleNumber || '').toString().toLowerCase();
        bVal = (b.vehicleNumber || '').toString().toLowerCase();
        break;
      case 'purpose':
        aVal = (a.purposeOfTravel || '').toString().toLowerCase();
        bVal = (b.purposeOfTravel || '').toString().toLowerCase();
        break;
      case 'distance':
        aVal = Number(a.distanceTravelled) || 0;
        bVal = Number(b.distanceTravelled) || 0;
        break;
      case 'amount':
        aVal = Number(a.amount) || 0;
        bVal = Number(b.amount) || 0;
        break;
      case 'status':
        aVal = (a.status || 'Pending').toString().toLowerCase();
        bVal = (b.status || 'Pending').toString().toLowerCase();
        break;
      default:
        aVal = a.createdAt?.toMillis() || 0;
        bVal = b.createdAt?.toMillis() || 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const exportToCSV = () => {
    if (filteredTrips.length === 0) return;

    const headers = ['Date', 'Vehicle Number', 'From', 'To', 'Start Odometer', 'End Odometer', 'Distance (km)', 'Rate (Rs/km)', 'Amount (Rs)', 'Status', 'Purpose', 'Approved By', 'Remarks'];
    
    const rows = filteredTrips.map(trip => {
      let tripDateStr = '';
      try {
        tripDateStr = format(new Date(trip.date || trip.createdAt?.toDate()), 'yyyy-MM-dd');
      } catch (err) {
        tripDateStr = '';
      }
      
      return [
        tripDateStr,
        trip.vehicleNumber || '',
        trip.travellingFrom || '',
        trip.travellingTo || '',
        trip.startingOdometer || 0,
        trip.endingOdometer || 0,
        trip.distanceTravelled || 0,
        trip.perKmRate || 0,
        trip.amount || 0,
        trip.status || 'Pending',
        trip.purposeOfTravel || '',
        trip.approvedBy || '',
        trip.remarks || ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `trips_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generatePDF = () => {
    if (filteredTrips.length === 0) return;

    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Travel Logs Report', 14, 22);

    // Summary
    const totalTrips = filteredTrips.length;
    const totalAmount = filteredTrips.reduce((sum, trip) => sum + (Number(trip.amount) || 0), 0);
    const approvedCount = filteredTrips.filter(t => t.status === 'Approved').length;
    const rejectedCount = filteredTrips.filter(t => t.status === 'Rejected').length;
    const pendingCount = filteredTrips.filter(t => !t.status || t.status === 'Pending').length;

    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Total Trips: ${totalTrips}`, 14, 32);
    doc.text(`Total Amount: Rs ${totalAmount.toFixed(2)}`, 14, 38);
    doc.text(`Status: ${approvedCount} Approved, ${rejectedCount} Rejected, ${pendingCount} Pending`, 14, 44);

    // Table
    const headers = [['Date', 'User', 'From', 'To', 'Distance', 'Amount', 'Status']];
    const data = filteredTrips.map(trip => {
      let tripDateStr = '';
      try {
        tripDateStr = format(new Date(trip.date || trip.createdAt?.toDate()), 'yyyy-MM-dd');
      } catch (err) {
        tripDateStr = '';
      }
      return [
        tripDateStr,
        trip.userEmail?.split('@')[0] || trip.userDisplayName || 'User',
        trip.travellingFrom || '-',
        trip.travellingTo || '-',
        `${trip.distanceTravelled || 0} km`,
        `Rs ${Number(trip.amount || 0).toFixed(2)}`,
        trip.status || 'Pending'
      ];
    });

    autoTable(doc, {
      startY: 52,
      head: headers,
      body: data,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }, // blue-500
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 25 },
        5: { cellWidth: 30 },
        6: { cellWidth: 25 }
      },
      styles: { fontSize: 9, cellPadding: 3 }
    });

    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    doc.save(`trips_report_${timestamp}.pdf`);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
        <Header />

      <main className="flex-1 p-4 sm:p-8 max-w-6xl mx-auto w-full flex flex-col gap-6 overflow-y-auto">
          {(isAdmin || profile?.role === 'manager') && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 border-b border-slate-200/50 pb-4 mb-2">
              {isAdmin && (
                <Link to="/admin" className="px-3 sm:px-4 py-2 bg-white/50 backdrop-blur-sm text-slate-800 hover:bg-white/70 border border-white/60 rounded-lg font-bold text-sm shadow-sm transition-colors text-center flex-1 sm:flex-none">
                  Users
                </Link>
              )}
              <Link to="/" className="px-3 sm:px-4 py-2 bg-slate-900/80 backdrop-blur-md text-white rounded-lg font-bold text-sm shadow-sm border border-slate-700/50 text-center flex-1 sm:flex-none">
                Trips Data
              </Link>
              <Link to="/admin/dashboard" className="px-3 sm:px-4 py-2 bg-white/50 backdrop-blur-sm text-slate-800 hover:bg-white/70 border border-white/60 rounded-lg font-bold text-sm shadow-sm transition-colors text-center flex-1 sm:flex-none">
                Dashboard
              </Link>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-slate-900 font-bold flex items-center gap-2 text-lg">
                {isAdmin ? "All User Travel Logs (Admin)" : (profile?.role === 'manager' ? "Employee Travel Logs (Manager)" : "Your Travel Logs")}
                {checkedTrips.size > 0 && (
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full ml-2 border border-slate-200 shadow-sm">
                    {checkedTrips.size} selected
                  </span>
                )}
              </h3>
              {trips.length > 0 && (
                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  {(isAdmin || profile?.role === 'manager') && checkedTrips.size > 0 && (
                    <div className="flex items-center gap-1.5 mr-2">
                      <button
                        onClick={() => handleBulkStatusUpdate('Approved')}
                        disabled={isBulkProcessing}
                        className="px-2.5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-1.5"
                      >
                         {isBulkProcessing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                         Approve
                      </button>
                      <button
                        onClick={() => handleBulkStatusUpdate('Rejected')}
                        disabled={isBulkProcessing}
                        className="px-2.5 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-1.5"
                      >
                         {isBulkProcessing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                         Reject
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ type: 'bulk' })}
                        disabled={isBulkProcessing}
                        className="px-2.5 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-sm font-bold shadow-sm hover:bg-rose-100 disabled:opacity-50 transition flex items-center gap-1.5 ml-2"
                        title="Delete Selected Trips"
                      >
                         <Trash2 size={14} />
                         Delete
                      </button>
                    </div>
                  )}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white/50 backdrop-blur-sm border border-white/60 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-800 focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-shadow"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={clsx(
                      "flex items-center gap-2 border px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors",
                      showFilters ? "bg-blue-50/80 border-blue-200 text-blue-600" : "bg-white/50 backdrop-blur-sm border-white/60 text-slate-800 hover:bg-white/70"
                    )}
                  >
                    <MapPin size={16} className={showFilters ? "text-blue-600" : "text-slate-400"} />
                    <span className="hidden sm:inline">Filters</span>
                  </button>
                  <button
                    onClick={exportToCSV}
                    disabled={filteredTrips.length === 0}
                    className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                    title="Export to CSV"
                  >
                    <Download size={16} />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    onClick={generatePDF}
                    disabled={filteredTrips.length === 0}
                    className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                    title="Export to PDF"
                  >
                    <FileText size={16} />
                    <span className="hidden sm:inline">PDF</span>
                  </button>
                </div>
              )}
            </div>

            {showFilters && (
              <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-xl p-4 shadow-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white/50 border border-white/60 rounded-lg py-1.5 px-3 text-sm text-slate-800 focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white/50 border border-white/60 rounded-lg py-1.5 px-3 text-sm text-slate-800 focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">User</label>
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="w-full bg-white/50 border border-white/60 rounded-lg py-1.5 px-3 text-sm text-slate-800 focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-500/50 transition-colors"
                  >
                    <option value="all">All {profile?.role === 'manager' ? 'Employees' : 'Users'}</option>
                    {profile?.role === 'manager' 
                      ? managerEmployees.map(e => (
                          <option key={e.id} value={e.id}>{e.name} {e.name !== e.email ? `(${e.email})` : ''}</option>
                        ))
                      : uniqueUsers.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))
                    }
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-white/50 border border-white/60 rounded-lg py-1.5 px-3 text-sm text-slate-800 focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-500/50 transition-colors"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setStatusFilter('all');
                      setUserFilter('all');
                      setSearchQuery('');
                    }}
                    className="text-[10px] font-bold text-blue-600 uppercase hover:underline"
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        
        {trips.length === 0 ? (
          <div className="text-center py-20 bg-white/40 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl">
            <div className="bg-white/50 inline-flex p-4 rounded-full mb-4 border border-white/80 shadow-inner">
              <Car size={32} className="text-slate-500" />
            </div>
            <p className="text-slate-600 font-medium font-sans">No trips recorded yet.</p>
            <p className="text-xs text-slate-500 mt-1">Tap the + button to add one.</p>
          </div>
        ) : (
          <div className="bg-white/40 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/40 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 hidden sm:block">Recent Submissions</h4>
            </div>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                <thead className="bg-white/30 text-[11px] uppercase text-slate-700 font-bold border-b border-white/40">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">
                      <input 
                        type="checkbox" 
                        onChange={(e) => {
                          if (e.target.checked) setCheckedTrips(new Set(filteredTrips.map(t => t.id)));
                          else setCheckedTrips(new Set());
                        }}
                        checked={filteredTrips.length > 0 && checkedTrips.size === filteredTrips.length}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-white/50 group transition-colors select-none"
                      onClick={() => {
                        if (sortColumn === 'date') setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                        else setSortColumn('date');
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Date
                        {sortColumn === 'date' && (sortOrder === 'desc' ? <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" /> : <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600" />)}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-white/50 group transition-colors select-none"
                      onClick={() => {
                        if (sortColumn === 'vehicle') setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                        else setSortColumn('vehicle');
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Vehicle
                        {sortColumn === 'vehicle' && (sortOrder === 'desc' ? <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" /> : <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600" />)}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-white/50 group transition-colors select-none"
                      onClick={() => {
                        if (sortColumn === 'purpose') setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                        else setSortColumn('purpose');
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Purpose
                        {sortColumn === 'purpose' && (sortOrder === 'desc' ? <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" /> : <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600" />)}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-white/50 group transition-colors select-none"
                      onClick={() => {
                        if (sortColumn === 'distance') setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                        else setSortColumn('distance');
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Route & Distance
                        {sortColumn === 'distance' && (sortOrder === 'desc' ? <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" /> : <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600" />)}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-white/50 group transition-colors select-none"
                      onClick={() => {
                        if (sortColumn === 'amount') setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                        else setSortColumn('amount');
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Amount
                        {sortColumn === 'amount' && (sortOrder === 'desc' ? <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" /> : <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600" />)}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 cursor-pointer hover:bg-white/50 group transition-colors select-none"
                      onClick={() => {
                        if (sortColumn === 'status') setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                        else setSortColumn('status');
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Status
                        {sortColumn === 'status' && (sortOrder === 'desc' ? <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" /> : <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600" />)}
                      </div>
                    </th>
                    <th className="px-6 py-3">Images</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-800 divide-y divide-white/20">
                  {filteredTrips.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-slate-600 font-medium font-sans">
                        No trips found matching "{searchQuery}"
                      </td>
                    </tr>
                  ) : (
                    filteredTrips.map(trip => (
                    <tr key={trip.id} className={clsx("hover:bg-white/40 transition-colors", checkedTrips.has(trip.id) && "bg-blue-50/50 backdrop-blur-md")}>
                      <td className="px-4 py-4 text-center">
                        <input 
                          type="checkbox"
                          checked={checkedTrips.has(trip.id)}
                          onChange={() => toggleTripSelection(trip.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className={clsx("px-6 py-4 border-l-2 transition-colors", checkedTrips.has(trip.id) ? "border-blue-500" : "border-transparent hover:border-blue-500")}>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{format(new Date(trip.date || trip.createdAt?.toDate()), 'MMM dd, yyyy')}</span>
                            {isAdmin && trip.userEmail && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold uppercase">
                                {trip.userEmail.split('@')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        <span className="bg-white/50 px-2 py-1 rounded text-xs font-mono border border-white/60 shadow-sm">{trip.vehicleNumber}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700">{trip.purposeOfTravel || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                         <div className="flex flex-col text-xs space-y-1">
                           <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full border border-blue-500 bg-white"></div>
                             <span className="font-medium text-slate-700 truncate w-[100px]">{trip.travellingFrom}</span>
                             <span className="text-[10px] text-slate-400 font-mono">Odo {trip.startingOdometer}</span>
                           </div>
                           <div className="pl-[3px]">
                             <div className="w-[1px] h-2 bg-slate-200"></div>
                           </div>
                           <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full border-red-500 bg-red-500"></div>
                             <span className="font-medium text-slate-700 truncate w-[100px]">{trip.travellingTo}</span>
                             <span className="text-[10px] text-slate-400 font-mono">Odo {trip.endingOdometer}</span>
                           </div>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 tracking-tight">₹{trip.amount?.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-500">{trip.distanceTravelled}km @ ₹{trip.perKmRate}/km</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <span className={clsx(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border text-center w-fit",
                            trip.status === 'Approved' && "bg-emerald-50 text-emerald-600 border-emerald-100",
                            trip.status === 'Rejected' && "bg-rose-50 text-rose-600 border-rose-100",
                            (!trip.status || trip.status === 'Pending') && "bg-amber-50 text-amber-600 border-amber-100"
                          )}>
                            {trip.status || 'Pending'}
                          </span>
                          {(isAdmin || profile?.role === 'manager') && (!trip.status || trip.status === 'Pending') && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <button
                                onClick={() => handleStatusUpdate(trip.id, 'Approved')}
                                disabled={!!processingId}
                                className="p-1 px-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-1 text-[9px] font-bold uppercase"
                              >
                                {processingId === trip.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                                Appr
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(trip.id, 'Rejected')}
                                disabled={!!processingId}
                                className="p-1 px-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-1 text-[9px] font-bold uppercase"
                              >
                                {processingId === trip.id ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
                                Rej
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          {trip.startOdometerImageUri ? (
                            <div 
                              className="group relative w-10 h-10 rounded border border-slate-200 overflow-hidden cursor-pointer" 
                              onClick={() => {
                                const urls = [trip.startOdometerImageUri];
                                if (trip.endOdometerImageUri) urls.push(trip.endOdometerImageUri);
                                setPreviewImages({ urls, index: 0 });
                                setZoomScale(1);
                              }}
                            >
                              <img src={trip.startOdometerImageUri} alt="Start Odo" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-white text-[8px] font-bold">START</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 text-[8px] font-bold">NO START</div>
                          )}
                          {trip.endOdometerImageUri ? (
                            <div 
                              className="group relative w-10 h-10 rounded border border-slate-200 overflow-hidden cursor-pointer" 
                              onClick={() => {
                                const urls = [];
                                if (trip.startOdometerImageUri) urls.push(trip.startOdometerImageUri);
                                urls.push(trip.endOdometerImageUri);
                                setPreviewImages({ urls, index: urls.length - 1 });
                                setZoomScale(1);
                              }}
                            >
                              <img src={trip.endOdometerImageUri} alt="End Odo" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-white text-[8px] font-bold">END</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 text-[8px] font-bold">NO END</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={checkedTrips.has(trip.id) ? `/edit/${trip.id}` : '#'}
                            className={clsx(
                              "w-8 h-8 rounded-full flex items-center justify-center transition shadow-sm border",
                              checkedTrips.has(trip.id) 
                                ? "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800 border-slate-200" 
                                : "bg-slate-50 opacity-50 cursor-not-allowed text-slate-400 border-slate-200"
                            )}
                            title="Edit Trip"
                            onClick={(e) => {
                              if (!checkedTrips.has(trip.id)) e.preventDefault();
                            }}
                          >
                            <Edit2 size={14} />
                          </Link>
                          {isAdmin && (
                            <button
                              className={clsx(
                                "w-8 h-8 rounded-full flex items-center justify-center transition shadow-sm border",
                                checkedTrips.has(trip.id)
                                  ? "bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 border-rose-100"
                                  : "bg-rose-50 opacity-50 cursor-not-allowed text-rose-400 border-rose-100"
                              )}
                              onClick={() => {
                                if (checkedTrips.has(trip.id)) setDeleteConfirm({ type: 'single', id: trip.id });
                              }}
                              title="Delete Trip"
                              disabled={!checkedTrips.has(trip.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-white/30 border-t border-white/40 text-slate-600 text-[11px] italic font-medium">
              Auto-sync active to Cloud Firestore
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-6 right-6">
        <Link 
          to="/new" 
          className="bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg shadow-blue-300 flex items-center justify-center hover:bg-blue-700 transition-transform active:scale-95 border-2 border-white/20"
        >
          <Plus size={28} />
        </Link>
      </div>

      <TripMapModal 
        isOpen={!!mapTrip} 
        onClose={() => setMapTrip(null)} 
        from={mapTrip?.travellingFrom || ''} 
        to={mapTrip?.travellingTo || ''} 
      />

      {previewImages && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md transition-opacity animate-in fade-in duration-300" 
          onClick={() => setPreviewImages(null)}
        >
          <div className="relative w-full h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            {/* Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-lg px-4 py-2 rounded-full border border-white/10 z-10 transition-all hover:bg-black/70">
              <button 
                onClick={() => setZoomScale(s => Math.max(0.5, s - 0.25))}
                className="p-2 text-white/80 hover:text-white transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={18} />
              </button>
              <div className="h-4 w-px bg-white/20 mx-1"></div>
              <button 
                onClick={() => setZoomScale(1)}
                className="p-2 text-white/80 hover:text-white transition-colors flex items-center gap-1.5"
                title="Reset Zoom"
              >
                <RotateCcw size={16} />
                <span className="text-xs font-bold tabular-nums min-w-[3ch]">{Math.round(zoomScale * 100)}%</span>
              </button>
              <div className="h-4 w-px bg-white/20 mx-1"></div>
              <button 
                onClick={() => setZoomScale(s => Math.min(3, s + 0.25))}
                className="p-2 text-white/80 hover:text-white transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={18} />
              </button>
            </div>

            {/* Navigation Controls */}
            {previewImages.urls.length > 1 && (
              <>
                <button 
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition backdrop-blur-md z-10 border border-white/10"
                  onClick={() => {
                    setPreviewImages(prev => prev ? { ...prev, index: (prev.index - 1 + prev.urls.length) % prev.urls.length } : null);
                    setZoomScale(1);
                  }}
                >
                  <ChevronLeft size={24} />
                </button>
                <button 
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition backdrop-blur-md z-10 border border-white/10"
                  onClick={() => {
                    setPreviewImages(prev => prev ? { ...prev, index: (prev.index + 1) % prev.urls.length } : null);
                    setZoomScale(1);
                  }}
                >
                  <ChevronRight size={24} />
                </button>

                {/* Page Indicator */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {previewImages.urls.map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${i === previewImages.index ? 'w-6 bg-blue-500' : 'w-1.5 bg-white/30'}`}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Close Button */}
            <button 
              className="absolute top-4 right-4 w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition backdrop-blur-md scale-100 hover:scale-110 active:scale-95 border border-white/10 z-10"
              onClick={() => setPreviewImages(null)}
            >
              <Plus size={24} className="rotate-45" />
            </button>
            
            {/* Image Container with Custom Zoom */}
            <div className="w-full h-full flex items-center justify-center overflow-hidden p-8">
              <img 
                src={previewImages.urls[previewImages.index]} 
                alt="Odometer Preview" 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-200 ease-out" 
                style={{ transform: `scale(${zoomScale})` }}
              />
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl border border-rose-100 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <Trash2 size={24} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Delete {deleteConfirm.type === 'bulk' ? 'Selected Trips' : 'Trip'}?</h3>
              <p className="text-slate-500 text-sm">
                Are you sure you want to delete {deleteConfirm.type === 'bulk' ? `the ${checkedTrips.size} selected` : 'this'} trip record{deleteConfirm.type === 'bulk' ? 's' : ''}? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                onClick={executeDelete}
                className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 transition shadow-sm border border-transparent flex items-center justify-center gap-2"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
