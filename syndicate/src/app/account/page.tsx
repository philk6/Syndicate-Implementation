'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import bcrypt from 'bcryptjs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, Plus } from 'lucide-react';
import { debounce } from 'lodash';

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
      .eq('email', user?.email)
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
  }, [user?.email]);

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
        .eq('email', user?.email);

      if (userError) {
        console.error('Error updating user:', userError);
        // Rollback optimistic update
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
      // Rollback optimistic update
      setUserInfo(previousUserInfo);
      setMessage('An unexpected error occurred');
    }

    setLoading(false);
  }, [userInfo, password, user?.email]);

  // Memoized function to update company information
  const handleCompanyUpdate = useCallback(async () => {
    if (!userInfo || !companyInfo) return;
    if (!companyInfo.name || !companyInfo.email) {
      setMessage('Company name and email are required');
      return;
    }

    setLoading(true);
    setMessage('');

    // Save previous state for rollback if needed
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
        const { error: companyError } = await supabase
          .from('company')
          .update({
            name: companyInfo.name,
            email: companyInfo.email,
          })
          .eq('company_id', userInfo.company_id);

        if (companyError) {
          console.error('Error updating company:', companyError);
          // Rollback optimistic update
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
          // Rollback optimistic update
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
      // Rollback optimistic update
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

  // Fix debounced handlers with proper function implementation
  const debouncedSetUserInfo = useCallback((fieldName: string, value: string) => {
    const updateFn = (field: string, val: string) => {
      setUserInfo(prev => prev ? { ...prev, [field]: val } : null);
    };
    debounce(updateFn, 300)(fieldName, value);
  }, []);

  const debouncedSetCompanyInfo = useCallback((fieldName: string, value: string) => {
    const updateFn = (field: string, val: string) => {
      setCompanyInfo(prev => ({ ...prev, [field]: val }));
    };
    debounce(updateFn, 300)(fieldName, value);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-8">
        <h1 className="text-3xl font-bold text-[#bfbfbf] text-center">Account Settings</h1>

        {/* User Info Card */}
        <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
          <CardHeader>
            <CardTitle className="text-gray-300">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstname" className="text-gray-300">First Name</Label>
                <Input
                  id="firstname"
                  value={userInfo?.firstname || ''}
                  onChange={(e) => debouncedSetUserInfo('firstname', e.target.value)}
                  className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                />
              </div>
              <div>
                <Label htmlFor="lastname" className="text-gray-300">Last Name</Label>
                <Input
                  id="lastname"
                  value={userInfo?.lastname || ''}
                  onChange={(e) => debouncedSetUserInfo('lastname', e.target.value)}
                  className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={userInfo?.email || ''}
                onChange={(e) => debouncedSetUserInfo('email', e.target.value)}
                className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-gray-300">New Password (leave blank to keep current)</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
              />
            </div>
            <Button
              onClick={handleUserUpdate}
              disabled={loading}
              className="w-full bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
            >
              Save Personal Info
            </Button>
          </CardContent>
        </Card>

        {/* Company Info Card */}
        <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
          <CardHeader>
            <CardTitle className="text-gray-300">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="companyName" className="text-gray-300">Company Name</Label>
              <Input
                id="companyName"
                value={companyInfo.name}
                onChange={(e) => debouncedSetCompanyInfo('name', e.target.value)}
                className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
              />
            </div>
            <div>
              <Label htmlFor="companyEmail" className="text-gray-300">Company Email</Label>
              <Input
                id="companyEmail"
                type="email"
                value={companyInfo.email}
                onChange={(e) => debouncedSetCompanyInfo('email', e.target.value)}
                className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
              />
            </div>
            <Button
              onClick={handleCompanyUpdate}
              disabled={loading}
              className="w-full bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
            >
              {userInfo && userInfo.company_id ? 'Save Company Info' : 'Add Company'}
            </Button>
          </CardContent>
        </Card>

        {/* Invite Code Card */}
        {userInfo?.company_id && (
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Invite to Company</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={generateInviteCode}
                disabled={loading}
                className="w-full bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Generate Invite Code
              </Button>
              {inviteCode && (
                <Alert className="bg-[#235c12] text-[#bfbfbf]">
                  <Check className="h-4 w-4 text-[#bfbfbf]" />
                  <AlertTitle>New Invite Code</AlertTitle>
                  <AlertDescription>
                    <span className="font-mono text-lg">{inviteCode}</span>
                    <p className="mt-1">Share this code to invite users to your company.</p>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Message */}
        {message && (
          <p
            className={`text-center text-sm ${
              message.includes('successfully') ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}