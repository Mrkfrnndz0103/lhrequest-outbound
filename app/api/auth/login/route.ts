import { NextRequest, NextResponse } from 'next/server'
import { validateUser } from '@/lib/supabase-database'
import { setAuthCookie } from '@/lib/auth-session'
import { SupabaseRestError } from '@/lib/supabase'

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_ATTEMPTS = 10

function getClientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'local'
}

function isRateLimited(key: string) {
  const now = Date.now()
  const attempt = loginAttempts.get(key)

  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return false
  }

  attempt.count += 1
  return attempt.count > LOGIN_MAX_ATTEMPTS
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(getClientKey(request))) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait and try again.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { identifier, loginType } = body

    if (!identifier || !loginType) {
      return NextResponse.json(
        { error: 'Identifier and login type are required' },
        { status: 400 }
      )
    }

    if (!['fte', 'backroom'].includes(loginType)) {
      return NextResponse.json(
        { error: 'Invalid login type' },
        { status: 400 }
      )
    }

    const user = await validateUser(identifier, loginType)

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const response = NextResponse.json({ user })
    setAuthCookie(response, user)
    return response
  } catch (error) {
    console.error('Login error:', error)
    if (error instanceof SupabaseRestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { error: 'Failed to authenticate' },
      { status: 500 }
    )
  }
}
