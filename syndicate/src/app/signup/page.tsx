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
  const [companyName, setCompanyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleSignup = async () => {
    setMessage(''); // Clear previous messages

    // 1. Check Invite Code (Keep this)
    const { data: invite, error: inviteError } = await supabase
      .from('invitation_codes')
      .select('invite_id') // Only need to know if it exists and is valid
      .eq('code', inviteCode)
      .eq('expired', false)
      .is('used_by_user_id', null)
      .single();

    if (inviteError || !invite) {
      console.error('Error fetching or validating invite code:', inviteError);
      setMessage('Invalid, expired, or already used invitation code.');
      return;
    }

    // 2. Sign up the user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Consider enabling email verification
        // emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (authError || !authData.user) {
      setMessage(authError?.message || 'Signup failed during authentication.');
      return;
    }

    // 3. Call the RPC function to create company, user profile, and update invite
    // Note: Assumes you will create this SQL function in your Supabase dashboard
    const { error: rpcError } = await supabase.rpc('handle_new_user_signup', [
        authData.user.id, // p_user_id (UUID)
        email,            // p_email (TEXT)
        firstname,        // p_firstname (TEXT)
        lastname,         // p_lastname (TEXT)
        companyName,      // p_company_name (TEXT)
        inviteCode        // p_invite_code (TEXT)
    ]);


    if (rpcError) {
        // IMPORTANT: Consider how to handle cleanup if RPC fails after auth user is created.
        // This might involve a backend process or manual cleanup.
        // Example (requires admin privileges, best in a separate function/trigger):
        // try { await supabase.auth.admin.deleteUser(authData.user.id); } catch (e) { console.error("Failed to delete auth user after RPC error:", e); }
        console.error("RPC Error:", rpcError);
        setMessage(`Signup failed after authentication: ${rpcError.message}. Please contact support.`);
        return;
    }


    // If signup and RPC succeed
    setMessage('Account created successfully! Please check your email to verify your account if required, then log in.');
    // Redirect only after success, maybe conditionally based on email verification requirement
    // router.push('/login');

    // Old logic removed:
    // const hashedPassword = await bcrypt.hash(password, 10); <-- Removed (Auth handles hashing)
    // const { data: companyData, error: companyError } = ... <-- Removed (Handled by RPC)
    // const { error: userError } = await supabase.from('users').insert({...}) <-- Removed (Handled by RPC)
    // const { error: updateError } = await supabase.from('invitation_codes').update({...}) <-- Removed (Handled by RPC)
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080808] p-4">
      <div className="card">
        <h1 className="text-2xl font-bold text-[#ffffff] text-center">Sign Up</h1>
        <div className="">
          {/* Flex container for First name and Last name */}
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
          <h3 className="input-label">Company name</h3>
          <Input
            type="text"
            placeholder="Enter company name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mb-3 border-[#A7A7A7] text-[#FFFFFF] placeholder:text-[#A7A7A7]"
          />
          {/* Divider Line */}
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