import { NextResponse } from 'next/server'
import { DatabaseError } from './postgres'

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_CONFLICT'
  | 'DATABASE_UNAVAILABLE'
  | 'UNKNOWN_ERROR'

export class RequestConflictError extends Error {
  code: ApiErrorCode = 'REQUEST_CONFLICT'
  status = 409

  constructor(message = 'Request was already updated. Please refresh and try again.') {
    super(message)
    this.name = 'RequestConflictError'
  }
}

export class RequestNotFoundError extends Error {
  code: ApiErrorCode = 'REQUEST_NOT_FOUND'
  status = 404

  constructor(message = 'Request not found') {
    super(message)
    this.name = 'RequestNotFoundError'
  }
}

export function apiError(error: string, status: number, code?: ApiErrorCode, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error, code } : { error, code, details },
    { status }
  )
}

export function validationError(error: string) {
  return apiError(error, 400, 'VALIDATION_ERROR')
}

export function notFoundError(error = 'Not found') {
  return apiError(error, 404, 'REQUEST_NOT_FOUND')
}

export function handleApiError(error: unknown, fallback = 'Unexpected server error') {
  if (error instanceof RequestConflictError || error instanceof RequestNotFoundError) {
    return apiError(error.message, error.status, error.code)
  }

  if (error instanceof DatabaseError) {
    const status = error.status >= 500 ? 503 : error.status
    const message = status === 503 ? 'Database is unavailable. Please try again.' : error.message
    return apiError(message, status, status === 503 ? 'DATABASE_UNAVAILABLE' : 'UNKNOWN_ERROR')
  }

  return apiError(fallback, 500, 'UNKNOWN_ERROR')
}
