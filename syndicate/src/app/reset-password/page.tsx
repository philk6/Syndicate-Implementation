'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@lib/supabase/client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function ResetPasswordContent() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const handlePasswordReset = async () => {
      // Check URL hash for tokens (Supabase puts tokens in hash fragment)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      
      console.log('Password reset URL analysis:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        type: type,
        fullHash: window.location.hash
      });

      if (accessToken && refreshToken && type === 'recovery') {
        try {
          // Set the session using the tokens from the URL
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          
          if (error) {
            console.error('Error setting session:', error);
            setMessage('Invalid or expired reset link. Please request a new password reset.');
            setIsValidToken(false);
          } else {
            console.log('Session set successfully for password reset');
            setIsValidToken(true);
            // Clean up the URL hash
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (error) {
          console.error('Error handling password reset:', error);
          setMessage('Error processing reset link. Please try again.');
          setIsValidToken(false);
        }
      } else {
        console.log('No valid reset tokens found in URL');
        setMessage('Invalid or missing reset token. Please request a new password reset.');
        setIsValidToken(false);
      }
    };

    // Only run on client side
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
        console.error('Password update error:', error);
        setMessage(`Error updating password: ${error.message}`);
      } else {
        setMessage('Password updated successfully! Redirecting to login...');
        
        // Sign out the user after password reset
        await supabase.auth.signOut();
        
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (error) {
      console.error('Unexpected error during password update:', error);
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

  // Show loading state while checking token
  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#060606] p-4">
        <Image src="/syndicate_logo.jpeg" alt="Logo" width={519} height={519} className="w-32 h-auto mb-4" />
        <h1 className="text-2xl font-bold text-[#ffffff] text-center mb-6">Processing Reset Link...</h1>
        <div className="card">
          <div className="text-center">
            <p className="text-sm text-[#bfbfbf] mb-4">
              Please wait while we verify your password reset link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state for invalid token
  if (isValidToken === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#060606] p-4">
        <Image src="/syndicate_logo.jpeg" alt="Logo" width={519} height={519} className="w-32 h-auto mb-4" />
        <h1 className="text-2xl font-bold text-[#ffffff] text-center mb-6">Invalid Reset Link</h1>
        <div className="card">
          <div className="">
            <p className="text-sm text-[#bfbfbf] mb-4 text-center">
              This password reset link is invalid or has expired.
            </p>
            {message && (
              <p className="text-center text-sm mb-4 text-red-400">
                {message}
              </p>
            )}
            <Button 
              onClick={handleRequestNewLink}
              className="button"
            >
              Request New Reset Link
            </Button>
            <Button 
              onClick={handleBackToLogin}
              className="w-full p-3 bg-transparent text-[#c8aa64] border border-[#c8aa64] rounded hover:bg-[#c8aa64] hover:text-[#242424] transition duration-200 font-semibold"
            >
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show password reset form for valid token
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#060606] p-4">
      <Image src="/syndicate_logo.jpeg" alt="Logo" width={519} height={519} className="w-32 h-auto mb-4" />
      <h1 className="text-2xl font-bold text-[#ffffff] text-center mb-6">Set New Password</h1>
      <div className="card">
        <div className="">
          <p className="text-sm text-[#bfbfbf] mb-4 text-center">
            Enter your new password below.
          </p>
          <h3 className="input-label">New Password</h3>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mb-4 border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
            placeholder="Enter new password"
            disabled={isLoading}
          />
          <h3 className="input-label">Confirm Password</h3>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input mb-6 border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
            placeholder="Confirm new password"
            disabled={isLoading}
          />
          <Button 
            onClick={handleResetPassword} 
            className="button"
            disabled={isLoading}
          >
            {isLoading ? 'Updating...' : 'Update Password'}
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
                message.includes('successfully') 
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#060606]">
        <p className="text-white">Loading...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}