'use client';

import React from 'react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CompanyProfile } from '@/components/CompanyProfile';

interface CompanyProfileDrawerProps {
  companyId: number;
  isAdmin?: boolean;
  children: React.ReactNode;
}

export function CompanyProfileDrawer({ companyId, isAdmin = false, children }: CompanyProfileDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="text-amber-400 hover:text-amber-300 hover:underline transition-colors focus:outline-none focus:ring-0 text-left font-medium">
          {children}
        </button>
      </SheetTrigger>
      <SheetContent 
        className="w-[60vw] sm:max-w-[60vw] overflow-y-auto bg-[#0a0a0a]/95 border-l border-white/10 backdrop-blur-xl"
        side="right"
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="text-2xl text-white">Company Overview</SheetTitle>
          <SheetDescription className="text-neutral-400">
            View and manage company goals, purchase orders, and notes.
          </SheetDescription>
        </SheetHeader>
        
        <CompanyProfile companyId={companyId} isAdmin={isAdmin} />
      </SheetContent>
    </Sheet>
  );
}
