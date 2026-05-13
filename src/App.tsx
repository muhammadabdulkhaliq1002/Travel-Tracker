/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { TripsList } from './components/TripsList';
import { NewTrip } from './components/NewTrip';
import { Login } from './components/Login';

import { AdminConsole } from './components/AdminConsole';
import { AdminDashboard } from './components/AdminDashboard';
import { LogOut } from 'lucide-react';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isActive, logout } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isActive) return (
     <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
       <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-100 max-w-md w-full text-center flex flex-col items-center gap-4">
          <div>
             <h2 className="text-xl font-bold text-slate-800 mb-2">Account Pending Approval</h2>
             <p className="text-slate-600 text-sm">Your account has been created and is waiting for administrator approval. Please check back later or contact your admin.</p>
          </div>
          <button onClick={logout} className="mt-4 flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition">
             <LogOut size={16} /> Logout
          </button>
       </div>
     </div>
  );
  return <>{children}</>;
}

function DefaultRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/trips" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<DefaultRoute />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/trips" 
            element={
              <AuthGuard>
                <TripsList />
              </AuthGuard>
            } 
          />
          <Route 
            path="/new" 
            element={
              <AuthGuard>
                <NewTrip />
              </AuthGuard>
            } 
          />
          <Route 
            path="/edit/:id" 
            element={
              <AuthGuard>
                <NewTrip />
              </AuthGuard>
            } 
          />
          <Route 
            path="/admin" 
            element={
              <AuthGuard>
                <AdminConsole />
              </AuthGuard>
            } 
          />
          <Route 
            path="/admin/dashboard" 
            element={
              <AuthGuard>
                <AdminDashboard />
              </AuthGuard>
            } 
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
