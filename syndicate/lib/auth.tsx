'use client';
import { createContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Session } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';

const userCache = new LRUCache<string, AuthUser>({ 
  max: 100, 
  ttl: 1000 * 60 * 5 // 5 minutes
});

interface AuthUser {
  email: string;
  role: 'user' | 'admin';
  firstname?: string;
  lastname?: string;
  company_id?: number | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => Promise<void>;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('checkAuth: session=', session, 'error=', error);
      if (error) throw error;
      if (!session) {
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('token');
        setLoading(false);
        return;
      }

      const email = session.user.email;
      if (!email) {
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('token');
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

      // Fetch user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, role, firstname, lastname, company_id')
        .eq('email', email)
        .single();

      if (userError) {
        console.error('Error fetching user data:', userError);
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('token');
      } else {
        userCache.set(email, userData);
        setIsAuthenticated(true);
        setUser(userData);
        localStorage.setItem('token', session.access_token);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsAuthenticated(false);
      setUser(null);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await checkAuth();
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('token');
        router.push('/login');
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Refresh session every 10 minutes during active use
  useEffect(() => {
    if (!isAuthenticated || loading) return;

    const refreshInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        console.log('refreshSession: data=', data, 'error=', error);
        if (error || !data.session) {
          console.error('Session refresh failed:', error);
          setIsAuthenticated(false);
          setUser(null);
          localStorage.removeItem('token');
          router.push('/login?message=session_expired');
        }
      } catch (err) {
        console.error('Error refreshing session:', err);
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('token');
        router.push('/login?message=session_expired');
      }
    }, 5 * 60 * 1000); // 10 minutes

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated, loading]);

  // Re-check auth on route change
  useEffect(() => {
    if (!loading && isAuthenticated) {
      checkAuth();
    }
  }, [pathname]);

  const login = (token: string) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
    router.push('/orders');
  };

  const logout = async () => {
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const pathname = usePathname();

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('useAuth checkAuth: session=', session, 'error=', error);
      if (error) throw error;
      setSession(session);
      if (session && session.user.email) {
        const email = session.user.email;
        const cachedUser = userCache.get(email);
        if (cachedUser) {
          setUser(cachedUser);
          setLoading(false);
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('email, role, firstname, lastname, company_id')
          .eq('email', email)
          .single();

        if (userError) {
          console.error('Error fetching user data:', userError);
          setUser(null);
        } else {
          userCache.set(email, userData);
          setUser(userData);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      setSession(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('useAuth onAuthStateChange: event=', event, 'session=', session);
      setSession(session);
      if (session && session.user.email) {
        const email = session.user.email;
        const cachedUser = userCache.get(email);
        if (cachedUser) {
          setUser(cachedUser);
          return;
        }

        const { data: userData, error } = await supabase
          .from('users')
          .select('email, role, firstname, lastname, company_id')
          .eq('email', email)
          .single();

        if (error) {
          console.error('Error fetching user data:', error);
          setUser(null);
        } else {
          userCache.set(email, userData);
          setUser(userData);
        }
      } else {
        setUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Re-check auth on route change
  useEffect(() => {
    if (!loading && session) {
      checkAuth();
    }
  }, [pathname]);

  return {
    session,
    loading,
    isAuthenticated: !!session,
    user,
  };
}