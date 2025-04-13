'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import bcrypt from 'bcryptjs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface UserInfo {
  firstname: string;
  lastname: string;
  email: string;
  company_id: number;
}

interface CompanyInfo {
  name: string;
  email: string;
}

export default function AccountPage() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchData() {
      setLoading(true);

      // Fetch user info
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

      // Fetch company info
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

      setLoading(false);
    }

    fetchData();
  }, [isAuthenticated, authLoading, router, user]);

  const handleUserUpdate = async () => {
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

    const { error: userError } = await supabase
      .from('users')
      .update(updates)
      .eq('email', user?.email);

    if (userError) {
      console.error('Error updating user:', userError);
      setMessage('Failed to update account information');
    } else {
      setMessage('Account information updated successfully');

      // Update Supabase auth email if changed
      if (userInfo.email !== user?.email) {
        const { error: authError } = await supabase.auth.updateUser({ email: userInfo.email });
        if (authError) {
          console.error('Error updating auth email:', authError);
          setMessage('Account updated, but failed to update auth email');
        }
      }

      // Clear password field after update
      setPassword('');
    }

    setLoading(false);
  };

  const handleCompanyUpdate = async () => {
    if (!companyInfo || !userInfo) return;

    setLoading(true);
    setMessage('');

    const { error: companyError } = await supabase
      .from('company')
      .update({
        name: companyInfo.name,
        email: companyInfo.email,
      })
      .eq('company_id', userInfo.company_id);

    if (companyError) {
      console.error('Error updating company:', companyError);
      setMessage('Failed to update company information');
    } else {
      setMessage('Company information updated successfully');
    }

    setLoading(false);
  };

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
                  onChange={(e) => setUserInfo(prev => prev ? { ...prev, firstname: e.target.value } : null)}
                  className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                />
              </div>
              <div>
                <Label htmlFor="lastname" className="text-gray-300">Last Name</Label>
                <Input
                  id="lastname"
                  value={userInfo?.lastname || ''}
                  onChange={(e) => setUserInfo(prev => prev ? { ...prev, lastname: e.target.value } : null)}
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
                onChange={(e) => setUserInfo(prev => prev ? { ...prev, email: e.target.value } : null)}
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
        {companyInfo && (
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300 Direkt">Company Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="companyName" className="text-gray-300">Company Name</Label>
                <Input
                  id="companyName"
                  value={companyInfo.name}
                  onChange={(e) => setCompanyInfo(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                />
              </div>
              <div>
                <Label htmlFor="companyEmail" className="text-gray-300">Company Email</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  value={companyInfo.email}
                  onChange={(e) => setCompanyInfo(prev => prev ? { ...prev, email: e.target.value } : null)}
                  className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                />
              </div>
              <Button
                onClick={handleCompanyUpdate}
                disabled={loading}
                className="w-full bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
              >
                Save Company Info
              </Button>
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