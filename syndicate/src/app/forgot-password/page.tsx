'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@lib/supabase/client';
import { useAuth } from '../../../lib/auth';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Component that uses useSearchParams
import { GlassCard } from '@/components/ui/glass-card';
import { Label } from '@/components/ui/label';
import { Mail, ArrowLeft, KeyRound } from 'lucide-react';

// Component that uses useSearchParams
function ForgotPasswordContent() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  // Check for success message from URL params
  useEffect(() => {
    const success = searchParams.get('success');
    if (success === 'true') {
      setMessage('Password reset link sent! Please check your email.');
    }
  }, [searchParams]);

  const handleResetPassword = async () => {
    if (!email) {
      setMessage('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Password reset link sent! Please check your email.');
      }
    } catch {
      setMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
      <div className="w-full max-w-[420px] z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-t from-amber-700/20 to-amber-500/10 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/20 shadow-xl shadow-amber-900/10">
            <KeyRound className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight text-center">Reset Password</h1>
          <p className="text-neutral-500 mt-2 text-center text-sm font-medium leading-relaxed">
            Enter your email and we&apos;ll send you a link to recover your account
          </p>
        </div>

        <GlassCard className="p-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-400 font-medium ml-1 flex items-center">
                <Mail className="w-3 h-3 mr-1.5 text-neutral-600" /> Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-12 rounded-xl transition-all"
                disabled={isLoading}
              />
            </div>

            <Button
              onClick={handleResetPassword}
              className="w-full h-12 bg-gradient-to-t from-amber-700/50 to-amber-500/80 hover:from-amber-700/70 hover:to-amber-500 text-white border border-amber-500/20 shadow-xl shadow-amber-900/20 rounded-xl font-bold tracking-wide transition-all active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                  Sending...
                </div>
              ) : 'Send Reset Link'}
            </Button>

            <div className="pt-2 text-center">
              <button
                onClick={handleBackToLogin}
                className="text-neutral-500 hover:text-white transition-colors text-sm flex items-center justify-center w-full group"
              >
                <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to welcome
              </button>
            </div>

            {message && (
              <div className={`p-4 rounded-xl text-xs font-semibold text-center mt-4 transition-all animate-in fade-in slide-in-from-top-2 ${message.includes('sent') || message.includes('check your email')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                {message}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  );
}