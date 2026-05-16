import { useAuth } from './AuthProvider';
import { LogIn } from 'lucide-react';

export function Login() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="bg-slate-900/80 backdrop-blur-md text-slate-300 text-[10px] sm:text-xs font-bold py-1 px-4 sm:px-8 text-center tracking-widest uppercase w-full">
        Goodfarmer Food Concepts Private Limited
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-white/40 backdrop-blur-xl p-8 rounded-2xl shadow-xl border border-white/60 w-full max-w-sm text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-600/90 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-blue-900/50 mb-6">
            T
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Travel Tracker</h1>
          <p className="text-slate-600 mb-8 text-sm font-medium">Sign in to track your travel logs securely to the cloud.</p>
          
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-white/60 shadow-sm bg-white/50 backdrop-blur-sm text-slate-800 font-bold hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google logo" />
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
