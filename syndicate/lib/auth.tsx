'use client';

import { createContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Session } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';

// Create a cache for user data with 5-minute TTL
const userCache = new LRUCache<string, AuthUser>({ 
  max: 100, 
  ttl: 1000 * 60 * 5 // 5 minutes
});

interface AuthUser {
  email: string;
  role: 'user' | 'admin'; // Custom user type with role
  firstname?: string;
  lastname?: string;
  company_id?: number | null;
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
        const email = session.user.email;
        if (!email) {
          setIsAuthenticated(false);
          setUser(null);
          setLoading(false);
          return;
        }

        // Check cache first
        const cachedUser = userCache.get(email);
        if (cachedUser) {
          setIsAuthenticated(true);
          setUser(cachedUser);
          localStorage.setItem('token', session.access_token);
          setLoading(false);
          return;
        }

        // Fetch complete user data if not in cache
        const { data: userData, error } = await supabase
          .from('users')
          .select('email, role, firstname, lastname, company_id')
          .eq('email', email)
          .single();

        if (error) {
          console.error('Error fetching user data:', error);
          setIsAuthenticated(false);
          setUser(null);
        } else {
          // Cache the user data
          userCache.set(email, userData);
          setIsAuthenticated(true);
          setUser(userData);
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
        const email = session.user.email;
        if (!email) {
          setIsAuthenticated(false);
          setUser(null);
          setLoading(false);
          return;
        }

        // Check cache first
        const cachedUser = userCache.get(email);
        if (cachedUser) {
          setIsAuthenticated(true);
          setUser(cachedUser);
          localStorage.setItem('token', session.access_token);
          setLoading(false);
          return;
        }

        // Fetch complete user data if not in cache
        const { data: userData, error } = await supabase
          .from('users')
          .select('email, role, firstname, lastname, company_id')
          .eq('email', email)
          .single();

        if (error) {
          console.error('Error fetching user data:', error);
          setIsAuthenticated(false);
          setUser(null);
        } else {
          // Cache the user data
          userCache.set(email, userData);
          setIsAuthenticated(true);
          setUser(userData);
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
    // Clear user from cache on logout
    if (user?.email) {
      userCache.delete(user.email);
    }
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
        if (session && session.user.email) {
          const email = session.user.email;

          // Check cache first
          const cachedUser = userCache.get(email);
          if (cachedUser) {
            setUser(cachedUser);
            setLoading(false);
            return;
          }

          // Fetch complete user data if not in cache
          const { data: userData, error } = await supabase
            .from('users')
            .select('email, role, firstname, lastname, company_id')
            .eq('email', email)
            .single();
            
          if (error) {
            console.error('Error fetching user data:', error);
            setUser(null);
          } else {
            // Cache the user data
            userCache.set(email, userData);
            setUser(userData);
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
      if (session && session.user.email) {
        const email = session.user.email;

        // Check cache first
        const cachedUser = userCache.get(email);
        if (cachedUser) {
          setUser(cachedUser);
          return;
        }

        // Fetch complete user data if not in cache
        const { data: userData, error } = await supabase
          .from('users')
          .select('email, role, firstname, lastname, company_id')
          .eq('email', email)
          .single();
          
        if (error) {
          console.error('Error fetching user data:', error);
          setUser(null);
        } else {
          // Cache the user data
          userCache.set(email, userData);
          setUser(userData);
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