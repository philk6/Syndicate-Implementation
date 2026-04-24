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

// Persists the full authenticated user to localStorage so cold starts
// (Railway deploy, LRU TTL expiry, hard refresh) never leave us rendering
// with user=null — the UI would fall back to the XP-rank "Recruit" label
// and show "Loading..." for the name. The persisted state is used only to
// seed initial render; every fetch still round-trips to the DB.
const USER_STORAGE_KEY = 'syndicate_user_profile_v1';
const persistUser = (u: AuthUser) => {
  try { localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u)); } catch { /* ignore SSR / storage quota */ }
};
const clearPersistedUser = () => {
  try { localStorage.removeItem(USER_STORAGE_KEY); } catch { /* ignore SSR */ }
  // Also clear the legacy role-only key (harmless if already absent).
  try { localStorage.removeItem('syndicate_user_role'); } catch { /* ignore SSR */ }
};
const readPersistedUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed || typeof parsed !== 'object' || !parsed.user_id || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
};

interface AuthUser {
  user_id: string;
  email: string | undefined;
  role: 'user' | 'admin' | 'employee';
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
  // Hydrate from localStorage synchronously so the first render already has the
  // user's role — this avoids the "Recruit" flash when the DB fetch is slow.
  // If no session ultimately materializes, applySession(null) will clear this.
  const [user, setUserState] = useState<AuthUser | null>(() => readPersistedUser());
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
  // Tracks the last user_id we applied a session for. Used to skip
  // re-fetching the profile on TOKEN_REFRESHED events where identity
  // hasn't actually changed.
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { userRef.current = user; }, [user]);

  // One-shot profile query. Returns true on success, false on any failure
  // (error, abort, or exception). Does not mutate user state on failure — the
  // caller decides whether to retry, fall back, or leave state as-is.
  const fetchProfileOnce = useCallback(async (
    currentSession: Session,
  ): Promise<boolean> => {
    const userId = currentSession.user.id;
    const queryController = new AbortController();
    // 6s per attempt — aligns with the Supabase browser client's new 10s hard
    // timeout and leaves headroom for a second attempt + a render cycle.
    const queryTimeout = setTimeout(() => {
      console.warn('[auth] fetchProfileOnce: 6s timeout — aborting query');
      queryController.abort();
    }, 6000);

    try {
      const [userRes, xpRes] = await Promise.all([
        supabase
          .from('users')
          .select('user_id, email, role, firstname, lastname, company_id, tos_accepted, buyersgroup')
          .eq('user_id', userId)
          .abortSignal(queryController.signal)
          .single(),
        supabase
          .from('user_total_xp')
          .select('total_xp')
          .eq('user_id', userId)
          .abortSignal(queryController.signal)
          .maybeSingle(),
      ]);

      if (userRes.error) {
        console.error('[auth] fetchProfileOnce: DB error', {
          code: userRes.error.code,
          message: userRes.error.message,
          details: userRes.error.details,
          queried_user_id: userId,
        });
        return false;
      }

      const fullUser: AuthUser = {
        ...userRes.data,
        user_id: userRes.data.user_id ?? userId,
        email: userRes.data.email ?? currentSession.user.email,
        totalXp: xpRes.data?.total_xp ?? 0,
      };
      userCache.set(userId, fullUser);
      setUser(fullUser, 'db-fetch-success');
      persistUser(fullUser);
      return true;
    } catch (e) {
      console.error('[auth] fetchProfileOnce: exception', e);
      return false;
    } finally {
      clearTimeout(queryTimeout);
    }
  }, [setUser]);

  // Fetch the public.users row for the current session. Stable across renders.
  // Dedupes concurrent calls via inFlightUserFetchRef. Retries once (after a
  // short backoff) on first failure so a single cold-start network blip
  // doesn't leave user=null for the whole session — that cascade was the
  // root cause of "all pages spin forever" because every page gates its own
  // data fetch on user?.user_id.
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
      persistUser(cached);
      return;
    }

    console.log('[auth] fetchUserDetails: querying user_id =', userId);

    const fetchPromise = (async () => {
      try {
        const firstOk = await fetchProfileOnce(currentSession);
        if (firstOk) return;

        console.warn('[auth] fetchUserDetails: first attempt failed, retrying once after 2s');
        await new Promise((r) => setTimeout(r, 2000));
        const secondOk = await fetchProfileOnce(currentSession);
        if (!secondOk) {
          console.error(
            '[auth] fetchUserDetails: both attempts failed — user stays as-is',
            { had_prior_user: !!userRef.current, prior_role: userRef.current?.role },
          );
          // No demotion to role='user' — transient failures must not flip an
          // admin to recruit. Any user hydrated from localStorage stays.
        }
      } finally {
        inFlightUserFetchRef.current = null;
      }
    })();

    inFlightUserFetchRef.current = fetchPromise;
    return fetchPromise;
  }, [fetchProfileOnce, setUser]);

  // Apply a new session (or null) to state. Stable across renders.
  const applySession = useCallback(async (nextSession: Session | null, reason: string): Promise<void> => {
    console.log('[auth] applySession:', { reason, hasSession: !!nextSession, user_email: nextSession?.user.email });
    if (!nextSession) {
      setSession(null);
      setUser(null, 'apply-session-null');
      userCache.clear();
      clearPersistedUser();
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
        if (current) {
          lastUserIdRef.current = current.user.id;
          // If localStorage hydrated a user for a DIFFERENT account, drop it —
          // the session wins. applySession's DB fetch will populate the real row.
          if (userRef.current && userRef.current.user_id !== current.user.id) {
            console.log('[auth] mount: persisted user belongs to a different session — clearing');
            clearPersistedUser();
            setUser(null, 'mount-persisted-user-mismatch');
          }
          await applySession(current, 'mount-initial');
        } else {
          // No session — if we had a persisted user, it's stale; clear it.
          if (userRef.current) {
            console.log('[auth] mount: no session but persisted user present — clearing');
            setUser(null, 'mount-no-session');
            clearPersistedUser();
          }
        }
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

      // Token refreshes happen automatically (every hour, on focus, on network
      // resume). They never change identity. Update the session ref silently
      // but do NOT refetch the profile — that's what was hanging production.
      if (event === 'TOKEN_REFRESHED') {
        if (newSession) {
          setSession(newSession);
          sessionRef.current = newSession;
        }
        return;
      }

      // USER_UPDATED and PASSWORD_RECOVERY (outside reset-URL flow) do not
      // change identity either. Update session, skip profile refetch.
      if (event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        if (newSession) {
          setSession(newSession);
          sessionRef.current = newSession;
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        lastUserIdRef.current = null;
        await applySession(null, 'signed-out-event');
        router.push('/login');
        return;
      }

      // INITIAL_SESSION / SIGNED_IN: only refetch profile if user_id actually changed
      const newUserId = newSession?.user?.id ?? null;
      if (newUserId && newUserId === lastUserIdRef.current) {
        console.log('[auth] onAuthStateChange: same user_id — updating session only, skipping profile refetch');
        if (newSession) {
          setSession(newSession);
          sessionRef.current = newSession;
        }
        return;
      }
      lastUserIdRef.current = newUserId;

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

  // Visibility handler: ONLY updates the isTabActive flag for UI purposes.
  // We DO NOT call checkAuth/getSession/fetchUserDetails here. Supabase's
  // autoRefreshToken already handles token rotation on focus internally;
  // duplicating that work was one of the sources of the production hang.
  useEffect(() => {
    const onVisibilityChange = () => {
      setIsTabActive(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // STUCK-LOADING safety net: if the loading flag stays true for >12 seconds
  // (e.g. initial getSession hung and the 15s fetch timeout hasn't fired yet),
  // force-release it so the app renders. Components that gate on `user` will
  // render whatever last-known state exists (or redirect to /login).
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      console.error('[auth] STUCK-LOADING safety net firing — releasing loading');
      setLoading(false);
    }, 12000);
    return () => clearTimeout(t);
  }, [loading]);

  const login = (token: string) => {
    localStorage.setItem('token', token);
    void checkAuth();
    router.push('/orders');
  };

  const logout = useCallback(async () => {
    console.log('[auth] logout: starting');
    if (userRef.current?.user_id) userCache.delete(userRef.current.user_id);
    // Clear local state FIRST so the UI flips immediately, even before the
    // network round-trip — the user should not see themselves as still logged
    // in while a hung signOut call resolves. A successful signOut on the
    // server will also fire SIGNED_OUT which is a no-op here.
    clearPersistedUser();

    // 8s hard timeout on the network round-trip. If signOut hangs, we still
    // redirect — the user must always be able to escape. The Supabase call
    // itself isn't abort-aware, but window.location.href below replaces the
    // document so any in-flight promise is discarded on navigation.
    const timer = setTimeout(() => {
      console.warn('[auth] logout: 8s timeout — forcing navigation to /login');
      window.location.href = '/login';
    }, 8000);

    try {
      await supabase.auth.signOut();
      console.log('[auth] logout: signOut resolved');
    } catch (err) {
      console.warn('[auth] logout: signOut threw', err);
    } finally {
      clearTimeout(timer);
      // Always leave the app even on success; SIGNED_OUT listener may race
      // with this and either path lands us on /login.
      window.location.href = '/login';
    }
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
