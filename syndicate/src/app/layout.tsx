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
      <body className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans overflow-x-hidden relative flex">
        {/* Ambient Background Glows */}
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] rounded-full bg-amber-600/10 blur-[120px] pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-[10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-orange-600/5 blur-[150px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[30%] left-[40%] w-[30vw] h-[30vw] rounded-full bg-emerald-600/5 blur-[120px] pointer-events-none mix-blend-screen" />

        <div className="relative z-10 w-full flex min-h-screen overflow-y-auto">
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