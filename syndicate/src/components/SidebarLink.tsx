'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { useState } from 'react';

interface SidebarLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  isActive?: boolean;
}

export default function SidebarLink({ href, children, className, isActive }: SidebarLinkProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Add timeout to prevent hanging
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Session check timed out')), 5000)
      );
      const result = await Promise.race([sessionPromise, timeoutPromise]);
      const { data: { session }, error } = result as Awaited<ReturnType<typeof supabase.auth.getSession>>;

      if (error || !session) {
        console.log('SidebarLink: Invalid session, redirecting to login.', error?.message);
        router.push('/login?message=session_expired');
        return;
      }
      router.push(href);
    } catch (err) {
      console.error('SidebarLink error:', err);
      router.push('/login?message=session_expired');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`${className} ${isActive ? 'bg-[#35353580] text-[#c8aa64]' : ''} ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
    >
      {children}
    </Link>
  );
}