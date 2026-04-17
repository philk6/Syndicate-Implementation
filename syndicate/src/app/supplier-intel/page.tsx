'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';

const TOOL_URL = 'https://supplier-intel-production.up.railway.app';

export default function SupplierIntelPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const handleLoad = () => {
    setIframeLoaded(true);
    setIframeError(false);
  };

  const handleError = () => {
    setIframeError(true);
    setIframeLoaded(false);
  };

  const handleRetry = () => {
    setIframeLoaded(false);
    setIframeError(false);
    setRetryKey((k) => k + 1);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-full" style={{ backgroundColor: '#0a0a0a' }}>
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col w-full" style={{ backgroundColor: '#0a0a0a', height: '100vh' }}>
      {/* Thin top bar */}
      <div
        className="flex items-center justify-between px-4 shrink-0 border-b font-mono"
        style={{
          height: '40px',
          borderColor: 'rgba(255,255,255,0.08)',
          backgroundColor: 'rgba(10,10,15,0.9)',
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400">
          Supplier Intel
        </span>
        <a
          href={TOOL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-[#FF6B35] transition-colors"
        >
          Open in new tab
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Iframe area */}
      <div className="relative flex-1 min-h-0">
        {/* Loading overlay */}
        {!iframeLoaded && !iframeError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: '#0a0a0a' }}>
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
              Loading Supplier Intel...
            </span>
          </div>
        )}

        {/* Error state */}
        {iframeError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0a0a0a' }}>
            <div className="text-center">
              <p className="text-sm font-mono text-neutral-400 uppercase tracking-widest mb-1">
                Failed to load Supplier Intel
              </p>
              <p className="text-xs text-neutral-600 font-sans">
                The tool may be starting up or temporarily unavailable.
              </p>
            </div>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[11px] font-bold font-mono uppercase tracking-widest transition-colors cursor-pointer"
              style={{
                backgroundColor: '#FF6B351a',
                borderColor: '#FF6B35',
                color: '#FF6B35',
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        <iframe
          key={retryKey}
          src={TOOL_URL}
          onLoad={handleLoad}
          onError={handleError}
          className="w-full h-full border-0"
          style={{ display: iframeError ? 'none' : 'block' }}
          allow="clipboard-read; clipboard-write"
          title="Supplier Intel"
        />
      </div>
    </div>
  );
}
