import { NextRequest, NextResponse } from 'next/server'
import { validateUser } from '@/lib/database'
import { setAuthCookie } from '@/lib/auth-session'
import { apiError, handleApiError, validationError } from '@/lib/api-errors'
import { getClientKey, isRateLimited } from '@/lib/rate-limit'

const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_ATTEMPTS = 10

export async function POST(request: NextRequest) {
  try {
    if (await isRateLimited(getClientKey(request, 'login'), {
      namespace: 'login',
      windowMs: LOGIN_WINDOW_MS,
      maxAttempts: LOGIN_MAX_ATTEMPTS,
    })) {
      return apiError('Too many login attempts. Please wait and try again.', 429, 'FORBIDDEN')
    }

    const body = await request.json()
    const { identifier, loginType } = body

    if (!identifier || !loginType) {
      return validationError('Identifier and login type are required')
    }

    if (!['fte', 'backroom'].includes(loginType)) {
      return validationError('Invalid login type')
    }

    const user = await validateUser(identifier, loginType)

    if (!user) {
      return apiError('Invalid credentials', 401, 'AUTH_REQUIRED')
    }

    const response = NextResponse.json({ user })
    setAuthCookie(response, user)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return handleApiError(error, 'Failed to authenticate')
  }
}
