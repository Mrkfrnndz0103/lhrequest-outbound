'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from './auth-provider'
import { Truck, Mail, IdCard } from 'lucide-react'
import { LOGIN_DELAY } from '@/lib/constants'

const TEST_USERS = {
  OPS_PIC: {
    name: 'Test Ops PIC',
    opsId: 'TESTPIC',
    email: null,
    role: 'OPS_PIC' as const,
  },
  FTE_OPS: {
    name: 'Test FTE Ops',
    opsId: null,
    email: 'test.ops@example.com',
    role: 'FTE_OPS' as const,
  },
  FTE_MM: {
    name: 'Test FTE MM',
    opsId: null,
    email: 'test.mm@example.com',
    role: 'FTE_MM' as const,
  },
}

export function LoginModal() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [activeTab, setActiveTab] = useState<'fte' | 'backroom'>('fte')
  const [identifier, setIdentifier] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [shakeError, setShakeError] = useState(false)

  // Countdown and show modal after delay
  useEffect(() => {
    if (authLoading || isAuthenticated) return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setShowModal(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    const timeout = setTimeout(() => {
      setShowModal(true)
    }, LOGIN_DELAY)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [authLoading, isAuthenticated])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          loginType: activeTab,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Invalid credentials')
        setShakeError(true)
        setTimeout(() => setShakeError(false), 500)
        return
      }

      login(data.user)
    } catch {
      setError('Failed to login. Please try again.')
      setShakeError(true)
      setTimeout(() => setShakeError(false), 500)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDevLogin = async (role: keyof typeof TEST_USERS) => {
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start test session')
      }

      login(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start test session')
    } finally {
      setIsLoading(false)
    }
  }

  // Don't render if authenticated or still loading auth
  if (authLoading || isAuthenticated) return null

  // Show countdown before modal
  if (!showModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          <div className="relative">
            <div className="flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 border border-primary/20">
              <Truck className="w-12 h-12 text-primary" />
            </div>
            <div className="absolute -bottom-2 -right-2 flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border text-xl font-bold text-primary">
              {countdown}
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Linehaul Manager</h1>
            <p className="text-muted-foreground mt-1">Loading dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-enter bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md mx-4 animate-modal-enter ${shakeError ? 'animate-shake' : ''}`}>
        <div className="glass rounded-2xl p-8 shadow-2xl border border-border/50">
          {/* Logo & Title */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20">
              <Truck className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">Linehaul Manager</h1>
              <p className="text-muted-foreground text-sm mt-1">Sign in to continue</p>
            </div>
          </div>

          {/* Login Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => {
            setActiveTab(v as 'fte' | 'backroom')
            setIdentifier('')
            setError('')
          }}>
            <TabsList className="w-full grid grid-cols-2 mb-6 bg-secondary/50">
              <TabsTrigger value="fte" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Mail className="w-4 h-4" />
                FTE
              </TabsTrigger>
              <TabsTrigger value="backroom" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <IdCard className="w-4 h-4" />
                Backroom
              </TabsTrigger>
            </TabsList>

            <form onSubmit={handleLogin}>
              <TabsContent value="fte" className="mt-0">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="h-12 bg-secondary/30 border-border/50 focus:border-primary"
                    required
                  />
                  <p className="text-xs text-muted-foreground">For FTE Ops and FTE MM users</p>
                </div>
              </TabsContent>

              <TabsContent value="backroom" className="mt-0">
                <div className="space-y-2">
                  <Label htmlFor="opsId" className="text-foreground">Ops ID</Label>
                  <Input
                    id="opsId"
                    type="text"
                    placeholder="Enter your Ops ID"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="h-12 bg-secondary/30 border-border/50 focus:border-primary"
                    required
                  />
                  <p className="text-xs text-muted-foreground">For Ops PIC users</p>
                </div>
              </TabsContent>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                disabled={isLoading || !identifier.trim()}
              >
                {isLoading ? (
                  <>
                    <Spinner className="mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </Tabs>

          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-6 rounded-2xl border border-secondary/50 bg-secondary/20 p-4">
              <p className="text-sm font-medium text-foreground mb-3">Temporary test login</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="text-sm"
                  onClick={() => handleDevLogin('OPS_PIC')}
                >
                  OPS PIC
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-sm"
                  onClick={() => handleDevLogin('FTE_OPS')}
                >
                  FTE Ops
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-sm"
                  onClick={() => handleDevLogin('FTE_MM')}
                >
                  FTE MM
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Quick toggle for development testing. This bypasses the login API.
              </p>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            Shopee Sorting Facility - Dispatch Department
          </p>
        </div>
      </div>
    </div>
  )
}
