'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";

export default function SignupPage() {
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleSignup = async () => {
    setMessage('');

    const { data: invite, error: inviteError } = await supabase
      .from('invitation_codes')
      .select('invite_id, invited_to_company')
      .eq('code', inviteCode)
      .eq('expired', false)
      .is('used_by_user_id', null)
      .single();

    if (inviteError || !invite) {
      console.error('Error fetching invite code:', inviteError);
      setMessage('Invalid, expired, or already used invitation code.');
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (authError || !authData.user) {
      setMessage(authError?.message || 'Signup failed during authentication.');
      return;
    }

    const { error: rpcError } = await supabase.rpc('handle_new_user_signup', {
      p_user_id_text: authData.user.id,
      p_email: email,
      p_firstname: firstname,
      p_lastname: lastname,
      p_invite_code: inviteCode,
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      setMessage(`Signup failed: ${rpcError.message}. Please try again or contact support.`);
      try {
        await fetch('/api/cleanup_orphaned_user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: authData.user.id }),
        });
      } catch (e) {
        console.error('Cleanup failed:', e);
      }
      return;
    }

    setMessage('Account created successfully! Please check your email to verify your account, then log in.');
    setTimeout(() => router.push('/login'), 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080808] p-4">
      <div className="card">
        <h1 className="text-2xl font-bold text-[#ffffff] text-center">Sign Up</h1>
        <div className="">
          <div className="flex flex-col sm:flex-row gap-4 mb-3">
            <div className="flex-1">
              <h3 className="input-label">First name</h3>
              <Input
                type="text"
                placeholder="Enter first name"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                className="border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
              />
            </div>
            <div className="flex-1">
              <h3 className="input-label">Last name</h3>
              <Input
                type="text"
                placeholder="Enter last name"
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className="border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
              />
            </div>
          </div>
          <h3 className="input-label">Email</h3>
          <Input
            type="email"
            placeholder="Enter email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-3 border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
          />
          <h3 className="input-label">Password</h3>
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-3 border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
          />
          <div className="border-t border-[#a7a7a7] my-4 mt-8"></div>
          <div className="text-center">
            <h3 className="input-label">Enter your invitation code</h3>
          </div>
          <div className="flex justify-center mb-4">
            <InputOTP
              maxLength={5}
              value={inviteCode}
              onChange={(value) => setInviteCode(value)}
              pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
              className="mb-8"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="border-[#A7A7A7] text-[#FFFFFF]" />
                <InputOTPSlot index={1} className="border-[#A7A7A7] text-[#FFFFFF]" />
                <InputOTPSlot index={2} className="border-[#A7A7A7] text-[#FFFFFF]" />
                <InputOTPSlot index={3} className="border-[#A7A7A7] text-[#FFFFFF]" />
                <InputOTPSlot index={4} className="border-[#A7A7A7] text-[#FFFFFF]" />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button onClick={handleSignup} className="button">
            Sign Up
          </Button>
          <p className="text-center text-sm text-[#A7A7A7]">
            Already have an account?{' '}
            <a href="/login" className="text-[#c8aa64] hover:text-[#d3bb82] underline">
              Login
            </a>
          </p>
          {message && (
            <p
              className={`text-center text-sm ${
                message.includes('successful') ? 'text-green-400' : 'text-red-400'
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