'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import bcrypt from 'bcryptjs';
import { debounce } from 'lodash';
import { Check, Plus, Shield, Building2, Mail, Lock, User } from 'lucide-react';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  DS, PageShell, PageHeader, SectionLabel, DsCard, DsButton, DsInput,
} from '@/components/ui/ds';
import { getRankProgress } from '@/lib/utils/xp';

interface UserInfo {
  firstname: string;
  lastname: string;
  email: string;
  company_id: number | null;
}

interface CompanyInfo {
  name: string;
  email: string;
}

export default function AccountPage() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({ name: '', email: '' });
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  // Memoized function to fetch user and company data
  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('firstname, lastname, email, company_id')
      .eq('user_id', user?.user_id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      setMessage('Failed to load account data');
      setLoading(false);
      return;
    }

    setUserInfo(userData);

    if (userData.company_id) {
      const { data: companyData, error: companyError } = await supabase
        .from('company')
        .select('name, email')
        .eq('company_id', userData.company_id)
        .single();

      if (companyError) {
        console.error('Error fetching company data:', companyError);
        setMessage('Failed to load company data');
      } else {
        setCompanyInfo(companyData);
      }
    } else {
      setCompanyInfo({ name: '', email: '' });
    }

    setLoading(false);
  }, [user?.user_id]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    fetchData();
  }, [isAuthenticated, authLoading, router, fetchData]);

  // Memoized function to update user information
  const handleUserUpdate = useCallback(async () => {
    if (!userInfo) return;

    setLoading(true);
    setMessage('');

    const updates: Partial<UserInfo & { password?: string }> = {
      firstname: userInfo.firstname,
      lastname: userInfo.lastname,
      email: userInfo.email,
    };

    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }

    // Optimistic UI update
    const previousUserInfo = { ...userInfo };

    try {
      const { error: userError } = await supabase
        .from('users')
        .update(updates)
        .eq('user_id', user?.user_id);

      if (userError) {
        console.error('Error updating user:', userError);
        setUserInfo(previousUserInfo);
        setMessage('Failed to update account information');
      } else {
        setMessage('Account information updated successfully');

        if (userInfo.email !== user?.email) {
          const { error: authError } = await supabase.auth.updateUser({ email: userInfo.email });
          if (authError) {
            console.error('Error updating auth email:', authError);
            setMessage('Account updated, but failed to update auth email');
          }
        }

        setPassword('');
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setUserInfo(previousUserInfo);
      setMessage('An unexpected error occurred');
    }

    setLoading(false);
  }, [userInfo, password, user?.user_id, user?.email]);

  // Memoized function to update company information
  const handleCompanyUpdate = useCallback(async () => {
    if (!userInfo) return;

    setLoading(true);
    setMessage('');

    const previousCompanyInfo = { ...companyInfo };

    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        console.error('Auth error:', authError);
        setMessage('Authentication error. Please log in again.');
        setLoading(false);
        return;
      }

      if (userInfo.company_id) {
        const updates: CompanyInfo = {
          name: companyInfo.name,
          email: companyInfo.email,
        };

        const { error: companyError } = await supabase
          .from('company')
          .update(updates)
          .eq('company_id', userInfo.company_id);

        if (companyError) {
          console.error('Error updating company:', companyError);
          setCompanyInfo(previousCompanyInfo);
          if (companyError.code === '23505') {
            setMessage('A company with this email already exists');
          } else {
            setMessage(`Failed to update company: ${companyError.message}`);
          }
        } else {
          setMessage('Company information updated successfully');
        }
      } else {
        const { data, error: companyError } = await supabase
          .rpc('create_company', {
            p_name: companyInfo.name,
            p_email: companyInfo.email,
            p_user_id: authUser.id,
          });

        if (companyError) {
          console.error('Error creating company:', companyError);
          setCompanyInfo(previousCompanyInfo);
          if (companyError.code === '23505') {
            setMessage('A company with this email already exists');
          } else {
            setMessage(`Failed to create company: ${companyError.message}`);
          }
        } else {
          const newCompanyId = data;
          const { error: userError } = await supabase
            .from('users')
            .update({ company_id: newCompanyId })
            .eq('user_id', authUser.id);

          if (userError) {
            console.error('Error linking company to user:', userError);
            setMessage(`Failed to link company: ${userError.message}`);
          } else {
            setUserInfo({ ...userInfo, company_id: newCompanyId });
            setMessage('Company created and linked successfully');
          }
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setCompanyInfo(previousCompanyInfo);
      setMessage('An unexpected error occurred');
    }

    setLoading(false);
  }, [userInfo, companyInfo]);

  // Memoized function to generate invite code
  const generateInviteCode = useCallback(async () => {
    setMessage('');
    setInviteCode(null);

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.error('Auth error:', authError);
      setMessage('Authentication error. Please try again.');
      return;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_id, company_id')
      .eq('user_id', authUser.id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user data:', userError);
      setMessage('Failed to identify current user.');
      return;
    }

    const { user_id: createdUserId, company_id: companyId } = userData;

    if (!companyId) {
      setMessage('You must be associated with a company to generate an invite code.');
      return;
    }

    const { data, error } = await supabase
      .rpc('generate_invite_code', {
        p_user_id: createdUserId,
        p_company_id: companyId,
      });

    if (error) {
      console.error('Error generating invite code:', error);
      setMessage(`Failed to generate invite code: ${error.message}`);
      return;
    }

    setInviteCode(data);
    setMessage('Invite code generated successfully!');
  }, []);

  // Debounced handler for user info
  const debouncedSetUserInfo = useCallback((fieldName: string, value: string) => {
    const updateFn = (field: string, val: string) => {
      setUserInfo(prev => prev ? { ...prev, [field]: val } : null);
    };
    debounce(updateFn, 300)(fieldName, value);
  }, []);

  if (loading) {
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated) return null;

  const avatarInitial = (userInfo?.firstname?.[0] || user?.email?.[0] || '?').toUpperCase();
  const fullName = [userInfo?.firstname, userInfo?.lastname].filter(Boolean).join(' ') || 'User';
  const rankInfo = user?.totalXp != null ? getRankProgress(user.totalXp) : null;

  return (
    <PageShell>
      <PageHeader
        label="Settings"
        title="ACCOUNT"
        subtitle={user?.email || ''}
        right={
          rankInfo && (
            <div className="flex items-center gap-3">
              <div
                className="px-3 py-1.5 rounded-xl border text-[11px] font-bold font-mono uppercase tracking-widest"
                style={{
                  backgroundColor: `${rankInfo.rank.color}1a`,
                  borderColor: `${rankInfo.rank.color}55`,
                  color: rankInfo.rank.color,
                }}
              >
                <Shield className="inline w-3 h-3 mr-1 -mt-0.5" />
                {rankInfo.rank.name}
              </div>
            </div>
          )
        }
      />

      {/* Message toast */}
      {message && (
        <div
          className="rounded-xl border px-4 py-3 text-sm font-mono"
          style={{
            backgroundColor: message.includes('successfully') ? `${DS.teal}15` : `${DS.red}15`,
            borderColor: message.includes('successfully') ? `${DS.teal}44` : `${DS.red}44`,
            color: message.includes('successfully') ? DS.teal : DS.red,
          }}
        >
          {message}
        </div>
      )}

      {/* Profile + Rank header */}
      <DsCard className="p-6">
        <div className="flex items-center gap-5">
          {/* Avatar circle */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0"
            style={{ backgroundColor: `${DS.orange}22`, color: DS.orange, border: `2px solid ${DS.orange}55` }}
          >
            {avatarInitial}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{fullName}</h2>
            <p className="text-xs text-neutral-500 font-mono">{user?.email}</p>
            {rankInfo && (
              <div className="mt-2 flex items-center gap-3">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: rankInfo.rank.color }}
                >
                  {rankInfo.rank.name}
                </span>
                <span className="text-[10px] text-neutral-500 tabular-nums">
                  {rankInfo.totalXp.toLocaleString()} XP
                </span>
                {rankInfo.nextRank && (
                  <>
                    <div className="flex-1 max-w-[140px] h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${rankInfo.progressPercent}%`,
                          backgroundColor: rankInfo.rank.color,
                          boxShadow: `0 0 8px ${rankInfo.rank.color}88`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-neutral-600 tabular-nums">
                      {rankInfo.xpToNextRank.toLocaleString()} to {rankInfo.nextRank.name}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DsCard>

      {/* Personal Information */}
      <div className="space-y-3">
        <SectionLabel accent={DS.orange}>
          <User className="w-3 h-3" /> Personal Information
        </SectionLabel>

        <DsCard className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DsInput
              label="First Name"
              value={userInfo?.firstname || ''}
              onChange={(v) => debouncedSetUserInfo('firstname', v)}
            />
            <DsInput
              label="Last Name"
              value={userInfo?.lastname || ''}
              onChange={(v) => debouncedSetUserInfo('lastname', v)}
            />
          </div>
          <DsInput
            label="Email"
            type="email"
            value={userInfo?.email || ''}
            onChange={(v) => debouncedSetUserInfo('email', v)}
          />
          <DsInput
            label="New Password (leave blank to keep current)"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Enter new password..."
          />
          <DsButton onClick={handleUserUpdate} disabled={loading} className="w-full">
            Save Personal Info
          </DsButton>
        </DsCard>
      </div>

      {/* Company Information */}
      <div className="space-y-3">
        <SectionLabel accent={DS.teal}>
          <Building2 className="w-3 h-3" /> Company Information
        </SectionLabel>

        <DsCard className="p-6 space-y-4" accent={DS.teal}>
          <DsInput
            label="Company Name"
            value={companyInfo.name}
            onChange={(v) => setCompanyInfo(prev => ({ ...prev, name: v }))}
          />
          <DsInput
            label="Company Email"
            type="email"
            value={companyInfo.email}
            onChange={(v) => setCompanyInfo(prev => ({ ...prev, email: v }))}
          />
          <DsButton onClick={handleCompanyUpdate} disabled={loading} accent={DS.teal} className="w-full">
            {userInfo && userInfo.company_id ? 'Save Company Info' : 'Add Company'}
          </DsButton>
        </DsCard>
      </div>

      {/* Invite Code */}
      {userInfo?.company_id && (
        <div className="space-y-3">
          <SectionLabel accent={DS.gold}>
            <Mail className="w-3 h-3" /> Invite to Company
          </SectionLabel>

          <DsCard className="p-6 space-y-4" accent={DS.gold}>
            <DsButton onClick={generateInviteCode} disabled={loading} accent={DS.gold} className="w-full">
              <Plus className="w-3.5 h-3.5" />
              Generate Invite Code
            </DsButton>
            {inviteCode && (
              <div
                className="rounded-xl border p-4"
                style={{ backgroundColor: `${DS.teal}10`, borderColor: `${DS.teal}44` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4" style={{ color: DS.teal }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: DS.teal }}>
                    New Invite Code
                  </span>
                </div>
                <span
                  className="block font-mono text-lg font-bold text-white tracking-wider"
                  style={{ textShadow: `0 0 12px ${DS.gold}55` }}
                >
                  {inviteCode}
                </span>
                <p className="text-[11px] mt-1" style={{ color: `${DS.teal}aa` }}>
                  Share this code to invite users to your company.
                </p>
              </div>
            )}
          </DsCard>
        </div>
      )}
    </PageShell>
  );
}
