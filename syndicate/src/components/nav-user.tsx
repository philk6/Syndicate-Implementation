"use client"

import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
} from "lucide-react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavUser({
  user,
  onLogout,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onLogout?: () => void
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-amber-500/10 data-[state=open]:text-amber-400 focus:ring-transparent rounded-xl"
            >
              <Avatar className="h-8 w-8 rounded-xl border border-white/[0.08]">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-xl bg-amber-500/10 text-amber-400 text-xs font-bold">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-white">{user.name}</span>
                <span className="truncate text-xs text-neutral-500">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-neutral-500" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-3 py-2.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-xl border border-white/[0.08]">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-xl bg-amber-500/10 text-amber-400 text-xs font-bold">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-white">{user.name}</span>
                  <span className="truncate text-xs text-neutral-500">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/[0.05]" />
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 focus:text-amber-400 focus:bg-amber-500/10 transition-all duration-200" onClick={() => router.push('/account')}>
                <BadgeCheck className="text-neutral-500" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 focus:text-amber-400 focus:bg-amber-500/10 transition-all duration-200">
                <CreditCard className="text-neutral-500" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 focus:text-amber-400 focus:bg-amber-500/10 transition-all duration-200">
                <Bell className="text-neutral-500" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-white/[0.05]" />
            <DropdownMenuItem onClick={onLogout} className="cursor-pointer rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 focus:text-rose-400 focus:bg-rose-500/10 transition-all duration-200">
              <LogOut className="text-neutral-500" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
