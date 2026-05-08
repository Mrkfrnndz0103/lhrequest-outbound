type QueryParam = [string, string]
type QueryParams = Record<string, string | number | boolean | undefined> | QueryParam[]

const SUPABASE_REQUEST_TIMEOUT_MS = 1800
const SUPABASE_RETRY_DELAYS_MS = [250]

export class SupabaseRestError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.name = 'SupabaseRestError'
    this.status = status
    this.details = details
  }
}

function getErrorCode(error: unknown) {
  if (typeof error !== 'object' || !error) return undefined

  if ('code' in error && typeof error.code === 'string') {
    return error.code
  }

  if ('cause' in error) {
    return getErrorCode(error.cause)
  }

  return undefined
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableNetworkError(error: unknown) {
  const code = getErrorCode(error)

  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === 'AbortError') ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT'
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url: URL, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchSupabase(url: URL, init: RequestInit = {}) {
  let lastError: unknown
  const isRead = !init.method || init.method === 'GET'
  const retryDelays = isRead ? [] : SUPABASE_RETRY_DELAYS_MS

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await fetchWithTimeout(url, init)
    } catch (error) {
      lastError = error

      if (!isRetryableNetworkError(error) || attempt === retryDelays.length) {
        break
      }

      await wait(retryDelays[attempt])
    }
  }

  throw new SupabaseRestError(
    'Unable to reach Supabase. Check the network connection, DNS, or Supabase project URL.',
    503,
    {
      code: getErrorCode(lastError),
      message: getErrorMessage(lastError),
    }
  )
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase URL or service role key not configured')
  }

  return {
    url: url.replace(/\/$/, ''),
    key,
  }
}

function appendQuery(url: URL, query?: QueryParams) {
  if (!query) return

  if (Array.isArray(query)) {
    for (const [key, value] of query) {
      url.searchParams.append(key, value)
    }
    return
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }
}

async function parseResponse(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function supabaseRequest<T>(
  table: string,
  query?: QueryParams,
  init: RequestInit = {}
): Promise<T> {
  const { url, key } = getSupabaseConfig()
  const endpoint = new URL(`${url}/rest/v1/${table}`)
  appendQuery(endpoint, query)

  const response = await fetchSupabase(endpoint, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  const body = await parseResponse(response)

  if (!response.ok) {
    const message = typeof body === 'object' && body && 'message' in body
      ? String((body as { message: unknown }).message)
      : `Supabase request failed with ${response.status}`

    throw new SupabaseRestError(message, response.status, body)
  }

  return body as T
}

export async function supabaseCount(
  table: string,
  filters: QueryParam[] = []
): Promise<number> {
  const { url, key } = getSupabaseConfig()
  const endpoint = new URL(`${url}/rest/v1/${table}`)
  appendQuery(endpoint, [['select', 'id'], ...filters])

  const response = await fetchSupabase(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=planned',
      Range: '0-0',
    },
  })

  if (!response.ok) {
    const body = await parseResponse(response)
    const message = typeof body === 'object' && body && 'message' in body
      ? String((body as { message: unknown }).message)
      : `Supabase count failed with ${response.status}`

    throw new SupabaseRestError(message, response.status, body)
  }

  const contentRange = response.headers.get('content-range')
  const count = contentRange?.split('/')[1]
  return count ? Number(count) : 0
}
