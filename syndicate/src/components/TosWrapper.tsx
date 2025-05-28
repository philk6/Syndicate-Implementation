'use client';

import React, { ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import TosDialog from './TosDialog';

export default function TosWrapper({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, loading, checkAuth } = useAuth();
  const pathname = usePathname();
  const [isTosOpen, setIsTosOpen] = useState(false); // Start with false to avoid flash
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasCheckedTos, setHasCheckedTos] = useState(false);

  const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/confirm'];
  const tosExemptPaths = ['/dashboard', '/account'];
  const isPublicPath = publicPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  const isTosExemptPath = tosExemptPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));

  // Check TOS status when user data becomes available
  React.useEffect(() => {
    if (!loading && isAuthenticated && user && !hasCheckedTos && !isPublicPath && !isTosExemptPath) {
      setHasCheckedTos(true);
      // Only show TOS dialog if explicitly false (not undefined/null)
      if (user.tos_accepted === false) {
        setIsTosOpen(true);
      }
    }
  }, [loading, isAuthenticated, user, hasCheckedTos, isPublicPath, isTosExemptPath]);

  const handleTosClose = async () => {
    setIsRefreshing(true);
    setIsTosOpen(false);
    try {
    await checkAuth();
    } catch (error) {
      console.error('Error refreshing auth state:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Don't show TOS dialog if loading, not authenticated, on public paths, or TOS exempt paths
  if (loading || isRefreshing || !isAuthenticated || isPublicPath || isTosExemptPath) {
    return <>{children}</>;
  }

  // Don't show TOS dialog if user has accepted or if we haven't checked yet
  if (user?.tos_accepted !== false) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <TosDialog isOpen={isTosOpen} onClose={handleTosClose} />
    </>
  );
}