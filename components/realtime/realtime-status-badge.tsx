'use client'

import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type RealtimeStatusBadgeProps = {
  mode: 'connected' | 'reconnecting' | 'polling' | 'offline'
  className?: string
}

const labels: Record<RealtimeStatusBadgeProps['mode'], string> = {
  connected: 'Live Connected',
  reconnecting: 'Reconnecting',
  polling: 'Polling Mode',
  offline: 'Offline',
}

export function RealtimeStatusBadge({ mode, className }: RealtimeStatusBadgeProps) {
  const Icon = mode === 'connected' ? Wifi : mode === 'offline' ? WifiOff : RefreshCw

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 whitespace-nowrap',
        mode === 'connected' && 'border-green-500/30 text-green-500',
        mode === 'reconnecting' && 'border-amber-500/30 text-amber-500',
        mode === 'polling' && 'border-blue-500/30 text-blue-500',
        mode === 'offline' && 'border-destructive/30 text-destructive',
        className
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', mode === 'reconnecting' && 'animate-spin')} />
      {labels[mode]}
    </Badge>
  )
}
