import { Link, useNavigate } from 'react-router-dom';
import { Users, LogOut, Bell } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export function Header() {
  const { user, logout, isAdmin, profile } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    
    // Only managers or admins might have notifications, but we can query for any user
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: any[] = [];
      snapshot.forEach(doc => {
        notifs.push({ id: doc.id, ...doc.data() });
      });
      setNotifications(notifs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification: any) => {
    setShowNotifications(false);
    if (!notification.read) {
      try {
        await updateDoc(doc(db, 'notifications', notification.id), { read: true });
      } catch (err) {
        console.error("Failed to mark notification as read", err);
      }
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  
  return (
    <div className="sticky top-0 z-[60] w-full shrink-0 flex flex-col shadow-sm">
      <div className="bg-slate-900 text-slate-300 text-[10px] sm:text-xs font-bold py-1 px-4 sm:px-8 text-center tracking-widest uppercase">
        Goodfarmer Food Concepts Private Limited
      </div>
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 relative">
        <div className="flex items-center gap-2">
          <Link to="/" className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-900/20">
            T
          </Link>
          <Link to="/" className="text-slate-800 font-semibold text-lg hidden sm:block">Travel Tracker</Link>
          <Link to="/" className="text-slate-800 font-semibold text-lg sm:hidden">Travel Tracker</Link>
        </div>
       <div className="flex items-center gap-3">
         {user && (
           <div className="relative" ref={dropdownRef}>
             <button 
               onClick={() => setShowNotifications(!showNotifications)} 
               className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition relative"
             >
               <Bell size={20} />
               {unreadCount > 0 && (
                 <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
               )}
             </button>

             {showNotifications && (
               <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                 <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                   <h3 className="font-semibold text-slate-800 text-sm">Notifications</h3>
                   {unreadCount > 0 && (
                     <span className="text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unreadCount} new</span>
                   )}
                 </div>
                 <div className="max-h-96 overflow-y-auto">
                   {notifications.length === 0 ? (
                     <div className="p-6 text-center text-slate-500 text-sm">
                       No notifications yet.
                     </div>
                   ) : (
                     <div className="divide-y divide-slate-100">
                       {notifications.map(notif => (
                         <div 
                           key={notif.id} 
                           onClick={() => handleNotificationClick(notif)}
                           className={clsx(
                             "p-4 hover:bg-slate-50 transition cursor-pointer flex flex-col gap-1",
                             !notif.read ? "bg-blue-50/30" : "opacity-80"
                           )}
                         >
                           <div className="flex justify-between items-start gap-2">
                             <p className={clsx("text-sm text-slate-800", !notif.read && "font-semibold")}>
                               {notif.message}
                             </p>
                             {!notif.read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>}
                           </div>
                           {notif.createdAt && (
                             <span className="text-xs text-slate-400">
                               {formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true })}
                             </span>
                           )}
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
             )}
           </div>
         )}
         
         <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-slate-200 hidden sm:block">
           {user?.email}
         </span>
         {profile?.role === 'manager' && (
           <span className="hidden sm:flex px-3 py-1.5 items-center gap-1.5 text-amber-600 font-semibold text-sm bg-amber-50 border border-amber-100 rounded-lg items-center">
             <Users size={16} /> Manager View
           </span>
         )}
         <button onClick={logout} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition" title="Log Out">
           <LogOut size={20} />
         </button>
       </div>
      </header>
    </div>
  );
}
