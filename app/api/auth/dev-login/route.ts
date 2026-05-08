import { NextRequest, NextResponse } from 'next/server'
import { setAuthCookie } from '@/lib/auth-session'
import type { User, UserRole } from '@/lib/types'

const TEST_USERS: Record<UserRole, User> = {
  OPS_PIC: {
    name: 'Test Ops PIC',
    opsId: 'TESTPIC',
    email: null,
    role: 'OPS_PIC',
  },
  FTE_OPS: {
    name: 'Test FTE Ops',
    opsId: null,
    email: 'test.ops@example.com',
    role: 'FTE_OPS',
  },
  FTE_MM: {
    name: 'Test FTE MM',
    opsId: null,
    email: 'test.mm@example.com',
    role: 'FTE_MM',
  },
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { role } = await request.json().catch(() => ({ role: undefined }))
  const user = TEST_USERS[role as UserRole]

  if (!user) {
    return NextResponse.json({ error: 'Invalid test role' }, { status: 400 })
  }

  const response = NextResponse.json({ user })
  setAuthCookie(response, user)
  return response
}
