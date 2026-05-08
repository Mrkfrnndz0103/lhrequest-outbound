'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { useAuth } from '@/components/auth/auth-provider'
import { SoundProvider } from '@/components/notifications/sound-provider'
import { Spinner } from '@/components/ui/spinner'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <SoundProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SoundProvider>
  )
}
