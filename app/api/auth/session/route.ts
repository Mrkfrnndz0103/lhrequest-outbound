import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth-session'
import { apiError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  const user = getRequestUser(request)

  if (!user) {
    return apiError('Authentication required', 401, 'AUTH_REQUIRED')
  }

  return NextResponse.json({ user })
}
