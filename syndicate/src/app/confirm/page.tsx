'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

import { GlassCard } from '@/components/ui/glass-card';
import { MailCheck, AlertCircle, RefreshCw } from 'lucide-react';

function ConfirmEmailComponent() {
  const [message, setMessage] = useState('Confirming your email...');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function confirmEmail() {
      const token = searchParams.get('token');
      const email = searchParams.get('email');

      if (!token || !email) {
        setError('Invalid or missing confirmation token or email.');
        setMessage('');
        return;
      }

      // Confirm the email using Supabase
      const { error } = await supabase.auth.verifyOtp({
        token,
        email,
        type: 'signup',
      });

      if (error) {
        setError(`Failed to confirm email: ${error.message}`);
        setMessage('');
        return;
      }

      setMessage('Your email has been successfully confirmed!');
      setError(null);
    }

    confirmEmail();
  }, [searchParams]);

  const handleLoginRedirect = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
      <div className="w-full max-w-[420px] z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-t from-amber-700/20 to-amber-500/10 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/20 shadow-xl shadow-amber-900/10">
            {error ? (
              <AlertCircle className="w-8 h-8 text-rose-500" />
            ) : (
              <MailCheck className="w-8 h-8 text-amber-500" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight text-center">
            {error ? 'Verification Alert' : 'Email Verified'}
          </h1>
          <p className="text-neutral-500 mt-2 text-center text-sm font-medium leading-relaxed max-w-[280px]">
            {error ? 'There was a problem confirming your identity' : 'Your account has been officially activated'}
          </p>
        </div>

        <GlassCard className="p-8">
          <div className="space-y-6">
            {message && !error && (
              <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center">
                <p className="text-emerald-400 font-bold text-sm">{message}</p>
                <p className="text-emerald-400/60 text-[10px] mt-2 font-mono uppercase tracking-widest">
                  Secure Identity Validated
                </p>
              </div>
            )}

            {error && (
              <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center">
                <p className="text-rose-400 font-bold text-sm leading-relaxed">{error}</p>
              </div>
            )}

            {message && !error ? (
              <Button
                onClick={handleLoginRedirect}
                className="w-full h-12 bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 rounded-xl tracking-wide transition-all duration-300 active:scale-[0.98]"
              >
                Proceed to Dashboard
              </Button>
            ) : error ? (
              <Button
                onClick={() => router.push('/signup')}
                className="w-full h-12 bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 rounded-xl transition-all duration-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Try Signing Up Again
              </Button>
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="w-8 h-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
                <p className="text-neutral-500 text-sm font-medium animate-pulse">{message}</p>
              </div>
            )}

            <button
              onClick={() => router.push('/login')}
              className="text-neutral-500 hover:text-white transition-colors text-sm flex items-center justify-center w-full group mt-2"
            >
              Sign in anyway
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    }>
      <ConfirmEmailComponent />
    </Suspense>
  );
}