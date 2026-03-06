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
      <body className="min-h-screen bg-[#0a0a0a] text-neutral-200 flex relative overflow-x-hidden">
        {/* Ambient Lighting Orbs */}
        <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-amber-600/10 blur-[120px] mix-blend-screen pointer-events-none z-0"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-emerald-600/10 blur-[120px] mix-blend-screen pointer-events-none z-0"></div>
        <div className="fixed top-[40%] left-[60%] w-[30vw] h-[30vw] rounded-full bg-orange-600/10 blur-[100px] mix-blend-screen pointer-events-none z-0"></div>

        <div className="relative z-10 w-full flex min-h-screen">
          <ErrorBoundary>
            <AuthProvider>
              <ClientLayoutWithConditionalSidebar>
                <TosWrapper>{children}</TosWrapper>
              </ClientLayoutWithConditionalSidebar>
              <LoadingOverlay />
            </AuthProvider>
          </ErrorBoundary>
        </div>
      </body>
    </html>
  );
}