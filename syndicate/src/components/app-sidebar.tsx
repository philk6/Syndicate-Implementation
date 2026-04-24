'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@lib/auth';
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
import { usePathname } from 'next/navigation';
import { ShoppingCart, History, Settings, Users, LayoutDashboard, CreditCard, MessageCircle, Crosshair, Package, Warehouse, Search, Clock, UserCog } from 'lucide-react';
import SidebarLink from '@/components/SidebarLink';
import { usePrepUnreadCount } from '@/hooks/usePrepUnreadCount';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const data = {
  versions: ['1.0.1', '1.1.0-alpha', '2.0.0-beta1'],
  navMain: [
    {
      title: 'Operations',
      url: '#',
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
        { title: 'Supplier Intel', url: '/supplier-intel', icon: Search },
        { title: 'Open Orders', url: '/orders', icon: ShoppingCart },
        { title: 'History', url: '/history', icon: History },
        { title: 'Credit Overview', url: '/credit-overview', icon: CreditCard },
        { title: 'Chat', url: '/chat', icon: MessageCircle },
        { title: 'Command Center', url: '/command-center', icon: Crosshair },
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

// Paths that require buyers group access
const BUYERS_GROUP_RESTRICTED_PATHS = ['/orders', '/credit-overview'];

const formatName = (name: string | null | undefined) => {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout, isAuthenticated } = useAuth();
  const [buyersGroupDialogOpen, setBuyersGroupDialogOpen] = useState(false);
  const pathname = usePathname();

  // Derive display data directly from AuthContext. AuthProvider already
  // fetched firstname/lastname/role/totalXp in its single users-table query,
  // so there's no need to fetch again here.
  const userData = useMemo(() => {
    if (!user) {
      return { name: 'Loading...', email: '', avatar: '/syndicate_logo.jpeg', totalXp: 0, role: '' as string | undefined };
    }
    const first = formatName(user.firstname);
    const last = formatName(user.lastname);
    const nameFromProfile = `${first} ${last}`.trim();
    const nameFromEmail = formatName(user.email?.split('@')[0] ?? 'User');
    return {
      name: nameFromProfile || nameFromEmail,
      email: user.email ?? '',
      avatar: '/syndicate_logo.jpeg',
      totalXp: user.totalXp ?? 0,
      role: user.role,
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
  };

  // Check if user has buyers group permission
  const hasBuyersGroupAccess = user?.buyersgroup === true || user?.role === 'admin';

  // Prep Portal visibility
  const has1on1 = (user as { has_1on1_membership?: boolean })?.has_1on1_membership === true;
  const isAdmin = user?.role === 'admin';
  const isEmployee = user?.role === 'employee';
  const hasPrepAccess = has1on1 || isAdmin || isEmployee;
  const prepUnread = usePrepUnreadCount(hasPrepAccess ? user?.user_id ?? null : null);

  if (!isAuthenticated) return null;

  return (
    <>
    <Sidebar {...props}>
      <SidebarHeader className="px-4 py-5 border-b border-white/[0.05]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <SidebarLink href="/dashboard">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
                    <svg
                      className="w-5 h-5 text-black"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="font-semibold text-white tracking-wide text-base">The Syndicate</h1>
                    <p className="text-[10px] text-neutral-500 font-medium tracking-wider uppercase">v1.0.0 Beta</p>
                  </div>
                </div>
              </SidebarLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navMain.map((item) => {
          // Admin Panel visible to admins + employees (employees see a reduced set).
          if (item.title === 'Admin Panel' && !isAdmin && !isEmployee) {
            return null;
          }

          type NavItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };
          let items: NavItem[] = [...item.items];

          if (item.title === 'Operations') {
            // Prep Portal — admins, employees, and 1-on-1 users see it.
            if (hasPrepAccess) {
              items = [...items, { title: 'Prep Portal', url: '/prep', icon: Package }];
            }
            // My Time — admins and employees only.
            if (isAdmin || isEmployee) {
              items = [...items, { title: 'My Time', url: '/my-time', icon: Clock }];
            }
          }

          if (item.title === 'Admin Panel') {
            if (isEmployee && !isAdmin) {
              // Employees see Prep Ops only from the admin section.
              items = [{ title: 'Prep Ops', url: '/admin/prep', icon: Warehouse }];
            } else {
              // Admins: all existing items + Prep Ops + new Employees section.
              items = [
                ...items,
                { title: 'Prep Ops', url: '/admin/prep', icon: Warehouse },
                { title: 'Employees', url: '/admin/employees', icon: UserCog },
              ];
            }
          }

          return (
            <SidebarGroup key={item.title}>
              <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((subItem) => {
                    const isRestricted = BUYERS_GROUP_RESTRICTED_PATHS.includes(subItem.url);
                    const isBlocked = isRestricted && !hasBuyersGroupAccess;

                    if (isBlocked) {
                      return (
                        <SidebarMenuItem key={subItem.title}>
                          <SidebarMenuButton
                            asChild
                            isActive={pathname.startsWith(subItem.url)}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setBuyersGroupDialogOpen(true);
                              }}
                              className="flex items-center w-full text-left"
                            >
                              {subItem.icon && <subItem.icon className="mr-2 h-4 w-4" />}
                              <span>{subItem.title}</span>
                            </button>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }

                    const isPrepPortal = subItem.url === '/prep';
                    return (
                      <SidebarMenuItem key={subItem.title}>
                        <SidebarMenuButton asChild isActive={pathname.startsWith(subItem.url)}>
                          <SidebarLink href={subItem.url}>
                            {subItem.icon && <subItem.icon className="mr-2 h-4 w-4" />}
                            <span>{subItem.title}</span>
                            {isPrepPortal && prepUnread > 0 && (
                              <span
                                className="ml-auto inline-flex items-center justify-center rounded-full text-[9px] font-black h-4 min-w-[1rem] px-1"
                                style={{ backgroundColor: '#EF4444', color: 'white', boxShadow: '0 0 6px rgba(239,68,68,0.6)' }}
                              >
                                {prepUnread > 99 ? '99+' : prepUnread}
                              </span>
                            )}
                          </SidebarLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
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

    {/* Buyers Group Access Denied Dialog */}
    <Dialog open={buyersGroupDialogOpen} onOpenChange={setBuyersGroupDialogOpen}>
      <DialogContent className="bg-[#0a0a0a]/95 border border-white/[0.08] backdrop-blur-xl text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-semibold">Access Restricted</DialogTitle>
        </DialogHeader>
        <p className="text-neutral-400 text-sm leading-relaxed">
          You are not permitted in this area because you are not in the buyersgroup, please contact support to gain access.
        </p>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setBuyersGroupDialogOpen(false)}
            className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300 text-sm"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}