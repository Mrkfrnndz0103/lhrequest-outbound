import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from './auth-session'
import { apiError } from './api-errors'
import type { User, UserRole } from './types'

export function requireUser(request: NextRequest, allowedRoles?: UserRole[]): User | NextResponse {
  const user = getRequestUser(request)

  if (!user) {
    return apiError('Authentication required', 401, 'AUTH_REQUIRED')
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return apiError('Insufficient permissions', 403, 'FORBIDDEN')
  }

  return user
}

export function isAuthError(result: User | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
