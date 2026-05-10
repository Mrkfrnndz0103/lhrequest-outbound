'use client'

import { createContext, useContext, useEffect, useRef, useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { usePendingCount } from '@/hooks/use-pending-count'
import { useRequests } from '@/hooks/use-requests'
import type { LineHaulRequest } from '@/lib/types'

interface SoundContextType {
  playNotification: () => void
  hasPendingAlerts: boolean
}

const SoundContext = createContext<SoundContextType | undefined>(undefined)

function isExpectedMediaPlaybackError(error: unknown) {
  if (!(error instanceof DOMException)) return false
  return error.name === 'AbortError' || error.name === 'NotAllowedError'
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { pendingOps, pendingMm } = usePendingCount()
  const { requests } = useRequests({ enabled: user?.role === 'OPS_PIC' })
  const [soundReady, setSoundReady] = useState(false)
  const prevPendingOps = useRef(pendingOps)
  const prevPendingMm = useRef(pendingMm)
  const prevMyRequests = useRef<LineHaulRequest[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const alertIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Get current user's requests for OPS_PIC with case-insensitive matching
  const myRequests = useMemo(() => {
    if (!user || user.role !== 'OPS_PIC') return []
    const userId = (user.opsId || user.email || '').toString().trim().toLowerCase()
    return requests.filter(r => {
      const requestOpsId = (r.opsPicId || '').toString().trim().toLowerCase()
      return requestOpsId === userId && requestOpsId !== ''
    })
  }, [requests, user])

  // Initialize sound player on first user interaction.
  useEffect(() => {
    const initSound = () => {
      if (!audioRef.current) {
        const audio = new Audio('/notification.mp3')
        audio.preload = 'auto'
        audio.volume = 1.0
        audioRef.current = audio
      }

      const audio = audioRef.current
      audio.muted = false
      audio.load()
      setSoundReady(true)

      document.removeEventListener('click', initSound)
      document.removeEventListener('touchstart', initSound)
    }

    // Initialize on first click/touch
    document.addEventListener('click', initSound)
    document.addEventListener('touchstart', initSound)

    return () => {
      document.removeEventListener('click', initSound)
      document.removeEventListener('touchstart', initSound)
    }
  }, [])

  const playNotification = useCallback(() => {
    try {
      const audio = audioRef.current ?? new Audio('/notification.mp3')
      audioRef.current = audio
      audio.muted = false
      audio.volume = 1.0
      audio.currentTime = 0
      audio.play().catch(error => {
        if (!isExpectedMediaPlaybackError(error)) {
          console.error('Error playing notification sound:', error)
        }
      })
    } catch (error) {
      if (!isExpectedMediaPlaybackError(error)) {
        console.error('Error playing notification sound:', error)
      }
    }
  }, [])

  // Watch for new pending items and play sound
  useEffect(() => {
    if (!user || !soundReady) return

    // FTE Ops: Alert for new pending ops requests
    if (user.role === 'FTE_OPS' && pendingOps > prevPendingOps.current) {
      playNotification()
    }

    // FTE MM: Alert for newly approved requests that need assignment
    if (user.role === 'FTE_MM' && pendingMm > prevPendingMm.current) {
      playNotification()
    }

    prevPendingOps.current = pendingOps
    prevPendingMm.current = pendingMm
  }, [user, pendingOps, pendingMm, playNotification, soundReady])

  // Continuous alert for pending requests (FTE Ops & FTE MM)
  useEffect(() => {
    if (!user || !soundReady) return

    const hasPendingForRole = 
      (user.role === 'FTE_OPS' && pendingOps > 0) ||
      (user.role === 'FTE_MM' && pendingMm > 0)

    // Clear any existing interval
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current)
      alertIntervalRef.current = null
    }

    // Start continuous alert if there are pending requests
    if (hasPendingForRole) {
      playNotification()
      alertIntervalRef.current = setInterval(() => {
        playNotification()
      }, 8000) // Play every 8 seconds
    }

    return () => {
      if (alertIntervalRef.current) {
        clearInterval(alertIntervalRef.current)
        alertIntervalRef.current = null
      }
    }
  }, [user, pendingOps, pendingMm, playNotification, soundReady])

  // OPS_PIC: Watch for status changes on their own requests
  useEffect(() => {
    if (!user || !soundReady || user.role !== 'OPS_PIC') return
    if (prevMyRequests.current.length === 0) {
      prevMyRequests.current = myRequests
      return
    }

    // Check for status changes
    const prevRequestsMap = new Map(prevMyRequests.current.map(r => [r.id, r]))

    for (const currentReq of myRequests) {
      const prevReq = prevRequestsMap.get(currentReq.id)
      if (!prevReq) continue

      if (prevReq.status !== currentReq.status) {
        playNotification()
      }
    }

    prevMyRequests.current = myRequests
  }, [user, myRequests, playNotification, soundReady])

  // Calculate if there are pending alerts for this user
  const hasPendingAlerts = useMemo(() => {
    if (!user) return false
    if (user.role === 'FTE_OPS') return pendingOps > 0
    if (user.role === 'FTE_MM') return pendingMm > 0
    return false
  }, [user, pendingOps, pendingMm])

  return (
    <SoundContext.Provider value={{ playNotification, hasPendingAlerts }}>
      {children}
    </SoundContext.Provider>
  )
}

export function useSound() {
  const context = useContext(SoundContext)
  if (context === undefined) {
    throw new Error('useSound must be used within a SoundProvider')
  }
  return context
}
