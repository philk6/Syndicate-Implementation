'use client';

import { useAuth } from '@lib/auth';
import { useEffect, useState } from 'react';

export default function LoadingOverlay() {
  const { loading, isTabActive, session } = useAuth();
  const [showRecovering, setShowRecovering] = useState(false);
  const [wasInactive, setWasInactive] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    if (!isTabActive) {
      setWasInactive(true);
    } else if (wasInactive && loading) {
      // Check if session is expired for faster messaging
      if (session?.expires_at) {
        const currentTime = Math.floor(Date.now() / 1000);
        setIsSessionExpired(currentTime >= session.expires_at);
      }
      setShowRecovering(true);
      // Hide the recovering message after a shorter time for expired sessions
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
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 max-w-sm mx-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c8aa64] mx-auto mb-4"></div>
        <h3 className="text-white font-medium mb-2">
          {showRecovering 
            ? (isSessionExpired ? 'Session Expired' : 'Reconnecting...') 
            : 'Loading...'
          }
        </h3>
        <p className="text-gray-400 text-sm">
          {showRecovering 
            ? (isSessionExpired 
                ? 'Redirecting to login...' 
                : 'Restoring your session after tab switch'
              )
            : 'Please wait while we load your data'
          }
        </p>
      </div>
    </div>
  );
} 