import './globals.css';
import { ReactNode } from 'react';
import { AuthProvider } from '../../lib/auth';
import { ClientLayoutWithConditionalSidebar } from '@/components/client-layout-with-sidebar';
import TosWrapper from '@/components/TosWrapper';
import LoadingOverlay from '@/components/LoadingOverlay';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata = {
  title: 'Syndicate - Group Buying for Amazon Sellers',
  description: 'A platform for Amazon FBA/FBM sellers to buy together',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#14130F] text-gray-100 flex">
        <ErrorBoundary>
        <AuthProvider>
          <ClientLayoutWithConditionalSidebar>
            <TosWrapper>{children}</TosWrapper>
          </ClientLayoutWithConditionalSidebar>
            <LoadingOverlay />
        </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}