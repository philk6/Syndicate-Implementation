'use client';
import { createContext, useState, useEffect, ReactNode, useRef, useContext, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Session } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';

export const userCache = new LRUCache<string, AuthUser>({
  max: 100,
  ttl: 1000 * 60 * 5, // 5 minutes
});

interface AuthUser {
  user_id: string;
  email: string | undefined;
  role: 'user' | 'admin';
  firstname?: string;
  lastname?: string;
  company_id?: number | null;
  tos_accepted: boolean;
  buyersgroup: boolean;
  totalXp: number;
}

interface AuthContextType {
  session: Session | null;
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  isTabActive: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isPasswordResetURL = () => {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname !== '/reset-password') return false;
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  return hashParams.get('type') === 'recovery' && hashParams.has('access_token');
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTabActive, setIsTabActive] = useState(true);
  const router = useRouter();

  // Refs holding the latest state so stable callbacks can read it
  // without taking state in their dependency arrays.
  const sessionRef = useRef<Session | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  const inFlightUserFetchRef = useRef<Promise<void> | null>(null);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Fetch the public.users row for the current session. Stable across renders.
  // Dedupes concurrent calls via inFlightUserFetchRef.
  const fetchUserDetails = useCallback(async (currentSession: Session): Promise<void> => {
    if (inFlightUserFetchRef.current) return inFlightUserFetchRef.current;

    const userId = currentSession.user.id;

    const cached = userCache.get(userId);
    if (cached) {
      setUser(cached);
      return;
    }

    console.log('[auth] fetchUserDetails: querying user_id =', userId);

    const fetchPromise = (async () => {
      try {
        const [userRes, xpRes] = await Promise.all([
          supabase
            .from('users')
            .select('user_id, email, role, firstname, lastname, company_id, tos_accepted, buyersgroup')
            .eq('user_id', userId)
            .single(),
          supabase
            .from('user_total_xp')
            .select('total_xp')
            .eq('user_id', userId)
            .maybeSingle(),
        ]);

        if (userRes.error) {
          console.error('[auth] fetchUserDetails: DB error', {
            code: userRes.error.code,
            message: userRes.error.message,
            details: userRes.error.details,
            hint: userRes.error.hint,
            queried_user_id: userId,
          });
          // Preserve whatever user we already have rather than clobbering with a minimal row.
          // This keeps admin state across transient RLS/network errors.
          if (userRef.current) return;
          // No prior user — write a minimal fallback so the app can boot.
          setUser({
            user_id: userId,
            email: currentSession.user.email,
            role: 'user',
            tos_accepted: true,
            buyersgroup: false,
            totalXp: 0,
          });
          return;
        }

        const fullUser: AuthUser = {
          ...userRes.data,
          user_id: userRes.data.user_id ?? userId,
          email: userRes.data.email ?? currentSession.user.email,
          totalXp: xpRes.data?.total_xp ?? 0,
        };
        console.log('[auth] fetchUserDetails: success, role =', fullUser.role);
        userCache.set(userId, fullUser);
        setUser(fullUser);
      } catch (e) {
        console.error('[auth] fetchUserDetails: exception', e);
        // Keep existing user; never downgrade on a thrown error.
      } finally {
        inFlightUserFetchRef.current = null;
      }
    })();

    inFlightUserFetchRef.current = fetchPromise;
    return fetchPromise;
  }, []);

  // Apply a new session (or null) to state. Stable across renders.
  const applySession = useCallback(async (nextSession: Session | null): Promise<void> => {
    if (!nextSession) {
      setSession(null);
      setUser(null);
      userCache.clear();
      return;
    }

    setSession(nextSession);
    await fetchUserDetails(nextSession);
  }, [fetchUserDetails]);

  // Public checkAuth — reads the current Supabase session and syncs state.
  // Stable; safe to pass into effects without triggering re-runs.
  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const { data: { session: current }, error } = await supabase.auth.getSession();
      if (error) throw error;
      await applySession(current);
    } catch (e) {
      console.error('[auth] checkAuth failed:', e);
    }
  }, [applySession]);

  // Single mount effect: initial session check + one subscription to auth events.
  // Empty deps: runs exactly once, regardless of state churn downstream.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isPasswordResetURL()) {
        setLoading(false);
        return;
      }
      try {
        const { data: { session: current } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (current) await applySession(current);
      } catch (e) {
        console.error('[auth] Initial session check failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Supabase propagates auth events across tabs via localStorage, so a single
    // subscription here keeps every tab in sync (SIGNED_IN, SIGNED_OUT,
    // TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (cancelled) return;

      if (isPasswordResetURL()) {
        if (event === 'SIGNED_OUT') return; // ignore post-password-update signout
        if (newSession && (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED' || event === 'SIGNED_IN')) {
          setSession(newSession);
          setUser(null);
          return;
        }
      }

      if (event === 'SIGNED_OUT') {
        await applySession(null);
        router.push('/login');
        return;
      }

      if (newSession) {
        await applySession(newSession);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visibility handler: only re-check if the session is actually near expiry.
  // Does NOT depend on checkAuth — avoids rebinding listeners on state churn.
  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabActive(visible);
      if (!visible) return;

      const current = sessionRef.current;
      if (!current?.expires_at) return;

      const now = Math.floor(Date.now() / 1000);
      // Only refetch if session expires within 60s. Supabase auto-refresh
      // handles anything further out, and cross-tab sync via onAuthStateChange
      // already keeps other state coherent.
      if (now >= current.expires_at - 60) {
        checkAuth();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [checkAuth]);

  const login = (token: string) => {
    localStorage.setItem('token', token);
    void checkAuth();
    router.push('/orders');
  };

  const logout = useCallback(async () => {
    if (userRef.current?.user_id) userCache.delete(userRef.current.user_id);
    await supabase.auth.signOut();
  }, []);

  const isAuthenticated = !!session;

  return (
    <AuthContext.Provider
      value={{ session, isAuthenticated, user, loading, login, logout, checkAuth, isTabActive }}
    >
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

/**
 * Three-state admin check: 'loading' | true | false.
 *
 * Prefer this over `user?.role === 'admin'` in components. Returns 'loading'
 * during initial auth hydration so components can render a skeleton instead of
 * flashing the non-admin view. Returns a boolean once auth is settled.
 */
export function useIsAdmin(): 'loading' | boolean {
  const { user, loading, isAuthenticated } = useAuth();
  if (loading) return 'loading';
  if (!isAuthenticated || !user) return false;
  return user.role === 'admin';
}
