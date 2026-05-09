import { NextRequest, NextResponse } from 'next/server'
import { getCachedPendingCounts, getPendingCounts } from '@/lib/azure-database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { withTimeout } from '@/lib/api-timeout'
import { handleApiError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request)
    if (isAuthError(user)) return user

    const counts = await withTimeout(
      getPendingCounts(),
      900,
      getCachedPendingCounts
    )
    return NextResponse.json(
      counts,
      { headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=30' } }
    )
  } catch (error) {
    console.error('Error fetching pending counts:', error)
    return handleApiError(error, 'Failed to fetch pending counts')
  }
}
