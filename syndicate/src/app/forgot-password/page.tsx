'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@lib/supabase/client';
import { useAuth } from '../../../lib/auth';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#060606] p-4">
      <Image src="/syndicate_logo.jpeg" alt="Logo" width={519} height={519} className="w-32 h-auto mb-4" />
      <h1 className="text-2xl font-bold text-[#ffffff] text-center mb-6">Reset your password</h1>
      <div className="card">
        <div className="">
          <p className="text-sm text-[#bfbfbf] mb-4 text-center">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
          <h3 className="input-label">Email</h3>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input mb-6 border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
            placeholder="Enter your email address"
            disabled={isLoading}
          />
          <Button 
            onClick={handleResetPassword} 
            className="button"
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </Button>
          <Button 
            onClick={handleBackToLogin}
            className="w-full p-3 bg-transparent text-[#c8aa64] border border-[#c8aa64] rounded hover:bg-[#c8aa64] hover:text-[#242424] transition duration-200 font-semibold"
            disabled={isLoading}
          >
            Back to Login
          </Button>
          {message && (
            <p
              className={`text-center text-sm mt-4 ${
                message.includes('sent') || message.includes('check your email') 
                  ? 'text-green-400' 
                  : 'text-red-400'
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#060606]">
        <p className="text-white">Loading...</p>
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  );
}