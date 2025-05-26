'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { AppSidebar } from '@/components/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function ClientLayoutWithConditionalSidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isTabActive } = useAuth();
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // Listen for route changes to force re-rendering
  useEffect(() => {
    console.log('Route changed to:', pathname);
  }, [pathname]);

  // Log tab activity for debugging
  useEffect(() => {
    console.log('Tab active state changed:', isTabActive);
  }, [isTabActive]);

  // For login and signup pages, render without sidebar
  if (isAuthPage) {
    return <main className="flex-1 w-full">{children}</main>;
  }

  // For all other pages, render with sidebar
  // Use key={pathname} to force the entire layout to re-render when route changes
  return (
    <SidebarProvider key={pathname}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 ml-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
} 