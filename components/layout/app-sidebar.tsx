'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import { usePendingCount } from '@/hooks/use-pending-count'
import { useRequests } from '@/hooks/use-requests'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { 
  LayoutDashboard, 
  Truck, 
  PackageOpen, 
  LogOut, 
  ChevronDown,
  User,
  Bell
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { pendingOps, pendingMm } = usePendingCount()
  const { requests } = useRequests({ enabled: user?.role === 'OPS_PIC' })

  const showOutbound = user?.role === 'OPS_PIC' || user?.role === 'FTE_OPS'
  const showMidmile = user?.role === 'FTE_MM'

  // Helper to match Ops PIC requests with case-insensitive comparison
  const isMyRequest = (r: { opsPicId?: string | null }) => {
    if (user?.role !== 'OPS_PIC') return false
    const requestOpsId = (r.opsPicId || '').toString().trim().toLowerCase()
    const userId = (user?.opsId || user?.email || '').toString().trim().toLowerCase()
    return requestOpsId === userId && requestOpsId !== ''
  }

  // Count Ops PIC's pending requests
  const myPendingOpsCount = user?.role === 'OPS_PIC'
    ? requests.filter(r => isMyRequest(r) && r.status === 'PENDING_OPS').length
    : 0
  const myApprovedCount = user?.role === 'OPS_PIC'
    ? requests.filter(r => isMyRequest(r) && r.status === 'PENDING_MM').length
    : 0

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-foreground text-lg leading-tight">Linehaul</span>
            <span className="text-xs text-muted-foreground">Manager</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/dashboard'}
                  tooltip="Dashboard"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="text-muted-foreground" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Outbound */}
              {showOutbound && (
                <Collapsible defaultOpen={pathname.startsWith('/outbound')} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Outbound">
                        <PackageOpen className="text-muted-foreground" />
                        <span>Outbound</span>
                        <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    {user?.role === 'FTE_OPS' && pendingOps > 0 && (
                      <SidebarMenuBadge className="bg-amber-500/20 text-amber-400 animate-pulse-ring">
                        {pendingOps}
                      </SidebarMenuBadge>
                    )}
                    {user?.role === 'OPS_PIC' && (myPendingOpsCount > 0 || myApprovedCount > 0) && (
                      <SidebarMenuBadge className={cn(
                        "animate-pulse-ring",
                        myPendingOpsCount > 0 ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"
                      )}>
                        {myPendingOpsCount + myApprovedCount}
                      </SidebarMenuBadge>
                    )}
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === '/outbound/lh-request'}
                          >
                            <Link href="/outbound/lh-request" className="flex items-center justify-between w-full">
                              <span>LH Request</span>
                              {user?.role === 'FTE_OPS' && pendingOps > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                                  {pendingOps}
                                </span>
                              )}
                              {user?.role === 'OPS_PIC' && myPendingOpsCount > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                                  {myPendingOpsCount}
                                </span>
                              )}
                              {user?.role === 'OPS_PIC' && myPendingOpsCount === 0 && myApprovedCount > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">
                                  {myApprovedCount}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {/* Midmile */}
              {showMidmile && (
                <Collapsible defaultOpen={pathname.startsWith('/midmile')} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Midmile">
                        <Truck className="text-muted-foreground" />
                        <span>Midmile</span>
                        <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    {user?.role === 'FTE_MM' && pendingMm > 0 && (
                      <SidebarMenuBadge className="bg-blue-500/20 text-blue-400 animate-pulse-ring">
                        {pendingMm}
                      </SidebarMenuBadge>
                    )}
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === '/midmile/truck-request'}
                          >
                            <Link href="/midmile/truck-request" className="flex items-center justify-between w-full">
                              <span>Truck Request</span>
                              {user?.role === 'FTE_MM' && pendingMm > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">
                                  {pendingMm}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground">
              {user?.role === 'OPS_PIC' ? 'Ops PIC' : user?.role === 'FTE_OPS' ? 'FTE Ops' : 'FTE MM'}
            </p>
          </div>
          <button 
            onClick={logout}
            className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
