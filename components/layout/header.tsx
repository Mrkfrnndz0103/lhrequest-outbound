'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { useAuth } from '@/components/auth/auth-provider'
import { usePendingCount } from '@/hooks/use-pending-count'
import { ThemeToggle } from '@/components/theme-toggle'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const { user } = useAuth()
  const { pendingOps, pendingMm } = usePendingCount()

  const showOpsBadge = user?.role === 'FTE_OPS' && pendingOps > 0
  const showMmBadge = user?.role === 'FTE_MM' && pendingMm > 0
  const totalPending = (showOpsBadge ? pendingOps : 0) + (showMmBadge ? pendingMm : 0)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-6">
      <SidebarTrigger className="md:hidden" />
      
      <div className="flex-1">
        {title && (
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        )}
      </div>

      {/* Theme Toggle */}
      <ThemeToggle />

      {/* Notification Bell */}
      {totalPending > 0 && (
        <div className="relative">
          <button className="relative p-2 rounded-lg hover:bg-accent transition-colors">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className={cn(
              "absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold rounded-full",
              "bg-primary text-primary-foreground animate-pulse-ring"
            )}>
              {totalPending}
            </span>
          </button>
        </div>
      )}
    </header>
  )
}
