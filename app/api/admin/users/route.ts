import { NextRequest } from 'next/server'
import { createUser } from '@/lib/database'
import { apiError, handleApiError, validationError } from '@/lib/api-errors'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { query } from '@/lib/postgres'
import type { UserRole } from '@/lib/types'

const VALID_ROLES = new Set<UserRole>(['OPS_PIC', 'FTE_OPS', 'FTE_MM'])

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  const currentUser = requireUser(request, ['FTE_OPS', 'FTE_MM'])
  if (isAuthError(currentUser)) return currentUser

  try {
    const body = await request.json()
    const name = cleanString(body.name)
    const role = cleanString(body.role).toUpperCase() as UserRole
    const opsId = cleanString(body.opsId)
    const email = cleanString(body.email).toLowerCase()

    if (!name) {
      return validationError('Name is required')
    }

    if (!VALID_ROLES.has(role)) {
      return validationError('User type is required')
    }

    if (role === 'OPS_PIC' && !opsId) {
      return validationError('OPS ID is required for Ops PIC users')
    }

    if ((role === 'FTE_OPS' || role === 'FTE_MM') && !email) {
      return validationError('Email is required for FTE users')
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return validationError('Enter a valid email address')
    }

    const duplicate = await query<{ exists: boolean }>(
      `select exists (
        select 1
        from public.users
        where ($1::text is not null and ops_id ilike $1)
           or ($2::text is not null and email ilike $2)
      )`,
      [opsId || null, email || null]
    )

    if (duplicate.rows[0]?.exists) {
      return apiError('A user with that OPS ID or email already exists', 409, 'VALIDATION_ERROR')
    }

    const user = await createUser({
      name,
      role,
      opsId: opsId || null,
      email: email || null,
    })

    return Response.json({ user })
  } catch (error) {
    console.error('Create user error:', error)
    return handleApiError(error, 'Failed to create user')
  }
}
