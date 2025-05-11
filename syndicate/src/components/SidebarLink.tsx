'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// supabase direct import no longer needed here if useAuth provides all session info
// import { supabase } from '@lib/supabase/client'; 
import { useState } from 'react';
import { useAuth } from '@lib/auth'; // Import the refactored useAuth

interface SidebarLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  isActive?: boolean;
}

export default function SidebarLink({ href, children, className, isActive }: SidebarLinkProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false); // Local loading state for the link itself
  const { session, isAuthenticated, loading: authLoading } = useAuth(); // Get auth state from context

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log(`SidebarLink: handleClick for ${href}. Auth loading: ${authLoading}, isAuthenticated: ${isAuthenticated}`);

      if (authLoading) {
        console.log('SidebarLink: Auth context is loading. Preventing navigation for now.');
        // User might need to click again, or we could implement a retry/toast.
        // For now, we simply don't navigate if the global auth state is still resolving.
        setIsLoading(false);
        return;
      }

      if (isAuthenticated && session) {
        const expiresAt = session.expires_at;
        const currentTime = Math.floor(Date.now() / 1000);

        if (expiresAt && currentTime < expiresAt) {
          console.log(`SidebarLink: Session from context is valid (expires at ${new Date(expiresAt * 1000).toISOString()}). Navigating to ${href}`);
          router.push(href);
          // setIsLoading(false) will be handled by finally, or component unmounts
        } else {
          if (expiresAt) {
            console.log(`SidebarLink: Session from context found but expired at ${new Date(expiresAt * 1000).toISOString()}. Redirecting to login.`);
          } else {
            console.log('SidebarLink: Session from context found but has no expires_at. Redirecting to login.');
          }
          router.push('/login?message=session_expired_from_context');
        }
      } else {
        console.log('SidebarLink: No authenticated session from context. Redirecting to login.');
        router.push('/login?message=no_session_from_context');
      }
    } catch (err: any) {
      console.error('SidebarLink handleClick unexpected error:', err.message || err);
      // Fallback redirect in case of any other error during logic
      router.push('/login?message=unexpected_error_sidebarlink');
    } finally {
      // Ensure local loading state for the link is reset if navigation didn't occur or after it started
      // If router.push() leads to unmount, this might not execute or matter for this instance.
      // If navigation does not occur (e.g. authLoading), this is crucial.
      setIsLoading(false);
    }
  };

  return (
    <Link
      href={href} // href is still useful for right-click > open in new tab, and semantics
      onClick={handleClick}
      className={`${className} ${isActive ? 'bg-[#35353580] text-[#c8aa64]' : ''} ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
      aria-disabled={isLoading || authLoading} // Indicate disabled state if local or auth is loading
    >
      {children}
    </Link>
  );
}