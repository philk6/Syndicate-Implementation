'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function ClientLayoutWithConditionalSidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // For login and signup pages, render without sidebar
  if (isAuthPage) {
    return <main className="flex-1 w-full">{children}</main>;
  }

  // For all other pages, render with sidebar
  return (
    <SidebarProvider>
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