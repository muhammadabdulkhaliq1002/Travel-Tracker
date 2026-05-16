import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Link, Navigate } from 'react-router-dom';
import { 
  ArrowLeft, LayoutDashboard, Users as UsersIcon, IndianRupee, CheckCircle2, Clock, XCircle, MapPin, Download
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Header } from './Header';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function AdminDashboard() {
  const { user, isAdmin, profile } = useAuth();
  const [usersCount, setUsersCount] = useState(0);
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [tripsData, setTripsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isManager = profile?.role === 'manager';

  useEffect(() => {
    if (!user || (!isAdmin && !isManager)) return;

    let unsubs: (() => void)[] = [];

    if (isAdmin) {
      // Fetch users
      const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
        setUsersCount(snapshot.docs.length);
        setActiveUsersCount(snapshot.docs.filter(doc => doc.data().isActive).length);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });
      unsubs.push(usersUnsubscribe);
      
      // Fetch trips
      const tripsUnsubscribe = onSnapshot(collection(db, 'trips'), (snapshot) => {
        const trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTripsData(trips);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'trips');
      });
      unsubs.push(tripsUnsubscribe);
    } else if (isManager) {
      // Manager logic
      const empQuery = query(collection(db, 'users'), where('managerId', '==', user.uid));
      const unsubscribeEmps = onSnapshot(empQuery, (empSnap) => {
        const empIds = empSnap.docs.map(d => d.id);
        const activeEmps = empSnap.docs.filter(d => d.data().isActive).length;
        setUsersCount(empIds.length);
        setActiveUsersCount(activeEmps);

        if (empIds.length > 0) {
           const chunks = [];
           for (let i = 0; i < Math.min(empIds.length, 30); i += 10) {
             chunks.push(empIds.slice(i, i + 10));
           }

           // Cleanup previous trip unsubs if they exist (skipping the first one which is users)
           while(unsubs.length > 1) {
              const u = unsubs.pop();
              if (u) u();
           }

           const tripsMap = new Map<number, any[]>();
           chunks.forEach((chunk, chunkIndex) => {
             const tripQuery = query(
               collection(db, 'trips'),
               where('userId', 'in', chunk)
             );
             const unsubTrip = onSnapshot(tripQuery, (snapshot) => {
               const chunkTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
               tripsMap.set(chunkIndex, chunkTrips);
               
               let allTrips: any[] = [];
               tripsMap.forEach(chunkList => {
                 allTrips = [...allTrips, ...chunkList];
               });
               setTripsData(allTrips);
               setLoading(false);
             }, (error) => {
               handleFirestoreError(error, OperationType.LIST, 'trips');
             });
             unsubs.push(unsubTrip);
           });
        } else {
          setTripsData([]);
          setLoading(false);
        }
      });
      unsubs.push(unsubscribeEmps);
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [user, isAdmin, isManager]);

  if (!isAdmin && !isManager) {
    return <Navigate to="/" replace />;
  }

  // Calculate metrics
  const totalTrips = tripsData.length;
  const totalAmount = tripsData.reduce((sum, trip) => sum + (Number(trip.amount) || 0), 0);
  
  const pendingTrips = tripsData.filter(t => !t.status || t.status === 'Pending').length;
  const approvedTrips = tripsData.filter(t => t.status === 'Approved').length;
  const rejectedTrips = tripsData.filter(t => t.status === 'Rejected').length;

  const statusData = [
    { name: 'Pending', value: pendingTrips, color: '#f59e0b' },
    { name: 'Approved', value: approvedTrips, color: '#10b981' },
    { name: 'Rejected', value: rejectedTrips, color: '#f43f5e' },
  ];

  // Calculate trips by user (top 5)
  const tripsByUser = tripsData.reduce((acc: any, trip) => {
    const email = trip.userEmail || trip.userDisplayName || 'Unknown';
    if (!acc[email]) {
      acc[email] = { name: email, trips: 0, amount: 0 };
    }
    acc[email].trips += 1;
    acc[email].amount += (Number(trip.amount) || 0);
    return acc;
  }, {});

  const barChartData = Object.values(tripsByUser)
    .sort((a: any, b: any) => b.trips - a.trips)
    .slice(0, 5) as any[];

  const generatePDF = () => {
    const doc = new jsPDF();
    const currentDate = format(new Date(), 'MMM dd, yyyy');
    
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Trip Report', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generated on: ${currentDate}`, 14, 30);
    
    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Summary', 14, 45);
    
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text(`Total Trips: ${totalTrips}`, 14, 55);
    doc.text(`Total Value: Rs ${totalAmount.toFixed(2)}`, 14, 62);
    doc.text(`Pending: ${pendingTrips} | Approved: ${approvedTrips} | Rejected: ${rejectedTrips}`, 14, 69);
    
    // Trips Table
    const tableColumn = ["Date", "User", "From", "To", "Distance", "Status", "Amount"];
    const tableRows = tripsData.map(trip => {
      let dateStr = 'Unknown';
      if (trip.date) {
        if (typeof trip.date === 'string') {
          dateStr = format(new Date(trip.date), 'MMM dd, yyyy');
        } else if (trip.date && typeof trip.date.toDate === 'function') {
          dateStr = format(trip.date.toDate(), 'MMM dd, yyyy');
        }
      }
      return [
        dateStr,
        trip.userEmail || trip.userDisplayName || 'Unknown',
        trip.startPoint || '-',
        trip.endPoint || '-',
        `${trip.distance || 0} km`,
        trip.status || 'Pending',
        `Rs ${Number(trip.amount || 0).toFixed(2)}`
      ];
    });
    
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 80,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246] }, // blue-500
      alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
    });
    
    doc.save(`trips-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans relative">
      <Header />

      <main className="flex-1 p-4 sm:p-8 max-w-6xl mx-auto w-full flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {isAdmin && (
              <Link to="/admin" className="px-3 sm:px-4 py-2 bg-white/50 backdrop-blur-sm text-slate-800 hover:bg-white/70 border border-white/60 rounded-lg font-bold text-sm shadow-sm transition-colors text-center flex-1 sm:flex-none">
                Users
              </Link>
            )}
            <Link to="/" className="px-3 sm:px-4 py-2 bg-white/50 backdrop-blur-sm text-slate-800 hover:bg-white/70 border border-white/60 rounded-lg font-bold text-sm shadow-sm transition-colors text-center flex-1 sm:flex-none">
              Trips Data
            </Link>
            <div className="px-3 sm:px-4 py-2 bg-slate-900/80 backdrop-blur-md text-white rounded-lg font-bold text-sm shadow-sm border border-slate-700/50 text-center flex-1 sm:flex-none">
              Dashboard
            </div>
          </div>
          <button 
            onClick={generatePDF}
            className="px-4 py-2 bg-blue-600/90 backdrop-blur-md text-white rounded-lg font-bold text-sm shadow-sm hover:bg-blue-700 transition flex items-center gap-2 w-max"
          >
            <Download size={16} /> Export PDF
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse flex items-center gap-2 text-slate-500 font-medium">
              Loading metrics...
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/40 backdrop-blur-xl p-6 rounded-xl border border-white/60 shadow-xl flex items-center gap-4">
                <div className="w-12 h-12 bg-white/50 border border-white/60 text-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                  <UsersIcon size={24} />
                </div>
                <div>
                  <div className="text-slate-600 text-sm font-semibold uppercase tracking-wider mb-1">Users</div>
                  <div className="text-2xl font-bold text-slate-800 tracking-tight">{usersCount}</div>
                  <div className="text-xs text-slate-600 mt-1"><span className="text-emerald-600 font-bold">{activeUsersCount}</span> active</div>
                </div>
              </div>
              
              <div className="bg-white/40 backdrop-blur-xl p-6 rounded-xl border border-white/60 shadow-xl flex items-center gap-4">
                <div className="w-12 h-12 bg-white/50 border border-white/60 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                  <MapPin size={24} />
                </div>
                <div>
                  <div className="text-slate-600 text-sm font-semibold uppercase tracking-wider mb-1">Total Trips</div>
                  <div className="text-2xl font-bold text-slate-800 tracking-tight">{totalTrips}</div>
                  <div className="text-xs text-slate-600 mt-1">Logged by all users</div>
                </div>
              </div>

              <div className="bg-white/40 backdrop-blur-xl p-6 rounded-xl border border-white/60 shadow-xl flex items-center gap-4">
                <div className="w-12 h-12 bg-white/50 border border-white/60 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                  <IndianRupee size={24} />
                </div>
                <div>
                  <div className="text-slate-600 text-sm font-semibold uppercase tracking-wider mb-1">Total Value</div>
                  <div className="text-2xl font-bold text-slate-800 tracking-tight">₹{totalAmount.toFixed(2)}</div>
                  <div className="text-xs text-slate-600 mt-1">Overall amount</div>
                </div>
              </div>

              <div className="bg-white/40 backdrop-blur-xl p-6 rounded-xl border border-white/60 shadow-xl flex flex-col gap-2 justify-center">
                <div className="flex items-center justify-between text-amber-600">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Clock size={16} /> Pending
                  </div>
                  <div className="font-bold">{pendingTrips}</div>
                </div>
                <div className="flex items-center justify-between text-emerald-600">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 size={16} /> Approved
                  </div>
                  <div className="font-bold">{approvedTrips}</div>
                </div>
                <div className="flex items-center justify-between text-rose-600">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <XCircle size={16} /> Rejected
                  </div>
                  <div className="font-bold">{rejectedTrips}</div>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-white/40 backdrop-blur-xl p-6 rounded-xl border border-white/60 shadow-xl">
                <h3 className="font-bold text-slate-800 mb-6 shrink-0 text-lg tracking-tight">Trip Status Breakdown</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white/40 backdrop-blur-xl p-6 rounded-xl border border-white/60 shadow-xl">
                <h3 className="font-bold text-slate-800 mb-6 shrink-0 text-lg tracking-tight">Top 5 Users by Trips</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                      <XAxis type="number" textAnchor="end" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={100} 
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        tickFormatter={(val) => {
                          if (val.length > 12) return val.substring(0, 10) + '...';
                          return val;
                        }}
                      />
                      <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="trips" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} name="Total Trips" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
