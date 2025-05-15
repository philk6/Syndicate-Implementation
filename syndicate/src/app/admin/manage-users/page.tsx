'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, Plus } from 'lucide-react';

interface User {
  user_id: number;
  email: string;
  firstname: string | null;
  lastname: string | null;
  role: string;
  company: { name: string } | null;
}

export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  // Memoized function to fetch users
  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id,
        email,
        firstname,
        lastname,
        role,
        company (name)
      `)
      .order('user_id', { ascending: true });

    if (error) {
      console.error('Error fetching users:', error);
      setMessage('Failed to load users.');
    } else {
      // Transform data to match the User interface, especially the company field
      const transformedUsers = (data || []).map(user => ({
        ...user,
        // Supabase relational selects return an array, take the first element if it exists
        company: Array.isArray(user.company) && user.company.length > 0 ? user.company[0] : null,
      }));
      setUsers(transformedUsers);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    fetchUsers();
  }, [isAuthenticated, authLoading, router, user?.role, fetchUsers]);

  // Memoized function to generate invite code with optimistic UI updates
  const generateInviteCode = useCallback(async () => {
    setMessage(''); // Clear previous message

    // Fetch the current user's user_id from the users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', user?.user_id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user ID:', userError);
      setMessage('Failed to identify current user.');
      setInviteCode(null); // Reset invite code on error
      return;
    }

    const createdUserId = userData.user_id;

    // Generate a unique 8-character uppercase code with retry logic
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const maxAttempts = 5;
    let attempts = 0;

    try {
      while (attempts < maxAttempts) {
        let code = '';
        for (let i = 0; i < 5; i++) { // Assuming schema updated to varchar(5)
          code += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        const { data, error } = await supabase
          .from('invitation_codes')
          .insert({
            code,
            expired: false,
            created_user_id: createdUserId,
          })
          .select('code')
          .single();

        if (error) {
          if (error.code === '23505') { // Unique constraint violation
            console.log(`Code ${code} already exists, retrying...`);
            attempts++;
            continue;
          }
          console.error('Error creating invite code:', error);
          setMessage(`Failed to generate invite code: ${error.message}`);
          setInviteCode(null); // Reset invite code on error
          return;
        }

        if (data) {
          setInviteCode(data.code); // Set the new code
          setMessage('Invite code generated successfully!');
          return;
        }
      }

      setMessage('Failed to generate a unique invite code after multiple attempts.');
      setInviteCode(null); // Reset invite code on failure
    } catch (error) {
      console.error('Unexpected error:', error);
      setMessage('An unexpected error occurred');
      setInviteCode(null);
    }
  }, [user?.user_id]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">Manage Users</h1>

        {/* Invite Code Section */}
        <div className="mb-8">
          <Button
            onClick={generateInviteCode}
            className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424] mb-4"
          >
            <Plus className="mr-2 h-4 w-4" />
            Generate Invite Code
          </Button>
          {inviteCode && (
            <Alert className="bg-[#235c12] text-[#bfbfbf] w-fit">
              <Check className="h-4 w-4 text-[#bfbfbf]" />
              <AlertTitle>New Invite Code</AlertTitle>
              <AlertDescription>
                <span className="font-mono text-lg">{inviteCode}</span>
                <p className="mt-1">Share this code with the user to allow signup.</p>
              </AlertDescription>
            </Alert>
          )}
          {message && (
            <p
              className={`text-sm mt-2 ${
                message.includes('successfully') ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {message}
            </p>
          )}
        </div>

        {/* Users Table */}
        <div className="card max-w-full border-[#2b2b2b] border-solid border">
          {users.length === 0 ? (
            <p className="text-gray-400 text-center">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-gray-300">User ID</TableHead>
                  <TableHead className="text-gray-300">Email</TableHead>
                  <TableHead className="text-gray-300">Name</TableHead>
                  <TableHead className="text-gray-300">Role</TableHead>
                  <TableHead className="text-gray-300">Company</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.user_id}
                    className="hover:bg-[#35353580] transition-colors border-[#2b2b2b]"
                  >
                    <TableCell className="text-gray-200">{user.user_id}</TableCell>
                    <TableCell className="text-gray-200">{user.email}</TableCell>
                    <TableCell className="text-gray-200">
                      {user.firstname || user.lastname
                        ? `${user.firstname || ''} ${user.lastname || ''}`.trim()
                        : 'N/A'}
                    </TableCell>
                    <TableCell className="text-gray-200">
                      <Badge variant="outline" className="bg-[#c8aa64] text-[#242424]">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-200">
                      {user.company?.name || 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}