import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from './auth-session'
import type { User, UserRole } from './types'

export function requireUser(request: NextRequest, allowedRoles?: UserRole[]): User | NextResponse {
  const user = getRequestUser(request)

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  return user
}

export function isAuthError(result: User | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
