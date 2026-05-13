import React, { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import Papa from 'papaparse';
import { useAuth } from './AuthProvider';
import { Link, Navigate } from 'react-router-dom';
import { Users, Shield, ShieldOff, CheckCircle2, XCircle, ArrowLeft, Plus, Edit2, Save, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { Header } from './Header';

export function AdminConsole() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({ email: '', displayName: '', role: 'employee', isActive: true, managerId: '' });
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingBulk, setUploadingBulk] = useState(false);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const q = query(
      collection(db, 'users'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  const toggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isActive: !currentStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const openAddModal = () => {
    setModalMode('add');
    setFormData({ email: '', displayName: '', role: 'employee', isActive: true, managerId: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (u: any) => {
    setModalMode('edit');
    setEditingUser(u);
    setFormData({ email: u.email || '', displayName: u.displayName || '', role: u.role || 'employee', isActive: u.isActive ?? true, managerId: u.managerId || '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    const dataToSave: any = {
      displayName: formData.displayName,
      role: formData.role,
      isActive: formData.isActive
    };
    if (formData.role === 'employee' && formData.managerId) {
      dataToSave.managerId = formData.managerId;
    } else {
      dataToSave.managerId = null;
    }

    try {
      if (modalMode === 'add') {
         await addDoc(collection(db, 'users'), {
            ...dataToSave,
            email: formData.email,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
         });
      } else if (modalMode === 'edit' && editingUser) {
         await updateDoc(doc(db, 'users', editingUser.id), dataToSave);
      }
      setIsModalOpen(false);
    } catch (error) {
       handleFirestoreError(error, modalMode === 'add' ? OperationType.CREATE : OperationType.UPDATE, 'users');
    } finally {
       setSubmitting(false);
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBulk(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        for (const row of rows) {
          if (!row.email) continue;
          
          try {
            await addDoc(collection(db, 'users'), {
              email: row.email,
              displayName: row.displayName || '',
              role: row.role && ['admin', 'manager', 'employee', 'viewer'].includes(row.role.toLowerCase()) ? row.role.toLowerCase() : 'employee',
              isActive: row.isActive ? row.isActive.toLowerCase() === 'true' : true,
              managerId: null,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            });
          } catch (err) {
             console.error("Bulk upload error for ", row.email, err);
          }
        }
        setUploadingBulk(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error("Error parsing CSV", error);
        setUploadingBulk(false);
      }
    });
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative">
      <Header />

      <main className="flex-1 p-4 sm:p-8 max-w-6xl mx-auto w-full flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold text-sm shadow-sm">
              Users
            </Link>
            <Link to="/" className="px-4 py-2 bg-white text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg font-bold text-sm shadow-sm transition-colors">
              Trips Data
            </Link>
            <Link to="/admin/dashboard" className="px-4 py-2 bg-white text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg font-bold text-sm shadow-sm transition-colors">
              Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div>
              <input 
                type="file" 
                accept=".csv"
                ref={fileInputRef}
                className="hidden"
                onChange={handleBulkUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={uploadingBulk}
                className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50 transition flex items-center gap-2 w-max disabled:opacity-50"
              >
                <Upload size={16} /> {uploadingBulk ? 'Uploading...' : 'Bulk Invite (CSV)'}
              </button>
            </div>
            <button onClick={openAddModal} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm shadow-sm hover:bg-blue-700 transition flex items-center gap-2 w-max">
              <Plus size={16} /> Invite User
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800">User Management</h2>
            <p className="text-sm text-slate-500">Manage user roles and access to the app.</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-white text-[11px] uppercase text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Last Login</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                {users.map(u => {
                  const isSelf = user?.uid === u.id || user?.email === u.email;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full border border-slate-200" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold text-lg">
                              {u.displayName?.charAt(0) || u.email?.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-800">{u.displayName || 'Unknown user'} {isSelf && <span className="text-[10px] text-blue-500 font-bold tracking-wider uppercase ml-2">(You)</span>}</div>
                            <div className="text-xs text-slate-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border w-max ${
                            u.role === 'admin' 
                              ? 'bg-purple-50 text-purple-600 border-purple-100' 
                              : u.role === 'manager'
                              ? 'bg-amber-50 text-amber-600 border-amber-100'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {u.role}
                          </span>
                          {u.role === 'employee' && u.managerId && (
                            <div className="text-[10px] text-slate-500 whitespace-nowrap">
                              Mgr: {users.find(m => m.id === u.managerId)?.displayName || 'Unknown'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 w-max ${
                          u.isActive 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {u.isActive ? 'Active' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs text-nowrap">
                        {u.lastLoginAt ? format(u.lastLoginAt.toDate(), 'MMM dd, yyyy HH:mm') : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-2 rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                          title="Edit User"
                        >
                          <Edit2 size={16} />
                        </button>
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => toggleActive(u.id, u.isActive)}
                              className={`p-2 rounded-lg border transition-colors shadow-sm flex items-center gap-1 text-xs font-bold ${
                                u.isActive 
                                  ? 'bg-white border-rose-200 text-rose-600 hover:bg-rose-50' 
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={u.isActive ? "Deactivate User" : "Approve / Activate User"}
                            >
                              {u.isActive ? <XCircle size={16} /> : <><CheckCircle2 size={16} /> Approve</>}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                 <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    {modalMode === 'add' ? <Plus className="text-blue-600" size={20} /> : <Edit2 className="text-blue-600" size={20} />}
                    {modalMode === 'add' ? 'Invite User' : 'Edit User'}
                 </h3>
                 <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                    <XCircle size={20} />
                 </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 hidden">Email <span className="text-rose-500">*</span></label>
                    <input 
                      type="email" 
                      placeholder="Email Address (Must be valid Google Account)"
                      required 
                      disabled={modalMode === 'edit'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
                      value={formData.email}
                      onChange={e => setFormData(f => ({...f, email: e.target.value}))}
                    />
                    {modalMode === 'add' && <p className="text-[10px] text-slate-500 mt-1">Users will be verified upon first login with this email.</p>}
                 </div>
                 <div>
                    <input 
                      type="text" 
                      placeholder="Display Name (Optional)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2"
                      value={formData.displayName}
                      onChange={e => setFormData(f => ({...f, displayName: e.target.value}))}
                    />
                 </div>
                 
                 <div className="flex flex-col gap-4 mt-2">
                    <div className="flex flex-col gap-1.5">
                       <label className="text-xs font-bold text-slate-700 uppercase">Role</label>
                       <select 
                         disabled={editingUser && (user?.uid === editingUser.id || user?.email === editingUser.email)}
                         className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 appearance-none"
                         value={formData.role}
                         onChange={e => setFormData(f => ({...f, role: e.target.value}))}
                       >
                         <option value="employee">Employee</option>
                         <option value="manager">Manager</option>
                         <option value="viewer">Viewer</option>
                         <option value="admin">Admin</option>
                       </select>
                    </div>

                    {formData.role === 'employee' && (
                        <div className="flex flex-col gap-1.5">
                           <label className="text-xs font-bold text-slate-700 uppercase">Manager</label>
                           <select 
                             className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 appearance-none"
                             value={formData.managerId}
                             onChange={e => setFormData(f => ({...f, managerId: e.target.value}))}
                           >
                             <option value="">Select a manager...</option>
                             {users.filter(u => u.role === 'manager').map(manager => (
                               <option key={manager.id} value={manager.id}>{manager.displayName || manager.email}</option>
                             ))}
                           </select>
                        </div>
                    )}

                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                       <input 
                         type="checkbox" 
                         disabled={editingUser && (user?.uid === editingUser.id || user?.email === editingUser.email)}
                         className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
                         checked={formData.isActive}
                         onChange={e => setFormData(f => ({...f, isActive: e.target.checked}))}
                       />
                       Account Active
                    </label>
                 </div>
                 
                 <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2.5 rounded-lg text-slate-600 text-sm font-bold hover:bg-slate-50 transition"
                    >
                       Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={submitting}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition disabled:opacity-75 flex items-center gap-2"
                    >
                       {submitting ? 'Saving...' : <><Save size={16} /> Save User</>}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}

