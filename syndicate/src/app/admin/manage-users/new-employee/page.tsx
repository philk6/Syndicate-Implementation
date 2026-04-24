'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS, PageShell, PageHeader, DsCard, DsButton, DsInput, SectionLabel,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, UserPlus, Copy, RefreshCw, Shield } from 'lucide-react';

interface Created {
  email: string;
  tempPassword: string;
}

function randomPassword(len = 12): string {
  // Avoid ambiguous chars (0/O/I/l/1) and non-typable symbols so admins can
  // verbally communicate the password accurately.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    return Array.from(buf, (n) => alphabet[n % alphabet.length]).join('');
  }
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export default function NewEmployeePage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tempPassword, setTempPassword] = useState(() => randomPassword());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
    if (!authLoading && user && user.role !== 'admin') router.push('/dashboard');
  }, [authLoading, isAuthenticated, user, router]);

  const handleSubmit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    const rate = Number(hourlyRate);
    if (!Number.isFinite(rate) || rate < 0) {
      setError('Hourly rate must be a non-negative number.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/employees/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          hourlyRate: rate,
          startDate,
          tempPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to create employee');
        return;
      }
      setCreated({ email: json.data.email, tempPassword: json.data.tempPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async (text: string, which: 'email' | 'password' | 'both') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Clipboard unavailable. Select the text manually.');
    }
  };

  if (authLoading) return <PageLoadingSpinner />;
  if (!isAuthenticated || user?.role !== 'admin') return null;

  if (created) {
    return (
      <PageShell>
        <PageHeader
          label="Admin · Manage Users"
          title="Employee Created"
          accent={DS.teal}
          right={
            <Link href="/admin/manage-users">
              <DsButton variant="ghost">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Users
              </DsButton>
            </Link>
          }
        />

        <DsCard className="p-6" accent={DS.red}>
          <div className="flex items-start gap-3 mb-4">
            <Shield className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-mono uppercase tracking-widest text-rose-400 mb-1">
                Write these down now
              </p>
              <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                This is the only time you&apos;ll see this password. Supabase stores it hashed —
                neither you nor Claude Code can retrieve it later. Communicate it to the employee
                directly, and they can change it after their first login.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 w-20 shrink-0">Email</span>
              <code className="flex-1 font-mono text-sm text-white bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2">
                {created.email}
              </code>
              <DsButton variant="ghost" onClick={() => copy(created.email, 'email')}>
                <Copy className="w-3.5 h-3.5" /> {copied === 'email' ? 'Copied' : 'Copy'}
              </DsButton>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 w-20 shrink-0">Password</span>
              <code className="flex-1 font-mono text-sm text-white bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 tracking-wider">
                {created.tempPassword}
              </code>
              <DsButton variant="ghost" onClick={() => copy(created.tempPassword, 'password')}>
                <Copy className="w-3.5 h-3.5" /> {copied === 'password' ? 'Copied' : 'Copy'}
              </DsButton>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <DsButton
              accent={DS.teal}
              onClick={() => copy(`Email: ${created.email}\nPassword: ${created.tempPassword}`, 'both')}
            >
              <Copy className="w-3.5 h-3.5" />
              {copied === 'both' ? 'Both copied' : 'Copy both'}
            </DsButton>
            <Link href="/admin/manage-users">
              <DsButton variant="ghost">Done</DsButton>
            </Link>
          </div>
        </DsCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        label="Admin · Manage Users"
        title="Create Employee"
        subtitle="Admin-driven account creation. No email verification — communicate credentials verbally."
        accent={DS.teal}
        right={
          <Link href="/admin/manage-users">
            <DsButton variant="ghost">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </DsButton>
          </Link>
        }
      />

      <DsCard className="p-6" accent={DS.teal}>
        <SectionLabel accent={DS.teal}>Profile</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DsInput label="First name" value={firstName} onChange={setFirstName} placeholder="Alex" />
          <DsInput label="Last name"  value={lastName}  onChange={setLastName}  placeholder="Ruiz"  />
          <DsInput label="Email" value={email} onChange={setEmail} placeholder="alex@example.com" className="md:col-span-2" />
          <DsInput
            label="Hourly rate (USD)"
            value={hourlyRate}
            onChange={setHourlyRate}
            type="number"
            placeholder="18.50"
          />
          <DsInput
            label="Employment start date"
            value={startDate}
            onChange={setStartDate}
            type="date"
          />
        </div>

        <div className="mt-4">
          <SectionLabel accent={DS.orange}>Temporary password</SectionLabel>
          <div className="flex items-end gap-3">
            <DsInput
              label="Password"
              value={tempPassword}
              onChange={setTempPassword}
              placeholder="at least 8 characters"
              className="flex-1"
            />
            <DsButton variant="ghost" onClick={() => setTempPassword(randomPassword())}>
              <RefreshCw className="w-3.5 h-3.5" /> Generate
            </DsButton>
          </div>
          <p className="text-[10px] text-neutral-500 mt-2 font-mono uppercase tracking-widest">
            You&apos;ll see this password once after creation. Supabase stores it hashed.
          </p>
        </div>

        {error && <p className="text-xs text-rose-400 mt-3 font-sans">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Link href="/admin/manage-users">
            <DsButton variant="ghost">Cancel</DsButton>
          </Link>
          <DsButton onClick={handleSubmit} disabled={submitting} accent={DS.teal}>
            <UserPlus className="w-3.5 h-3.5" />
            {submitting ? 'Creating…' : 'Create Employee'}
          </DsButton>
        </div>
      </DsCard>
    </PageShell>
  );
}
