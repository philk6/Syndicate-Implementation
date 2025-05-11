'use client';
import { createContext, useState, useEffect, ReactNode, useRef, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Session } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';

const userCache = new LRUCache<string, AuthUser>({ 
  max: 100, 
  ttl: 1000 * 60 * 5 // 5 minutes
});

// Minimum time between session checks (5 seconds)
const MIN_CHECK_INTERVAL = 5000;

interface AuthUser {
  email: string;
  role: 'user' | 'admin';
  firstname?: string;
  lastname?: string;
  company_id?: number | null;
  tos_accepted: boolean;
}

interface AuthContextType {
  session: Session | null;
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => Promise<void>;
  checkAuth: (isInitialLoad?: boolean) => Promise<void>; // Expose checkAuth
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const lastCheckedRef = useRef<number>(0);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsAuthenticated(!!session);
  }, [session]);

  const fetchUserDetails = async (email: string, currentSession: Session) => {
    const cachedUser = userCache.get(email);
    if (cachedUser) {
      setUser(cachedUser);
      localStorage.setItem('token', currentSession.access_token);
      return;
    }
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, role, firstname, lastname, company_id, tos_accepted')
        .eq('email', email)
        .single();
      if (userError) {
        console.error('Error fetching user data:', userError);
        setUser(null);
        localStorage.removeItem('token');
      } else {
        userCache.set(email, userData);
        setUser(userData);
        localStorage.setItem('token', currentSession.access_token);
      }
    } catch (e) {
      console.error('Exception fetching user data:', e);
      setUser(null);
      localStorage.removeItem('token');
    }
  };

  const checkAuth = async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);
    try {
      const { data: { session: currentSession }, error } = await supabase.auth.getSession();
      console.log('AuthProvider checkAuth: session=', currentSession, 'error=', error);
      if (error) throw error;

      if (currentSession) {
        const expiresAt = currentSession.expires_at;
        const currentTime = Math.floor(Date.now() / 1000);
        if (expiresAt && currentTime >= expiresAt) {
          console.log('AuthProvider: Session expired at', new Date(expiresAt * 1000).toISOString());
          setSession(null);
          setUser(null);
          localStorage.removeItem('token');
        } else {
          setSession(currentSession);
          if (currentSession.user.email) {
            await fetchUserDetails(currentSession.user.email, currentSession);
          } else {
            setUser(null);
            localStorage.removeItem('token');
          }
        }
      } else {
        setSession(null);
        setUser(null);
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      setSession(null);
      setUser(null);
      localStorage.removeItem('token');
    } finally {
      if (isInitialLoad) setLoading(false);
      lastCheckedRef.current = Date.now();
    }
  };

  useEffect(() => {
    checkAuth(true); // Initial check on mount

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('AuthProvider onAuthStateChange: event=', event, 'session=', newSession);
      setLoading(true);
      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        if (newSession.user.email) {
          await fetchUserDetails(newSession.user.email, newSession);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        userCache.clear();
        localStorage.removeItem('token');
        router.push('/login');
      } else if (event === 'TOKEN_REFRESHED' && newSession) {
        setSession(newSession);
        if (newSession.user.email) {
          if (!user || user.email !== newSession.user.email) {
            await fetchUserDetails(newSession.user.email, newSession);
          }
        } else {
          setUser(null);
          localStorage.removeItem('token');
        }
      } else if (event === 'USER_UPDATED' && newSession) {
        setSession(newSession);
        if (newSession.user.email) {
          await fetchUserDetails(newSession.user.email, newSession);
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [checkAuth, router, user]);

  useEffect(() => {
    if (!session || loading) return;

    const refreshInterval = setInterval(async () => {
      console.log('AuthProvider: Proactively attempting to refresh session');
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('AuthProvider: Error refreshing session proactively:', error.message);
      } else {
        console.log('AuthProvider: Session proactively refreshed', data.session ? data.session.expires_at : 'no session data');
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [session, loading]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('AuthProvider onVisibilityChange: Checking session on tab focus');
        const now = Date.now();
        if (now - lastCheckedRef.current < MIN_CHECK_INTERVAL) {
          console.log('AuthProvider onVisibilityChange: Skipping check, too soon');
          return;
        }
        if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = setTimeout(async () => {
          await checkAuth();
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [checkAuth]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      const now = Date.now();
      if (now - lastCheckedRef.current < MIN_CHECK_INTERVAL) {
        console.log('AuthProvider Route change: Skipping check, too soon');
        return;
      }
      console.log('AuthProvider Route change: Re-checking auth for path:', pathname);
      checkAuth();
    }
  }, [pathname, checkAuth, isAuthenticated, loading]);

  const login = (token: string) => {
    console.warn('AuthProvider login function called. Ensure Supabase session is correctly handled.');
    localStorage.setItem('token', token);
    checkAuth();
    router.push('/orders');
  };

  const logout = async () => {
    if (user?.email) userCache.delete(user.email);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, isAuthenticated, user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}