import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, query, collection, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isActive: boolean;
  profile: any;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userRef);
          
          let role = 'employee';
          let localIsActive = currentUser.email === 'ca.abdulkhaliq@gmail.com';
          let currentProfile: any = null;

          if (!docSnap.exists()) {
            role = currentUser.email === 'ca.abdulkhaliq@gmail.com' ? 'admin' : 'employee';
            
            // Check if admin pre-created by email
            if (currentUser.email) {
               try {
                 const emailQuery = query(collection(db, 'users'), where('email', '==', currentUser.email));
                 const querySnapshot = await getDocs(emailQuery);
                 if (!querySnapshot.empty) {
                    const preCreatedDoc = querySnapshot.docs.find(d => d.id !== currentUser.uid);
                    if (preCreatedDoc) {
                       const preData = preCreatedDoc.data();
                       role = preData.role || role;
                       localIsActive = preData.isActive !== false;
                       currentProfile = { ...preData };
                       try {
                         await deleteDoc(preCreatedDoc.ref);
                       } catch (err) {
                         console.error("Could not delete pre-created user doc", err);
                       }
                    }
                 }
               } catch (err) {
                 console.error("Could not fetch pre-created user doc", err);
               }
            }

            const newUserData: any = {
              ...currentProfile,
              email: currentUser.email,
              role: role,
              isActive: localIsActive,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            };
            if (currentUser.displayName) newUserData.displayName = currentUser.displayName;
            if (currentUser.photoURL) newUserData.photoURL = currentUser.photoURL;

            await setDoc(userRef, newUserData);
            currentProfile = { id: currentUser.uid, ...newUserData };
          } else {
            // Returning user - update last login
            role = docSnap.data().role;
            localIsActive = docSnap.data().isActive;
            const updateData: any = { lastLoginAt: serverTimestamp() };
            if (currentUser.displayName) updateData.displayName = currentUser.displayName;
            if (currentUser.photoURL) updateData.photoURL = currentUser.photoURL;
            await updateDoc(userRef, updateData);
            currentProfile = { id: currentUser.uid, ...docSnap.data(), ...updateData };
          }

          setIsAdmin(role === 'admin' || currentUser.email === 'ca.abdulkhaliq@gmail.com');
          setIsActive(localIsActive);
          setProfile(currentProfile);
        } catch (error) {
          console.error("Error syncing user data:", error);
          // If Firestore fails (e.g., rules error), fallback to email check
          setIsAdmin(currentUser.email === 'ca.abdulkhaliq@gmail.com');
          setIsActive(true);
          setProfile({ email: currentUser.email, role: currentUser.email === 'ca.abdulkhaliq@gmail.com' ? 'admin' : 'employee' });
        }
      } else {
        setIsAdmin(false);
        setIsActive(true);
        setProfile(null);
      }
      
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isActive, profile, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
