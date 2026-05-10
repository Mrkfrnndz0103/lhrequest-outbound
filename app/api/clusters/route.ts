import { NextRequest, NextResponse } from 'next/server'
import { getCachedClusters, getClusters } from '@/lib/database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { withTimeout } from '@/lib/api-timeout'
import { handleApiError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request)
    if (isAuthError(user)) return user

    const clusters = await withTimeout(
      getClusters(),
      1000,
      getCachedClusters
    )
    return NextResponse.json(
      { clusters },
      { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Error fetching clusters:', error)
    return handleApiError(error, 'Failed to fetch clusters')
  }
}
