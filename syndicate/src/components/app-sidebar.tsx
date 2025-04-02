'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
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
import { useRouter, usePathname } from 'next/navigation'; // Added usePathname
import { ShoppingCart, History, Settings, Users, Home } from 'lucide-react';

// Sample data
const data = {
  versions: ['1.0.1', '1.1.0-alpha', '2.0.0-beta1'],
  navMain: [
    {
      title: 'Operations',
      url: '#',
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: Home },
        { title: 'Open Orders', url: '/orders', icon: ShoppingCart },
        { title: 'History', url: '/history', icon: History },
      ],
    },
    {
      title: 'Admin Panel',
      url: '#',
      items: [
        { title: 'Manage Orders', url: '/admin/orders', icon: Settings },
        { title: 'Manage Users', url: '/admin/manage-users', icon: Users },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isAuthenticated, user } = useAuth(); // Removed unused loading and logout
  const [userData, setUserData] = useState({ name: 'User', email: '', avatar: '/syndicate_logo.jpeg' });
  const router = useRouter();
  const pathname = usePathname(); // Get current path

  useEffect(() => {
    async function fetchUserData() {
      if (!isAuthenticated || !user) return;

      try {
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('firstname, lastname')
          .eq('email', user.email)
          .single();

        if (profileError) {
          if (profileError.code === 'PGRST116') {
            console.warn('No profile found for user:', user.email);
          } else {
            console.error('Error fetching profile:', profileError);
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
        } else {
          fullName = user.email?.split('@')[0] || 'User';
          fullName = formatName(fullName);
        }

        setUserData({
          name: fullName,
          email: user.email || '',
          avatar: '/syndicate_logo.jpeg',
        });
      } catch (error) {
        console.error('Error in fetchUserData:', error);
      }
    }

    fetchUserData();
  }, [isAuthenticated, user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login'); // Redirect to login page after logout
  };

  if (!isAuthenticated) return null;

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-[#c8aa64] font-bold">The Syndicate - Buyers Portal</span>
                  <span className="text-[#bfbfbf]">v0.0.1 Alpha</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navMain.map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {item.items.map((subItem) => (
                  <SidebarMenuItem key={subItem.title}>
                    <SidebarMenuButton asChild isActive={pathname === subItem.url}>
                      <a href={subItem.url}>
                        {subItem.icon && <subItem.icon className="mr-2 h-4 w-4" />}
                        <span>{subItem.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter>
        <NavUser user={userData} onLogout={handleLogout} /> {/* Pass handleLogout instead of logout */}
      </SidebarFooter>
    </Sidebar>
  );
}