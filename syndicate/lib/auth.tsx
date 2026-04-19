'use client';
import { createContext, useState, useEffect, ReactNode, useRef, useContext, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Session } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';

export const userCache = new LRUCache<string, AuthUser>({
  max: 100,
  ttl: 1000 * 60 * 30, // 30 minutes — reduces cache-miss windows where role can flash
});

// Persists the user's role across page loads and tab switches so a cold LRU miss
// can never cause an admin→recruit flash while the DB fetch is in flight.
const ROLE_STORAGE_KEY = 'syndicate_user_role';
const persistRole = (role: AuthUser['role']) => {
  try { localStorage.setItem(ROLE_STORAGE_KEY, role); } catch { /* ignore SSR */ }
};
const clearPersistedRole = () => {
  try { localStorage.removeItem(ROLE_STORAGE_KEY); } catch { /* ignore SSR */ }
};

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
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTabActive, setIsTabActive] = useState(true);
  const router = useRouter();

  // Single wrapped setter — logs every user state transition with the role
  // being written and a reason tag, so the console trace makes it obvious
  // where a bad role is coming from.
  const setUser = useCallback((next: AuthUser | null, reason: string) => {
    console.log('[auth] setUser:', { reason, role: next?.role ?? null, user_id: next?.user_id ?? null });
    setUserState(next);
  }, []);

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
    if (inFlightUserFetchRef.current) {
      console.log('[auth] fetchUserDetails: in-flight, returning existing promise');
      return inFlightUserFetchRef.current;
    }

    const userId = currentSession.user.id;

    const cached = userCache.get(userId);
    if (cached) {
      console.log('[auth] fetchUserDetails: cache hit, role =', cached.role);
      setUser(cached, 'cache-hit');
      persistRole(cached.role); // keep localStorage in sync with cache
      return;
    }

    console.log('[auth] fetchUserDetails: querying user_id =', userId, 'email =', currentSession.user.email);

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
          console.error('[auth] fetchUserDetails: DB error — LEAVING user as-is (no role downgrade)', {
            code: userRes.error.code,
            message: userRes.error.message,
            details: userRes.error.details,
            hint: userRes.error.hint,
            queried_user_id: userId,
            had_prior_user: !!userRef.current,
            prior_role: userRef.current?.role,
          });
          // Do NOT write a minimal fallback with role='user'. Transient errors
          // (cold-start, network blip, middleware cookie hiccup) would otherwise
          // demote an admin to user and cache the wrong role for 5 minutes.
          // Leaving user as null keeps `loading` in useIsAdmin and components
          // render a loading state until the next successful fetch.
          return;
        }

        console.log('[auth] fetchUserDetails: raw response', {
          data: userRes.data,
          xp: xpRes.data,
        });

        const fullUser: AuthUser = {
          ...userRes.data,
          user_id: userRes.data.user_id ?? userId,
          email: userRes.data.email ?? currentSession.user.email,
          totalXp: xpRes.data?.total_xp ?? 0,
        };
        console.log('[auth] fetchUserDetails: success, role =', fullUser.role);
        userCache.set(userId, fullUser);
        setUser(fullUser, 'db-fetch-success');
        persistRole(fullUser.role); // persist so tab switches never cause admin→recruit flash
      } catch (e) {
        console.error('[auth] fetchUserDetails: exception — LEAVING user as-is', e);
        // Keep existing user; never downgrade on a thrown error.
      } finally {
        inFlightUserFetchRef.current = null;
      }
    })();

    inFlightUserFetchRef.current = fetchPromise;
    return fetchPromise;
  }, [setUser]);

  // Apply a new session (or null) to state. Stable across renders.
  const applySession = useCallback(async (nextSession: Session | null, reason: string): Promise<void> => {
    console.log('[auth] applySession:', { reason, hasSession: !!nextSession, user_email: nextSession?.user.email });
    if (!nextSession) {
      setSession(null);
      setUser(null, 'apply-session-null');
      userCache.clear();
      clearPersistedRole();
      return;
    }

    setSession(nextSession);
    await fetchUserDetails(nextSession);
  }, [fetchUserDetails, setUser]);

  // Public checkAuth — reads the current Supabase session and syncs state.
  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      console.log('[auth] checkAuth: calling getSession');
      const { data: { session: current }, error } = await supabase.auth.getSession();
      if (error) throw error;
      await applySession(current, 'checkAuth');
    } catch (e) {
      console.error('[auth] checkAuth failed:', e);
    }
  }, [applySession]);

  // Single mount effect: initial session check + one subscription to auth events.
  useEffect(() => {
    console.log('[auth] AuthProvider mount effect running');
    let cancelled = false;

    (async () => {
      if (isPasswordResetURL()) {
        console.log('[auth] mount: on password reset URL, skipping initial check');
        setLoading(false);
        return;
      }
      try {
        console.log('[auth] mount: initial getSession');
        const { data: { session: current } } = await supabase.auth.getSession();
        if (cancelled) return;
        console.log('[auth] mount: initial session:', {
          hasSession: !!current,
          user_id: current?.user.id,
          user_email: current?.user.email,
        });
        if (current) await applySession(current, 'mount-initial');
      } catch (e) {
        console.error('[auth] Initial session check failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (cancelled) return;
      console.log('[auth] onAuthStateChange:', {
        event,
        hasSession: !!newSession,
        user_email: newSession?.user.email,
        user_id: newSession?.user.id,
      });

      if (isPasswordResetURL()) {
        if (event === 'SIGNED_OUT') return;
        if (newSession && (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED' || event === 'SIGNED_IN')) {
          setSession(newSession);
          setUser(null, 'password-reset-page');
          return;
        }
      }

      if (event === 'SIGNED_OUT') {
        await applySession(null, 'signed-out-event');
        router.push('/login');
        return;
      }

      if (newSession) {
        await applySession(newSession, `event-${event}`);
      }
    });

    return () => {
      console.log('[auth] AuthProvider unmount');
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visibility handler: only re-check if the session is actually near expiry.
  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabActive(visible);
      if (!visible) {
        console.log('[auth] visibility: tab hidden');
        return;
      }

      const current = sessionRef.current;
      if (!current?.expires_at) {
        console.log('[auth] visibility: tab visible, no session to check');
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const secondsUntilExpiry = current.expires_at - now;
      if (secondsUntilExpiry <= 60) {
        console.log('[auth] visibility: tab visible, session expires in', secondsUntilExpiry, 'sec → calling checkAuth');
        checkAuth();
      } else {
        console.log('[auth] visibility: tab visible, session healthy (expires in', secondsUntilExpiry, 'sec) → skipping check');
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
