'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { NavUser } from '@/components/nav-user';
import { useRouter, usePathname } from 'next/navigation';
import { ShoppingCart, History, Settings, Users, LayoutDashboard, CreditCard } from 'lucide-react';
import SidebarLink from '@/components/SidebarLink';

const data = {
  versions: ['1.0.1', '1.1.0-alpha', '2.0.0-beta1'],
  navMain: [
    {
      title: 'Operations',
      url: '#',
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
        { title: 'Open Orders', url: '/orders', icon: ShoppingCart },
        { title: 'History', url: '/history', icon: History },
        { title: 'Credit Overview', url: '/credit-overview', icon: CreditCard },
      ],
    },
    {
      title: 'Admin Panel',
      url: '#',
      items: [
        { title: 'Manage Orders', url: '/admin/orders', icon: Settings },
        { title: 'Manage Users', url: '/admin/manage-users', icon: Users },
        { title: 'Credit Dashboard', url: '/admin/credit-dashboard', icon: CreditCard },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isAuthenticated, user, logout, session } = useAuth();
  const [userData, setUserData] = useState({ name: 'Loading...', email: '', avatar: '/syndicate_logo.jpeg' });
  const [userDataLoaded, setUserDataLoaded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Timeout to force fallback if user data doesn't load
  useEffect(() => {
    if (!isAuthenticated) return;

    const timeout = setTimeout(() => {
      if (!userDataLoaded) {
        console.warn('User data failed to load within timeout, using fallback');
        // Use fallback based on available data
        let fallbackName = 'User';
        let fallbackEmail = '';

        if (user?.email) {
          fallbackName = user.email.split('@')[0];
          fallbackEmail = user.email;
        } else if (session?.user?.email) {
          fallbackName = session.user.email.split('@')[0];
          fallbackEmail = session.user.email;
        }

        const fallbackUserData = {
          name: fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1).toLowerCase(),
          email: fallbackEmail,
          avatar: '/syndicate_logo.jpeg',
        };
        setUserData(fallbackUserData);
        setUserDataLoaded(true);
      }
    }, 3000); // 3 second timeout

    return () => clearTimeout(timeout);
  }, [isAuthenticated, user, session, userDataLoaded]);

  useEffect(() => {
    async function fetchUserData() {
      console.log('Sidebar fetchUserData called:', { isAuthenticated, user, session });
      
      if (!isAuthenticated) {
        console.log('Not authenticated, setting userDataLoaded to false');
        setUserDataLoaded(false);
        return;
      }

      // If we have session but no user yet, use session data as fallback
      if (!user && session?.user) {
        console.log('No user object but have session, using session data');
        const sessionEmail = session.user.email || '';
        const fallbackName = sessionEmail.split('@')[0] || 'User';
        
        setUserData({
          name: fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1).toLowerCase(),
          email: sessionEmail,
          avatar: '/syndicate_logo.jpeg',
        });
        setUserDataLoaded(true);
        return;
      }

      if (!user) {
        console.log('No user and no session, waiting...');
        setUserDataLoaded(false);
        return;
      }

      // Check if user object has essential data
      if (!user.user_id) {
        console.warn('Missing user_id in auth context:', { user_id: user.user_id, email: user.email });
        console.warn('Forcing logout due to missing user_id');
        await logout();
        return;
      }

      console.log('User data looks good, fetching profile for:', user.user_id);

      try {
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('firstname, lastname')
          .eq('user_id', user.user_id)
          .single();

        console.log('Profile fetch result:', { profile, profileError });

        if (profileError) {
          if (profileError.code === 'PGRST116') {
            console.warn('No profile found for user:', user.user_id);
            // Don't logout for missing profile, just use fallback name
          } else {
            console.error('Error fetching profile:', profileError);
            console.warn('Profile fetch error, but continuing with fallback name');
            // Don't force logout, just use fallback
          }
        }

        const formatName = (name: string | null) => {
          if (!name) return '';
          return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        };

        let fullName = '';
        if (profile && (profile.firstname || profile.lastname)) {
          const firstName = formatName(profile.firstname);
          const lastName = formatName(profile.lastname);
          fullName = `${firstName} ${lastName}`.trim();
          console.log('Using profile name:', fullName);
        } else {
          // Use email as fallback if no name is available
          fullName = user.email?.split('@')[0] || 'User';
          fullName = formatName(fullName);
          console.log('Using fallback name:', fullName);
        }

        const finalUserData = {
          name: fullName,
          email: user.email || user.user_id || '',
          avatar: '/syndicate_logo.jpeg',
        };

        console.log('Setting user data:', finalUserData);
        setUserData(finalUserData);
        setUserDataLoaded(true);
        console.log('User data loaded successfully');
      } catch (error) {
        console.error('Exception in fetchUserData:', error);
        // Don't force logout on exceptions, use fallback
        console.log('Using fallback due to exception');
        const fallbackUserData = {
          name: user.email?.split('@')[0] || 'User',
          email: user.email || user.user_id || '',
          avatar: '/syndicate_logo.jpeg',
        };
        setUserData(fallbackUserData);
        setUserDataLoaded(true);
      }
    }

    fetchUserData();
  }, [isAuthenticated, user, logout, session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!isAuthenticated) return null;

  return (
    <Sidebar {...props}>
      <SidebarHeader className="px-4 py-5 border-b border-white/[0.05]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <SidebarLink href="/dashboard">
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-amber-400 font-bold tracking-tight">The Syndicate</span>
                  <span className="text-neutral-500 text-xs">Buyers Portal · v1.0.0</span>
                </div>
              </SidebarLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navMain.map((item) => {
          // Only render Admin Panel for admin users
          if (item.title === 'Admin Panel' && user?.role !== 'admin') {
            return null;
          }
          return (
            <SidebarGroup key={item.title}>
              <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {item.items.map((subItem) => (
                    <SidebarMenuItem key={subItem.title}>
                      <SidebarMenuButton asChild isActive={pathname.startsWith(subItem.url)}>
                        <SidebarLink href={subItem.url}>
                          {subItem.icon && <subItem.icon className="mr-2 h-4 w-4" />}
                          <span>{subItem.title}</span>
                        </SidebarLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter className="border-t border-white/[0.05] px-3 py-3">
        <NavUser user={userData} onLogout={handleLogout} />
      </SidebarFooter>
    </Sidebar>
  );
}