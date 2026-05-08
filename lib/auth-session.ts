import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import type { User } from './types'

export const AUTH_COOKIE_NAME = 'linehaul_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

type SessionPayload = User & {
  exp: number
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('AUTH_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured')
  }
  return secret
}

function sign(value: string) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url')
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function createSessionToken(user: User) {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))

  return `${encodedPayload}.${sign(encodedPayload)}`
}

export function readSessionToken(token?: string): User | null {
  if (!token) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature || !signaturesMatch(signature, sign(encodedPayload))) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return {
      name: payload.name,
      opsId: payload.opsId,
      email: payload.email,
      role: payload.role,
    }
  } catch {
    return null
  }
}

export function getRequestUser(request: NextRequest) {
  return readSessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value)
}

export function setAuthCookie(response: NextResponse, user: User) {
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}
