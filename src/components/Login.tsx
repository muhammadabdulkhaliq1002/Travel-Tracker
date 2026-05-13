import { useAuth } from './AuthProvider';
import { LogIn } from 'lucide-react';

export function Login() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <div className="bg-slate-900 text-slate-300 text-[10px] sm:text-xs font-bold py-1 px-4 sm:px-8 text-center tracking-widest uppercase w-full">
        Goodfarmer Food Concepts Private Limited
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-blue-900/50 mb-6">
            T
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Travel Tracker</h1>
          <p className="text-slate-500 mb-8 text-sm">Sign in to track your travel logs securely to the cloud.</p>
          
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-200 shadow-sm bg-white text-slate-700 font-bold hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google logo" />
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
