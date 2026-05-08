export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `Request failed with ${response.status}`

    throw new ApiError(message, response.status)
  }

  return body as T
}
