'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import bcrypt from 'bcryptjs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    const { data: invite, error: inviteError } = await supabase
      .from('invitation_codes')
      .select('invite_id, code, expired, used_by_user_id')
      .eq('code', inviteCode)
      .eq('expired', false)
      .is('used_by_user_id', null)
      .single();

    if (inviteError || !invite) {
      setMessage('Invalid, expired, or already used invitation code');
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (authError || !authData.user) {
      setMessage(authError?.message || 'Signup failed');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: companyData, error: companyError } = await supabase
      .from('company')
      .insert({ name: companyName, email })
      .select('company_id')
      .single();

    if (companyError || !companyData) {
      setMessage(companyError?.message || 'Failed to create company');
      return;
    }

    const { error: userError } = await supabase.from('users').insert({
      firstname,
      lastname,
      email,
      password: hashedPassword,
      company_id: companyData.company_id,
      role: 'User',
    });

    if (userError) {
      setMessage(userError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from('invitation_codes')
      .update({ expired: true, used_by_user_id: authData.user.id })
      .eq('code', inviteCode);

    if (updateError) {
      setMessage('Failed to update invitation code');
      return;
    }

    setMessage('Account created successfully! Please log in.');
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080808] p-4">
      <div className="card">
        <h1 className="text-2xl font-bold text-[#bfbfbf] text-center">Sign Up</h1>
        <div className="">
          <div className="flex gap-2">
            <div className="flex-1">
              <h3 className="input-label">First name</h3>
              <Input type='text' placeholder='Enter first name' value={firstname} onChange={(e) => setFirstname(e.target.value)} className='mb-2 border-[#A7A7A7] text-[#A7A7A7]'/>
            </div>
            <div className="flex-1">
              <h3 className="input-label">Last name</h3>
              <Input type='text' placeholder='Enter last name' value={lastname} onChange={(e) => setLastname(e.target.value)} className='mb-2 border-[#A7A7A7] text-[#A7A7A7]'/>
            </div>
          </div>
          <h3 className="input-label">Email</h3>
          <Input type='email' placeholder='Enter email address' value={email} onChange={(e) => setEmail(e.target.value)} className='mb-2 border-[#A7A7A7] text-[#A7A7A7]'/>
          <h3 className="input-label">Password</h3>
          <Input type='password' placeholder='Enter password' value={password} onChange={(e) => setPassword(e.target.value)} className='mb-2 border-[#A7A7A7] text-[#A7A7A7]'/>
          <h3 className="input-label">Company name</h3>
          <Input type='text' placeholder='Enter company name' value={companyName} onChange={(e) => setCompanyName(e.target.value)} className='mb-2 border-[#A7A7A7] text-[#A7A7A7]'/>
          <h3 className="input-label">Invite code</h3>
          <Input type='text' placeholder='Enter invite code' value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className='mb-8 border-[#A7A7A7] text-[#A7A7A7]' />
          <Button onClick={handleSignup} className="button">
            Sign Up
          </Button>
          <p className="text-center text-sm text-gray-400">
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