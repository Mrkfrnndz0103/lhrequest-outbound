'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UserRole } from '@/lib/types'

type AddUserRole = UserRole

const ROLE_LABELS: Record<AddUserRole, string> = {
  OPS_PIC: 'Ops PIC',
  FTE_OPS: 'FTE Ops',
  FTE_MM: 'FTE MM',
}

export default function AddUserPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [role, setRole] = useState<AddUserRole>('OPS_PIC')
  const [name, setName] = useState('')
  const [opsId, setOpsId] = useState('')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const canManageUsers = user?.role === 'FTE_OPS' || user?.role === 'FTE_MM'
  const isFteRole = role === 'FTE_OPS' || role === 'FTE_MM'

  useEffect(() => {
    if (user && !canManageUsers) {
      router.replace('/dashboard')
    }
  }, [canManageUsers, router, user])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          role,
          opsId: role === 'OPS_PIC' ? opsId : '',
          email: isFteRole ? email : '',
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add user')
      }

      setName('')
      setOpsId('')
      setEmail('')
      setRole('OPS_PIC')
      setMessage({ type: 'success', text: `${ROLE_LABELS[role]} user added to the database.` })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to add user',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canManageUsers) return null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-primary/10 text-primary">
            <UserPlus className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Add User</h1>
            <p className="text-sm text-muted-foreground">Create Ops PIC, FTE Ops, and FTE MM users.</p>
          </div>
        </div>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>New User</CardTitle>
            <CardDescription>The new user is saved directly to the PostgreSQL users table.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="user-role">User Type</Label>
                <Select value={role} onValueChange={(value) => setRole(value as AddUserRole)}>
                  <SelectTrigger id="user-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPS_PIC">Ops PIC</SelectItem>
                    <SelectItem value="FTE_OPS">FTE Ops</SelectItem>
                    <SelectItem value="FTE_MM">FTE MM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>

              {role === 'OPS_PIC' ? (
                <div className="grid gap-2">
                  <Label htmlFor="ops-id">OPS ID</Label>
                  <Input
                    id="ops-id"
                    value={opsId}
                    onChange={(event) => setOpsId(event.target.value)}
                    placeholder="OPS ID used for Backroom login"
                    required
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                  />
                </div>
              )}

              {message && (
                <div
                  className={
                    message.type === 'success'
                      ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700'
                      : 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                  }
                >
                  {message.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  <UserPlus className="size-4" />
                  {isSubmitting ? 'Adding...' : 'Add User'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
