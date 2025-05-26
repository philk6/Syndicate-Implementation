'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/orders');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      
      
    </div>
  );
}