import './globals.css';
import { ReactNode } from 'react';
import { AuthProvider } from '../../lib/auth';
import { AppSidebar } from '@/components/app-sidebar';
import { ClientLayoutWithConditionalSidebar } from '@/components/client-layout-with-sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export const metadata = {
  title: 'Syndicate - Group Buying for Amazon Sellers',
  description: 'A platform for Amazon FBA/FBM sellers to buy together',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-900 text-gray-100 flex">
        <AuthProvider>
          <ClientLayoutWithConditionalSidebar>
            {children}
          </ClientLayoutWithConditionalSidebar>
        </AuthProvider>
      </body>
    </html>
  );
}