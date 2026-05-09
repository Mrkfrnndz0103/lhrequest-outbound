import type { ApiErrorCode } from './api-errors'

type ApiErrorBody = {
  error?: unknown
  code?: unknown
  details?: unknown
}

export class ApiError extends Error {
  status: number
  code?: ApiErrorCode
  details?: unknown

  constructor(message: string, status: number, code?: ApiErrorCode, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? body as ApiErrorBody : null
    const message = errorBody && typeof errorBody.error === 'string'
      ? errorBody.error
      : `Request failed with ${response.status}`
    const code = errorBody && typeof errorBody.code === 'string'
      ? errorBody.code as ApiErrorCode
      : undefined

    throw new ApiError(message, response.status, code, errorBody?.details)
  }

  return body as T
}
