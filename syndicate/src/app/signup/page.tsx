'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";

import { GlassCard } from '@/components/ui/glass-card';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { User, Mail, Lock, Ticket, ArrowLeft } from 'lucide-react';

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
    setTimeout(() => router.push('/login'), 1500);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-transparent relative">
      <div className="w-full max-w-[520px] z-10 py-12">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-t from-amber-700/20 to-amber-500/10 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/20 shadow-xl shadow-amber-900/10">
            <Image src="/syndicate_logo.jpeg" alt="Logo" width={519} height={519} className="w-12 h-12 rounded-xl object-cover mix-blend-lighten" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight text-center">Join the Syndicate</h1>
          <p className="text-neutral-500 mt-2 text-center text-sm font-medium">Create your collaborative buying account</p>
        </div>

        <GlassCard className="p-8">
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstname" className="text-neutral-400 font-medium ml-1 flex items-center">
                  <User className="w-3 h-3 mr-1.5 text-neutral-600" /> First Name
                </Label>
                <Input
                  id="firstname"
                  type="text"
                  placeholder="John"
                  value={firstname}
                  onChange={(e) => setFirstname(e.target.value)}
                  className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-11 rounded-xl transition-all"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname" className="text-neutral-400 font-medium ml-1 flex items-center">
                  <User className="w-3 h-3 mr-1.5 text-neutral-600" /> Last Name
                </Label>
                <Input
                  id="lastname"
                  type="text"
                  placeholder="Doe"
                  value={lastname}
                  onChange={(e) => setLastname(e.target.value)}
                  className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-11 rounded-xl transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-400 font-medium ml-1 flex items-center">
                <Mail className="w-3 h-3 mr-1.5 text-neutral-600" /> Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-11 rounded-xl transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-neutral-400 font-medium ml-1 flex items-center">
                <Lock className="w-3 h-3 mr-1.5 text-neutral-600" /> Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white placeholder:text-neutral-600 focus:ring-amber-500/50 h-11 rounded-xl transition-all"
              />
            </div>

            <div className="pt-4 border-t border-white/[0.05] space-y-4">
              <div className="text-center space-y-2">
                <Label className="text-neutral-400 font-medium flex items-center justify-center">
                  <Ticket className="w-3 h-3 mr-1.5 text-amber-500/50" /> Invitation Required
                </Label>
                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Enter your 5-digit code below</p>
              </div>

              <div className="flex justify-center py-2">
                <InputOTP
                  maxLength={5}
                  value={inviteCode}
                  onChange={(value) => setInviteCode(value)}
                  pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                >
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="w-12 h-14 rounded-xl border-white/[0.05] bg-white/[0.02] text-xl font-bold text-amber-500 ring-offset-transparent focus:ring-amber-500/50 transition-all"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <Button
              onClick={handleSignup}
              className="w-full h-12 bg-gradient-to-t from-amber-700/50 to-amber-500/80 hover:from-amber-700/70 hover:to-amber-500 text-white border border-amber-500/20 shadow-xl shadow-amber-900/20 rounded-xl font-bold tracking-wide transition-all active:scale-[0.98] mt-4"
            >
              Initialize Account
            </Button>

            <div className="pt-2 text-center">
              <p className="text-sm text-neutral-500">
                Already part of the group?{' '}
                <a href="/login" className="text-amber-500/80 hover:text-amber-400 font-bold underline decoration-amber-500/20 underline-offset-4 transition-all">
                  Sign In
                </a>
              </p>
            </div>

            {message && (
              <div className={`p-4 rounded-xl text-xs font-semibold text-center mt-4 transition-all animate-in fade-in slide-in-from-top-2 ${message.includes('successfully')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                {message}
              </div>
            )}
          </div>
        </GlassCard>

        <a
          href="/login"
          className="mt-8 text-neutral-500 hover:text-white transition-colors text-sm flex items-center justify-center w-fit mx-auto group"
        >
          <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to welcome
        </a>
      </div>
    </div>
  );
}