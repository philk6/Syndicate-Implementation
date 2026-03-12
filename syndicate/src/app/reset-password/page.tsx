'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { GlassCard } from '@/components/ui/glass-card';
import { Label } from '@/components/ui/label';
import { Lock, ArrowLeft, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

function ResetPasswordContent() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const handlePasswordReset = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (accessToken && refreshToken && type === 'recovery') {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) {
            setMessage('Invalid or expired reset link. Please request a new password reset.');
            setIsValidToken(false);
          } else {
            setIsValidToken(true);
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (_error) {
          setMessage('Error processing reset link. Please try again.');
          setIsValidToken(false);
        }
      } else {
        setMessage('Invalid or missing reset token. Please request a new password reset.');
        setIsValidToken(false);
      }
    };

    if (typeof window !== 'undefined') {
      handlePasswordReset();
    }
  }, []);

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      setMessage('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setMessage(`Error updating password: ${error.message}`);
      } else {
        setMessage('Password updated successfully! Redirecting to login...');
        await supabase.auth.signOut();
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (_error) {
      setMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    router.push('/login');
  };

  const handleRequestNewLink = () => {
    router.push('/forgot-password');
  };

  // Shared Header
  const Header = ({ title, subtitle, icon: Icon }: { title: string, subtitle: string, icon: React.ComponentType<{ className?: string }> }) => (
    <div className="flex flex-col items-center mb-10">
      <div className="w-16 h-16 bg-gradient-to-t from-amber-700/20 to-amber-500/10 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/20 shadow-xl shadow-amber-900/10">
        <Icon className="w-8 h-8 text-amber-500" />
      </div>
      <h1 className="text-3xl font-bold text-white tracking-tight text-center">{title}</h1>
      <p className="text-neutral-500 mt-2 text-center text-sm font-medium leading-relaxed max-w-[280px]">
        {subtitle}
      </p>
    </div>
  );

  if (isValidToken === null) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
        <div className="w-full max-w-[420px] z-10">
          <Header
            title="Verifying Link"
            subtitle="Please wait while we secure your entry to the platform"
            icon={ShieldCheck}
          />
          <GlassCard className="p-12 flex flex-col items-center justify-center border-amber-500/10">
            <div className="w-12 h-12 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
            <p className="text-neutral-400 font-medium animate-pulse">Authenticating tokens...</p>
          </GlassCard>
        </div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
        <div className="w-full max-w-[420px] z-10">
          <Header
            title="Expired Link"
            subtitle="This secure reset link has reached its time limit or has already been used"
            icon={AlertCircle}
          />
          <GlassCard className="p-8">
            <div className="space-y-6">
              {message && (
                <div className="p-4 rounded-xl text-xs font-semibold text-center bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  {message}
                </div>
              )}
              <Button
                onClick={handleRequestNewLink}
                className="w-full h-12 bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 rounded-xl tracking-wide transition-all duration-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Request New Link
              </Button>
              <button
                onClick={handleBackToLogin}
                className="text-neutral-500 hover:text-white transition-colors text-sm flex items-center justify-center w-full group"
              >
                <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to welcome
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
      <div className="w-full max-w-[420px] z-10">
        <Header
          title="New Password"
          subtitle="Ensure your account stays protected with a strong credentials"
          icon={Lock}
        />
        <GlassCard className="p-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password" text-neutral-400 font-medium ml-1>New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-12 rounded-xl transition-all"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" text-neutral-400 font-medium ml-1>Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-12 rounded-xl transition-all"
                disabled={isLoading}
              />
            </div>

            <Button
              onClick={handleResetPassword}
              className="w-full h-12 bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 rounded-xl tracking-wide transition-all duration-300 active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                  Updating...
                </div>
              ) : 'Commit New Password'}
            </Button>

            {message && (
              <div className={`p-4 rounded-xl text-xs font-semibold text-center transition-all animate-in fade-in slide-in-from-top-2 ${message.includes('successfully')
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}