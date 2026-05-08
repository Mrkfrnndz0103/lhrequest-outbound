'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { LoginModal } from '@/components/auth/login-modal'
import { Truck, PackageOpen, ClipboardCheck, Bell } from 'lucide-react'

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, router])

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4zIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnYyaDR2MmgtNHYyaDJ2MmgtMnYyaC0ydi0yaC0ydi0yaDJ2LTJoMnYtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20" />

      {/* Dashboard Preview (blurred when login modal is shown) */}
      <div className="relative z-10 p-6 md:p-8 lg:p-12">
        {/* Header Preview */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20">
            <Truck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Linehaul Manager</h1>
            <p className="text-sm text-muted-foreground">Dispatch Management System</p>
          </div>
        </div>

        {/* Features Preview */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl">
          <FeatureCard
            icon={PackageOpen}
            title="Request Management"
            description="Create and track linehaul requests with real-time status updates"
          />
          <FeatureCard
            icon={ClipboardCheck}
            title="Approval Workflow"
            description="Streamlined approval process with FTE Ops and MM confirmation"
          />
          <FeatureCard
            icon={Bell}
            title="Instant Notifications"
            description="Sound alerts and visual badges for new pending requests"
          />
        </div>

        {/* Stats Preview */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
          <StatCard label="Today&apos;s Requests" value="--" />
          <StatCard label="Pending Approval" value="--" />
          <StatCard label="Confirmed" value="--" />
          <StatCard label="Trucks Deployed" value="--" />
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal />
    </div>
  )
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: React.ElementType
  title: string
  description: string 
}) {
  return (
    <div className="p-6 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm">
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-4">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl bg-card/30 border border-border/50 backdrop-blur-sm">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
