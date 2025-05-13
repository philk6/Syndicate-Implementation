'use client';

import { ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import TosDialog from './TosDialog';

export default function TosWrapper({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, loading, checkAuth } = useAuth();
  const pathname = usePathname();
  const [isTosOpen, setIsTosOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const publicPaths = ['/login', '/signup', '/forgot-password', '/confirm'];
  const tosExemptPaths = ['/dashboard', '/account'];
  const isPublicPath = publicPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  const isTosExemptPath = tosExemptPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));

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

  if (loading || isRefreshing || !isAuthenticated || isPublicPath || isTosExemptPath || user?.tos_accepted) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <TosDialog isOpen={isTosOpen} onClose={handleTosClose} />
    </>
  );
}