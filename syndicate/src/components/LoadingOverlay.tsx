'use client';

import { useAuth } from '@lib/auth';
import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function LoadingOverlay() {
  const { loading, isTabActive, session } = useAuth();
  const [showRecovering, setShowRecovering] = useState(false);
  const [wasInactive, setWasInactive] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    if (!isTabActive) {
      setWasInactive(true);
    } else if (wasInactive && loading) {
      if (session?.expires_at) {
        const currentTime = Math.floor(Date.now() / 1000);
        setIsSessionExpired(currentTime >= session.expires_at);
      }
      setShowRecovering(true);
      const timer = setTimeout(() => setShowRecovering(false), isSessionExpired ? 1500 : 3000);
      return () => clearTimeout(timer);
    } else if (isTabActive && !loading) {
      setWasInactive(false);
      setShowRecovering(false);
      setIsSessionExpired(false);
    }
  }, [isTabActive, loading, wasInactive, session, isSessionExpired]);

  if (!loading && !showRecovering) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
} 