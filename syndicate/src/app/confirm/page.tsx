'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#060606] p-4">
      <Image
        src="/syndicate_logo.jpeg"
        alt="Syndicate Logo"
        width={519}
        height={519}
        className="w-32 h-auto mb-4"
      />
      <h1 className="text-2xl font-bold text-[#ffffff] text-center mb-6">
        Email Confirmation
      </h1>
      <div className="card p-6 bg-[#1f1f1f] border-[#6a6a6a80] rounded-lg">
        {message && (
          <p className="text-center text-sm text-green-400 mb-4">{message}</p>
        )}
        {error && <p className="text-center text-sm text-red-400 mb-4">{error}</p>}
        {message && !error && (
          <Button
            onClick={handleLoginRedirect}
            className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424] w-full"
          >
            Proceed to Login
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#060606] p-4">
        <p className="text-white">Loading...</p>
      </div>
    }>
      <ConfirmEmailComponent />
    </Suspense>
  );
}