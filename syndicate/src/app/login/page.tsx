'use client';
import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@lib/supabase/client';
import { useAuth } from '../../../lib/auth';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

// Component that uses useSearchParams
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// Component that uses useSearchParams
function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState('');
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for session expired message
  useEffect(() => {
    const messageParam = searchParams.get('message');
    if (messageParam === 'session_expired') {
      setMessage('Your session has expired. Please log in again.');
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      setMessage(error?.message || 'Invalid email or password');
      return;
    }
    setMessage('Login successful! Redirecting...');
    setTimeout(() => router.push('/dashboard'), 1000);
  };

  const handleForgotPassword = () => {
    router.push('/forgot-password');
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
      <div className="w-full max-w-[420px] z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-t from-amber-700/20 to-amber-500/10 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/20 shadow-xl shadow-amber-900/10">
            <Image src="/syndicate_logo.jpeg" alt="Logo" width={519} height={519} className="w-16 h-16 rounded-xl object-cover mix-blend-lighten" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight text-center">Welcome Back</h1>
          <p className="text-neutral-500 mt-2 text-center text-sm font-medium">Continue to the Syndicate platform</p>
        </div>

        <GlassCard className="p-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-400 font-medium ml-1">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-12 rounded-xl transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <Label htmlFor="password" className="text-neutral-400 font-medium">Password</Label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-amber-500/80 hover:text-amber-400 text-xs font-semibold transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-12 rounded-xl transition-all"
              />
            </div>

            <div className="flex items-center space-x-2 px-1">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === 'indeterminate' ? false : checked)}
                className="h-4 w-4 rounded-md border-white/[0.1] bg-white/[0.02] data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
              />
              <label htmlFor="remember" className="text-xs text-neutral-500 font-medium cursor-pointer">
                Keep me signed in for 30 days
              </label>
            </div>

            <Button
              onClick={handleLogin}
              className="w-full h-12 bg-gradient-to-t from-amber-700/50 to-amber-500/80 hover:from-amber-700/70 hover:to-amber-500 text-white border border-amber-500/20 shadow-xl shadow-amber-900/20 rounded-xl font-bold tracking-wide transition-all active:scale-[0.98]"
            >
              Sign In
            </Button>

            <div className="pt-2 text-center">
              <p className="text-sm text-neutral-500">
                Don&apos;t have an account?{' '}
                <a href="/signup" className="text-amber-500/80 hover:text-amber-400 font-bold underline decoration-amber-500/20 underline-offset-4 transition-all">
                  Create Account
                </a>
              </p>
            </div>

            {message && (
              <div className={`p-4 rounded-xl text-xs font-semibold text-center mt-4 transition-all animate-in fade-in slide-in-from-top-2 ${message.includes('successful')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                {message}
              </div>
            )}
          </div>
        </GlassCard>

        <p className="mt-12 text-center text-[10px] text-neutral-600 font-semibold tracking-widest uppercase pb-6">
          &copy; 2026 Syndicate buy group. All rights Reserved.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}