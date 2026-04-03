'use client';
import { createContext, useState, useEffect, ReactNode, useRef, useContext, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { supabase } from '@lib/supabase/client';
import { Session } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';

export const userCache = new LRUCache<string, AuthUser>({ 
  max: 100, 
  ttl: 1000 * 60 * 5 // 5 minutes
});

// Minimum time between session checks (2 seconds, reduced for faster response)
const MIN_CHECK_INTERVAL = 2000;
// Time to consider tab as "inactive" (1 minute, reduced for faster detection)
const TAB_INACTIVE_THRESHOLD = 1 * 60 * 1000;

// Function to check if current URL is a password reset link
const isPasswordResetURL = () => {
  if (typeof window === 'undefined') return false;
  // Check pathname first
  if (window.location.pathname !== '/reset-password') {
    return false;
  }
  // Then check hash parameters
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  return hashParams.get('type') === 'recovery' &&
         hashParams.has('access_token');
};

// Function to validate if user data is complete
const isUserDataComplete = (user: AuthUser | null): boolean => {
  if (!user) return false;
  
  // Check if essential fields are present - be more lenient
  const hasEssentialFields = !!(
    user.user_id && 
    user.role !== undefined
  );
  
  return hasEssentialFields;
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
  checkAuth: (isInitialLoad?: boolean) => Promise<void>;
  isTabActive: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface SupabaseSessionResponse {
  data: { session: Session | null };
  error: Error | null;
}

interface SupabaseError {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
}

interface UserDetailsResponse {
  data: AuthUser | null;
  error: SupabaseError | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isTabActive, setIsTabActive] = useState(true);
  const router: AppRouterInstance = useRouter();
  const pathname: string | null = usePathname();
  const lastCheckedRef = useRef<number>(0);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionCheckAbortControllerRef = useRef<AbortController | null>(null);
  const tabBecameInactiveAtRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  const isFetchingUserDetailsRef = useRef<boolean>(false);

  useEffect(() => {
    setIsAuthenticated(!!session);
    
    // Validate user data completeness when session or user changes
    if (session && user) {
      console.log('Auth provider validating user data:', user);
      const isComplete = isUserDataComplete(user);
      console.log('User data complete?', isComplete);
      
      if (!isComplete) {
        console.warn('Incomplete user data detected:', user);
        console.warn('Forcing logout due to incomplete data');
        setTimeout(async () => {
          await supabase.auth.signOut();
        }, 100);
      }
    }
  }, [session, user]);

  const fetchUserDetails = useCallback(async (email: string, currentSession: Session, signal?: AbortSignal, retryCount = 0) => {
    if (isFetchingUserDetailsRef.current && retryCount === 0) {
      console.log('fetchUserDetails: Already fetching, skipping new request unless retry.');
      return;
    }
    isFetchingUserDetailsRef.current = true;

    console.log('fetchUserDetails called for:', email, 'retry count:', retryCount);
    const userId = currentSession.user.id;
    console.log('User ID:', userId);
    
    const cachedUser = userCache.get(userId);
    if (cachedUser) {
      console.log('Using cached user:', cachedUser);
      setUser(cachedUser);
      localStorage.setItem('token', currentSession.access_token);
      isFetchingUserDetailsRef.current = false;
      return;
    }
    
    console.log('No cached user, fetching from database...');
    try {
      // Create a timeout for user details fetch
      const userDetailsPromise = async () => {
        console.log('Fetching user details from database for user_id:', userId);
        let query = supabase
          .from('users')
          .select('user_id, email, role, firstname, lastname, company_id, tos_accepted, buyersgroup')
          .eq('user_id', userId);
        
        if (signal) {
          query = query.abortSignal(signal);
        }
        
        const result = await query.single();
        console.log('Database query result:', result);

        // Fetch total XP alongside user data
        let totalXp = 0;
        try {
          const { data: xpRows } = await supabase
            .from('xp_transactions')
            .select('amount')
            .eq('user_id', userId);
          if (xpRows) {
            totalXp = xpRows.reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);
          }
        } catch {
          console.warn('Failed to fetch XP, defaulting to 0');
        }

        return { ...result, totalXp };
      };

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('User details fetch timeout')), 5000)
      );

      const fetchResult = await Promise.race([
        userDetailsPromise(),
        timeoutPromise
      ]) as UserDetailsResponse & { totalXp: number };

      const { data: userData, error: userError, totalXp } = fetchResult;
      
      if (signal?.aborted) {
        isFetchingUserDetailsRef.current = false;
        return;
      }
      
      if (userError) {
        console.error('Error fetching user data:', userError);
        console.error('User error details:', { code: userError.code, message: userError.message, details: userError.details });
        
        // Check if we already have a user object with role information
        if (user && user.role && user.role !== 'user') {
          console.log('Keeping existing user object with role:', user.role);
          isFetchingUserDetailsRef.current = false;
          // Don't overwrite existing user data if we already have role info
          return;
        }
        
        // Don't force logout immediately, create a minimal user object
        console.log('User data fetch failed, creating minimal user object');
        const minimalUser: AuthUser = {
          user_id: currentSession.user.id,
          email: currentSession.user.email || '',
          role: 'user', // This will be updated if database fetch succeeds later
          tos_accepted: true,
          buyersgroup: false,
          totalXp: 0
        };
        setUser(minimalUser);
        localStorage.setItem('token', currentSession.access_token);
        isFetchingUserDetailsRef.current = false;
        return;
      } else {
        console.log('User data fetched successfully:', userData);
        const userWithId = { ...userData, email: userData?.email || currentSession.user.email || '', user_id: userData?.user_id || currentSession.user.id, totalXp };
        userCache.set(userId, userWithId as AuthUser);
        console.log('Updating user with full database data:', userWithId);
        setUser(userWithId as AuthUser);
        localStorage.setItem('token', currentSession.access_token);
      }
    } catch (e) {
      if (signal?.aborted) {
        isFetchingUserDetailsRef.current = false;
        return;
      }
      console.error('Exception fetching user data:', e);
      
      // Retry once if this is the first attempt
      if (retryCount === 0) {
        console.log('Retrying user details fetch...');
        setTimeout(() => {
          fetchUserDetails(email, currentSession, signal, retryCount + 1);
        }, 1000);
        return;
      }
      
      // If retry failed, create minimal user object instead of clearing everything
      console.log('User details fetch failed after retry, creating minimal user object');
      const minimalUser: AuthUser = {
        user_id: currentSession.user.id,
        email: currentSession.user.email || '',
        role: 'user',
        tos_accepted: true,
        buyersgroup: false,
        totalXp: 0
      };
      setUser(minimalUser);
      localStorage.setItem('token', currentSession.access_token);
    } finally {
      isFetchingUserDetailsRef.current = false;
    }
  }, [setUser, user]);

  const checkAuth = useCallback(async (isInitialLoad = false) => {
    // Cancel any ongoing session check
    if (sessionCheckAbortControllerRef.current) {
      sessionCheckAbortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    sessionCheckAbortControllerRef.current = abortController;
    
    if (isInitialLoad) setLoading(true);
    
    try {
      // First, quickly check if we have a cached session and if it's expired
      const cachedSession = session;
      if (cachedSession?.expires_at) {
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime >= cachedSession.expires_at) {
          console.log('AuthProvider: Cached session expired, clearing immediately');
          setSession(null);
          setUser(null);
          localStorage.removeItem('token');
          if (isInitialLoad) setLoading(false);
          return;
        } else if (currentTime < cachedSession.expires_at - 300) { // If session has more than 5 minutes left
          console.log('AuthProvider: Cached session still valid, skipping network check');
          if (isInitialLoad) setLoading(false);
          lastCheckedRef.current = Date.now();
          return;
        }
      }

      // Add timeout to session check with shorter timeout for non-initial loads
      const timeoutDuration = isInitialLoad ? 5000 : 3000;
      const sessionCheckPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout')), timeoutDuration)
      );
      
      const { data: { session: currentSession }, error } = await Promise.race([
        sessionCheckPromise,
        timeoutPromise
      ]) as SupabaseSessionResponse;
      
      if (abortController.signal.aborted) return;
      
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
          console.log('Setting session:', currentSession);
          setSession(currentSession);
          
          // Try to fetch full user details first
          if (currentSession.user.email && !isFetchingUserDetailsRef.current) {
            console.log('checkAuth: Fetching full user details for:', currentSession.user.email);
            await fetchUserDetails(currentSession.user.email, currentSession);
          } else if (!isFetchingUserDetailsRef.current) {
            // Immediately create a minimal user object from session data, but don't overwrite admin
            if (!user || user.role !== 'admin') {
              const minimalUser: AuthUser = {
                user_id: currentSession.user.id,
                email: currentSession.user.email || '',
                role: 'user', // Default role, will be updated if database fetch succeeds
                tos_accepted: true, // Default to true, will be updated if database fetch succeeds
                buyersgroup: false,
                totalXp: 0
              };
              console.log('checkAuth: Setting minimal user from session (not admin, not fetching):', minimalUser);
              setUser(minimalUser);
            } else {
              console.log('checkAuth: Keeping existing admin user from session check (not fetching)');
            }
          }
          localStorage.setItem('token', currentSession.access_token);
        }
      } else {
        console.log('AuthProvider: No session found, clearing state');
        setSession(null);
        setUser(null);
        localStorage.removeItem('token');
      }
      
      // Reset retry count on successful check
      retryCountRef.current = 0;
    } catch (error) {
      if (abortController.signal.aborted) return;
      
      console.error('Error checking auth:', error);
      
      // For timeout errors, don't retry - just clear session and redirect
      if ((error as Error).message.includes('timeout')) {
        console.log('AuthProvider: Session check timed out, clearing session');
        setSession(null);
        setUser(null);
        localStorage.removeItem('token');
      } else {
        // For other errors, implement retry logic but with fewer attempts
        if (retryCountRef.current < 1) {
          retryCountRef.current++;
          console.log(`Retrying session check (attempt ${retryCountRef.current})`);
          setTimeout(() => checkAuth(isInitialLoad), 1000);
          return;
        } else {
          console.log('AuthProvider: Max retries reached, clearing session');
          setSession(null);
          setUser(null);
          localStorage.removeItem('token');
        }
      }
    } finally {
      if (isInitialLoad) setLoading(false);
      lastCheckedRef.current = Date.now();
      sessionCheckAbortControllerRef.current = null;
    }
  }, [fetchUserDetails, setSession, setUser, setLoading, session, user]);

  useEffect(() => {
    // Skip initial auth check if this is a password reset URL
    if (isPasswordResetURL()) {
      console.log('AuthProvider: Skipping initial auth check for password reset URL');
      setLoading(false);
      return;
    }
    
    checkAuth(true); // Initial check on mount

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const onResetPageCurrently = isPasswordResetURL(); // Capture current state at event time
      console.log('AuthProvider onAuthStateChange: event=', event, 'session=', newSession, 'onResetPage=', onResetPageCurrently);

      setLoading(true); // Set loading true at the start of handling any auth event.

      try {
        if (onResetPageCurrently) {
          // Handle events specifically for the reset password page
          if (event === 'SIGNED_OUT') {
            console.log('AuthProvider: Ignoring SIGNED_OUT on password reset page (after password update).');
            // Session will be null, user will be null. setLoading(false) handled in finally.
            return; // Don't process further.
          } else if (newSession && (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED' || event === 'SIGNED_IN')) {
            console.log(`AuthProvider: Event ${event} on reset page. Setting session, but SKIPPING fetchUserDetails.`);
            setSession(newSession);
            setUser(null); // Ensure user is null or minimal as full details are not (and should not be) fetched here.
            // setLoading(false) will be handled by finally.
            return; // Do not fall through to general handling that might call fetchUserDetails.
          }
          // If other events occur on reset page that are not handled above, they will fall through.
          // However, the main concern is preventing fetchUserDetails after setSession from recovery.
        }

        // General event handling (when not on reset page, or if an unhandled event occurs on reset page and falls through)
        if (event === 'SIGNED_IN' && newSession) {
          console.log('AuthProvider: User signed in (general case)');
          setSession(newSession);
          retryCountRef.current = 0;
          lastCheckedRef.current = Date.now();
          
          if (newSession.user.email) {
            await fetchUserDetails(newSession.user.email, newSession);
          } else if (!isFetchingUserDetailsRef.current) {
            if (!user || user.role !== 'admin') {
              const minimalUser: AuthUser = {
                user_id: newSession.user.id,
                email: newSession.user.email || '',
                role: 'user',
                tos_accepted: true,
                buyersgroup: false,
                totalXp: 0
              };
              console.log('SIGNED_IN: Setting minimal user object (no email, not fetching, not admin):', minimalUser);
              setUser(minimalUser);
            } else {
              console.log('SIGNED_IN: Keeping existing admin user (no email, not fetching)');
            }
          }
          localStorage.setItem('token', newSession.access_token);
        } else if (event === 'SIGNED_OUT' /* && !onResetPageCurrently is implicit here due to above block */) {
          console.log('AuthProvider: User signed out (general case)');
          setSession(null);
          setUser(null);
          userCache.clear();
          localStorage.removeItem('token');
          router.push('/login');
        } else if (event === 'TOKEN_REFRESHED' && newSession) {
          console.log('AuthProvider: Token refreshed');
          setSession(newSession);
          lastCheckedRef.current = Date.now();
          
          if (newSession.user.email) {
            if (!user || user.email !== newSession.user.email || !isUserDataComplete(user)) {
              await fetchUserDetails(newSession.user.email, newSession);
            }
          } else {
            // If token refreshed but no email (e.g. phone auth), clear user if not already minimal
             if (user && user.email) setUser(null); // Or handle as per app's logic for email-less users
            localStorage.removeItem('token'); // Or update token if app uses it differently here
          }
        } else if (event === 'USER_UPDATED' && newSession /* && !onResetPageCurrently is implicit */) {
          console.log('AuthProvider: User updated (general case)');
          setSession(newSession);
          if (newSession.user.email) {
            await fetchUserDetails(newSession.user.email, newSession);
          }
        } else if (event === 'PASSWORD_RECOVERY' && newSession /* && !onResetPageCurrently is implicit */) {
          console.log('AuthProvider: Password recovery event (general case - not on reset page)');
          // This event type means the user has initiated password recovery.
          // The session might be set to allow password update.
          setSession(newSession);
          // Generally, do not fetch user details here. User is in a recovery flow.
        }
      } catch (error) {
        console.error('AuthProvider: Error in auth state change handler:', error);
      } finally {
        setLoading(false); // Ensure loading is always set to false after processing an event.
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAuth, router, user, fetchUserDetails, pathname]); // Added pathname to ensure useEffect re-evaluates if path changes, for console logs.

  // Proactive session refresh - reduced interval and improved error handling
  useEffect(() => {
    if (!session || loading) return;

    const refreshInterval = setInterval(async () => {
      console.log('AuthProvider: Proactively attempting to refresh session');
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
          console.error('AuthProvider: Error refreshing session proactively:', error.message);
          // If refresh fails, check auth to handle expired session
          if (error.message.includes('refresh_token_not_found') || error.message.includes('invalid_grant')) {
            await checkAuth();
          }
        } else {
          console.log('AuthProvider: Session proactively refreshed', data.session ? data.session.expires_at : 'no session data');
        }
      } catch (error) {
        console.error('AuthProvider: Exception during proactive refresh:', error);
      }
    }, 8 * 60 * 1000); // Reduced from 10 minutes to 8 minutes

    return () => clearInterval(refreshInterval);
  }, [session, loading, checkAuth]);

  // Enhanced visibility change handling
  useEffect(() => {
    const handleVisibilityChange = async () => {
      const now = Date.now();
      
      if (document.visibilityState === 'visible') {
        setIsTabActive(true);
        console.log('AuthProvider onVisibilityChange: Tab became visible');
        
        // Check if tab was inactive for a significant time
        const wasInactiveFor = tabBecameInactiveAtRef.current ? now - tabBecameInactiveAtRef.current : 0;
        tabBecameInactiveAtRef.current = null;
        
        // Quick local session expiry check first
        if (session?.expires_at) {
          const currentTime = Math.floor(Date.now() / 1000);
          if (currentTime >= session.expires_at) {
            console.log('AuthProvider onVisibilityChange: Session expired, clearing immediately');
            setSession(null);
            setUser(null);
            localStorage.removeItem('token');
            return;
          } else if (currentTime < session.expires_at - 300) { // If session has more than 5 minutes left
            console.log('AuthProvider onVisibilityChange: Session still valid, skipping check');
            return;
          }
        }
        
        // Skip check if too soon since last check
        if (now - lastCheckedRef.current < MIN_CHECK_INTERVAL) {
          console.log('AuthProvider onVisibilityChange: Skipping check, too soon');
          return;
        }
        
        // Force session check if tab was inactive for more than threshold
        const shouldForceCheck = wasInactiveFor > TAB_INACTIVE_THRESHOLD;
        
        if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
        
        // Immediate check for long inactive periods, delayed for short ones
        const delay = shouldForceCheck ? 50 : 300; // Reduced delays for faster response
        
        checkTimeoutRef.current = setTimeout(async () => {
          console.log(`AuthProvider: Checking session after ${wasInactiveFor}ms inactive period`);
          await checkAuth();
        }, delay);
      } else {
        setIsTabActive(false);
        tabBecameInactiveAtRef.current = now;
        console.log('AuthProvider onVisibilityChange: Tab became hidden');
        
        // Cancel any pending checks when tab becomes inactive
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
          checkTimeoutRef.current = null;
        }
      }
    };

    // Also listen for focus/blur events as backup
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        handleVisibilityChange();
      }
    };

    const handleBlur = () => {
      setIsTabActive(false);
      if (!tabBecameInactiveAtRef.current) {
        tabBecameInactiveAtRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      if (sessionCheckAbortControllerRef.current) {
        sessionCheckAbortControllerRef.current.abort();
      }
    };
  }, [checkAuth, session]);

  useEffect(() => {
    if (!loading && isAuthenticated && session) {
      const now = Date.now();
      
      // Skip check if too soon since last check
      if (now - lastCheckedRef.current < MIN_CHECK_INTERVAL) {
        console.log('AuthProvider Route change: Skipping check, too soon');
        return;
      }
      
      // Skip check if we have a valid session that's not expired
      if (session.expires_at) {
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime < session.expires_at - 60) { // Give 1 minute buffer
          console.log('AuthProvider Route change: Session still valid, skipping check');
          return;
        }
      }
      
      console.log('AuthProvider Route change: Re-checking auth for path:', pathname);
      checkAuth();
    }
  }, [pathname, checkAuth, isAuthenticated, loading, session]);

  const login = (token: string) => {
    console.warn('AuthProvider login function called. Ensure Supabase session is correctly handled.');
    localStorage.setItem('token', token);
    checkAuth();
    router.push('/orders');
  };

  const logout = async () => {
    if (user?.user_id) userCache.delete(user.user_id);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ 
      session, 
      isAuthenticated, 
      user, 
      loading, 
      login, 
      logout, 
      checkAuth,
      isTabActive 
    }}>
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