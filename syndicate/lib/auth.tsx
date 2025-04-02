'use client';

import { createContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';

interface AuthUser {
  email: string;
  role: 'user' | 'admin'; // Custom user type with role
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null; // Updated to use AuthUser
  loading: boolean;
  login: (token: string) => void;
  logout: () => Promise<void>;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null; // Updated to use AuthUser
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null); // Use AuthUser
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Fetch role from users table
        const { data: userData, error } = await supabase
          .from('users')
          .select('email, role')
          .eq('email', session.user.email)
          .single();

        if (error) {
          console.error('Error fetching user role:', error);
          setIsAuthenticated(false);
          setUser(null);
        } else {
          setIsAuthenticated(true);
          setUser({ email: userData.email, role: userData.role });
          localStorage.setItem('token', session.access_token);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('token');
      }
      setLoading(false);
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const { data: userData, error } = await supabase
          .from('users')
          .select('email, role')
          .eq('email', session.user.email)
          .single();

        if (error) {
          console.error('Error fetching user role:', error);
          setIsAuthenticated(false);
          setUser(null);
        } else {
          setIsAuthenticated(true);
          setUser({ email: userData.email, role: userData.role });
          localStorage.setItem('token', session.access_token);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('token');
        router.push('/login');
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const login = (token: string) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
    router.push('/orders');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null); // Use AuthUser

  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        setSession(session);
        if (session) {
          const { data: userData, error } = await supabase
            .from('users')
            .select('email, role')
            .eq('email', session.user.email)
            .single();
          if (error) {
            console.error('Error fetching user role:', error);
            setUser(null);
          } else {
            setUser({ email: userData.email, role: userData.role });
          }
        } else {
          setUser(null);
        }
      })
      .catch((error) => {
        console.error('Error fetching session:', error);
        setUser(null);
      })
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session) {
        const { data: userData, error } = await supabase
          .from('users')
          .select('email, role')
          .eq('email', session.user.email)
          .single();
        if (error) {
          console.error('Error fetching user role:', error);
          setUser(null);
        } else {
          setUser({ email: userData.email, role: userData.role });
        }
      } else {
        setUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return {
    session,
    loading,
    isAuthenticated: !!session,
    user,
  };
}