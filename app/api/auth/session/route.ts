import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth-session'

export async function GET(request: NextRequest) {
  const user = getRequestUser(request)

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({ user })
}
