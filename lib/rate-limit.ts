import type { NextRequest } from 'next/server'

type RateLimitOptions = {
  namespace: string
  windowMs: number
  maxAttempts: number
}

const attempts = new Map<string, { count: number; resetAt: number }>()

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null

  return {
    url: url.replace(/\/$/, ''),
    token,
  }
}

async function upstashRateLimit(key: string, options: RateLimitOptions) {
  const config = getUpstashConfig()
  if (!config) return null

  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['PEXPIRE', key, options.windowMs, 'NX'],
    ]),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Upstash rate limit failed with ${response.status}`)
  }

  const results = await response.json() as Array<{ result?: unknown; error?: string }>
  const count = Number(results[0]?.result)

  if (!Number.isFinite(count)) {
    throw new Error('Upstash rate limit returned an invalid count')
  }

  return count > options.maxAttempts
}

export function getClientKey(request: NextRequest, namespace: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'local'

  return `${namespace}:${ip}`
}

export async function isRateLimited(key: string, options: RateLimitOptions) {
  try {
    const sharedResult = await upstashRateLimit(key, options)
    if (sharedResult !== null) return sharedResult
  } catch (error) {
    console.error('Shared rate limiter unavailable, using in-memory fallback:', error)
  }

  const now = Date.now()
  const attempt = attempts.get(key)

  if (!attempt || attempt.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + options.windowMs })
    return false
  }

  attempt.count += 1
  return attempt.count > options.maxAttempts
}
