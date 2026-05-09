'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { useAuth } from '@/components/auth/auth-provider'
import { usePendingCount } from '@/hooks/use-pending-count'
import { useRequests } from '@/hooks/use-requests'
import { useSound } from '@/components/notifications/sound-provider'
import { RealtimeStatusBadge } from '@/components/realtime/realtime-status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  PackageOpen,
  Search,
  Truck,
  XCircle,
} from 'lucide-react'
import { REQUEST_STATUS_COLORS, REQUEST_STATUS_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { LineHaulRequest, RequestStatus } from '@/lib/types'

const NIGHT_SHIFT_HOURS = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6]

const TrendPanel = dynamic(() => import('@/components/dashboard/dashboard-charts').then((mod) => mod.TrendPanel), {
  ssr: false,
  loading: () => <ChartPanelSkeleton title="Request Trend" />,
})
const StatusDonut = dynamic(() => import('@/components/dashboard/dashboard-charts').then((mod) => mod.StatusDonut), {
  ssr: false,
  loading: () => <ChartPanelSkeleton title="Status Share" />,
})

const STATUS_ACCENTS: Record<RequestStatus, string> = {
  PENDING_OPS: '#f6b73c',
  APPROVED: '#34c78a',
  REJECTED_OPS: '#f05252',
  PENDING_MM: '#4f8df7',
  CONFIRMED: '#22a867',
  REJECTED_MM: '#d946ef',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { pendingOps, pendingMm, isLoading: countLoading } = usePendingCount()
  const { requests, isLoading: requestsLoading, realtime } = useRequests({ limit: 200 })
  const { hasPendingAlerts } = useSound()

  const dashboardData = useMemo(() => buildDashboardData(requests), [requests])
  const isLoading = countLoading || requestsLoading
  const roleLabel = user?.role === 'OPS_PIC' ? 'Ops PIC' : user?.role === 'FTE_OPS' ? 'FTE Ops' : 'FTE MM'
  const alertCount = user?.role === 'FTE_OPS' ? pendingOps : user?.role === 'FTE_MM' ? pendingMm : 0
  const recentRequests = requests.slice(0, 6)

  const stats = [
    {
      title: 'Requested Trucks',
      value: dashboardData.todayTotal,
      icon: PackageOpen,
      panel: 'bg-[#fff9e9] border-[#f7edcf]',
      iconPanel: 'bg-[#ffd85a]',
      iconColor: 'text-[#7a4b00]',
    },
    {
      title: user?.role === 'FTE_MM' ? 'Pending Assignment' : 'Pending Review',
      value: user?.role === 'FTE_MM' ? pendingMm : dashboardData.statusCounts.PENDING_OPS,
      icon: Clock,
      panel: 'bg-[#f1fbf4] border-[#dcefe2]',
      iconPanel: 'bg-[#bdf1ce]',
      iconColor: 'text-[#116b35]',
    },
    {
      title: 'For Docking',
      value: dashboardData.statusCounts.CONFIRMED,
      icon: Truck,
      panel: 'bg-[#fff0fb] border-[#f4dff0]',
      iconPanel: 'bg-[#ffc3ef]',
      iconColor: 'text-[#8b1b67]',
      showDots: true,
    },
    {
      title: 'Rejected',
      value: dashboardData.rejectedTotal,
      icon: XCircle,
      panel: 'bg-[#fff3f2] border-[#f2dfdc]',
      iconPanel: 'bg-[#ffc4c4]',
      iconColor: 'text-[#9a2727]',
      showDots: true,
    },
  ]

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f7f6f2] text-[#201f1c]">
      <div className="z-40 shrink-0 border-b border-[#e7e3dc]/80 bg-[#f7f6f2]/95 px-4 py-2.5 shadow-sm backdrop-blur-md md:px-6 md:py-3">
        <div className="mx-auto max-w-[1440px]">
          <DashboardTopBar
            alertCount={alertCount}
            dateLabel={dashboardData.dateLabel}
            roleLabel={roleLabel}
            userName={user?.name || 'User'}
            realtimeMode={realtime.mode}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-[1440px] space-y-4">

        {hasPendingAlerts && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm animate-pulse">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-amber-600" />
              <div>
                <p className="text-base font-semibold text-amber-900">Action Required</p>
                <p className="text-sm text-amber-700">
                  {user?.role === 'FTE_OPS' && `${pendingOps} request(s) pending approval`}
                  {user?.role === 'FTE_MM' && `${pendingMm} request(s) requested and pending assignment`}
                </p>
              </div>
            </div>
          </div>
        )}

        <section className="grid gap-4 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <MetricSkeleton key={index} />)
          ) : (
            stats.map((stat) => <MetricCard key={stat.title} {...stat} />)
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,0.95fr)]">
          <TrendPanel data={dashboardData.hourlyData} isLoading={requestsLoading} />
          <StatusDonut data={dashboardData.statusBreakdown} isLoading={requestsLoading} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,0.95fr)]">
          <RecentRequestsTable requests={recentRequests} isLoading={requestsLoading} />
          <StatusBreakdown statuses={dashboardData.statusBreakdown} total={requests.length} isLoading={requestsLoading} />
        </section>
        </div>
      </div>
    </main>
  )
}

function DashboardTopBar({
  alertCount,
  dateLabel,
  roleLabel,
  userName,
  realtimeMode,
}: {
  alertCount: number
  dateLabel: string
  roleLabel: string
  userName: string
  realtimeMode: 'connected' | 'reconnecting' | 'polling' | 'offline'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <h1 className="shrink-0 text-2xl font-semibold tracking-normal text-[#201f1c]">Dashboard</h1>
        <button className="inline-flex h-10 max-w-full items-center gap-2 rounded-lg border border-[#dfdcd4] bg-white px-3 text-sm text-[#46423a] shadow-sm">
          <CalendarDays className="size-4" />
          <span className="min-w-0 truncate">{dateLabel}</span>
          <ChevronDown className="size-4 text-[#878179]" />
        </button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
        <div className="relative hidden min-w-0 flex-1 sm:block lg:flex-none">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9a958c]" />
          <Input
            aria-label="Search dashboard"
            className="h-11 w-full min-w-0 rounded-full border-[#e7e3dc] bg-white pl-9 text-base shadow-sm placeholder:text-[#9a958c] sm:min-w-52 lg:w-72"
            placeholder="Search"
          />
        </div>
        <button className="relative flex size-10 items-center justify-center rounded-full border border-[#e7e3dc] bg-white shadow-sm">
          <Bell className="size-5 text-[#201f1c]" />
          {alertCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-[#ff7a1a] px-1 text-xs font-semibold text-white">
              {alertCount}
            </span>
          )}
        </button>
        <RealtimeStatusBadge mode={realtimeMode} className="bg-white" />
        <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 shadow-sm">
          <div className="flex size-9 items-center justify-center rounded-full bg-[#201f1c] text-base font-semibold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="max-w-36 truncate text-sm font-semibold text-[#201f1c]">{userName}</p>
            <p className="text-xs text-[#817b72]">{roleLabel}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  icon: Icon,
  panel,
  iconPanel,
  iconColor,
  showDots,
}: {
  title: string
  value: number
  icon: typeof PackageOpen
  panel: string
  iconPanel: string
  iconColor: string
  showDots?: boolean
}) {
  return (
    <Card className={cn('rounded-lg border shadow-[0_8px_22px_rgba(25,25,25,0.04)]', panel)}>
      <CardContent className="grid min-h-[76px] grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-full shadow-sm', iconPanel)}>
          <Icon className={cn('size-5', iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#3b3934]">{title}</p>
          {showDots ? (
            <div className="mt-2 flex items-center gap-1">
              <>
                <span className="size-2 rounded-full bg-[#c07919]" />
                <span className="size-2 rounded-full bg-[#e1c152]" />
                <span className="size-2 rounded-full bg-[#e8dfca]" />
              </>
            </div>
          ) : (
            <p className="mt-1 text-2xl font-semibold leading-none text-[#201f1c]">{value.toLocaleString()}</p>
          )}
        </div>
        {showDots ? (
          <p className="text-2xl font-semibold leading-none text-[#201f1c] sm:text-3xl">{value.toLocaleString()}</p>
        ) : (
          <span aria-hidden="true" />
        )}
      </CardContent>
    </Card>
  )
}

function MetricSkeleton() {
  return (
    <Card className="rounded-lg border border-[#eee7dc] bg-[#faf8f3] shadow-sm">
      <CardContent className="grid min-h-[76px] grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-10" />
        </div>
        <Skeleton className="h-7 w-14" />
      </CardContent>
    </Card>
  )
}

function ChartPanelSkeleton({ title }: { title: string }) {
  return (
    <Card className="rounded-lg border-0 bg-white shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-[#201f1c]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px] pt-2">
        <Skeleton className="h-full w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

function RecentRequestsTable({ requests, isLoading }: { requests: LineHaulRequest[]; isLoading: boolean }) {
  return (
    <Card className="rounded-lg border-0 bg-white shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-[#201f1c]">Recent Requests</CardTitle>
        <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#eee9e1] bg-white px-3 text-sm text-[#6d665e]">
          Latest
          <ChevronDown className="size-3" />
        </button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex h-44 items-center justify-center text-base text-[#817b72]">No recent requests</div>
        ) : (
          <table className="w-full min-w-[760px] text-left text-base">
            <thead>
              <tr className="text-sm font-medium text-[#817b72]">
                <th className="px-3 py-3">Request ID</th>
                <th className="px-3 py-3">Cluster</th>
                <th className="px-3 py-3">Truck Size</th>
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Dock #</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-[#f0ede7] text-[#201f1c]">
                  <td className="px-3 py-3 font-mono text-sm">{request.id}</td>
                  <td className="px-3 py-3 font-medium">{request.hubCluster}</td>
                  <td className="px-3 py-3">{request.lhType}</td>
                  <td className="px-3 py-3 text-sm text-[#6d665e]">{formatRequestTime(request.requestTime)}</td>
                  <td className="px-3 py-3">
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm font-medium', REQUEST_STATUS_COLORS[request.status])}>
                      {REQUEST_STATUS_LABELS[request.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-medium">{request.dockNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBreakdown({
  statuses,
  total,
  isLoading,
}: {
  statuses: StatusBreakdownData[]
  total: number
  isLoading: boolean
}) {
  return (
    <Card className="rounded-lg border-0 bg-white shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-[#201f1c]">Request Type</CardTitle>
        <span className="text-sm text-[#817b72]">All Time</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {statuses.map((item) => {
              const percent = total > 0 ? Math.round((item.value / total) * 100) : 0
              return (
                <div key={item.status} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-[#fff3e7]">
                    <StatusIcon status={item.status} />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="truncate text-base font-medium text-[#201f1c]">{item.label}</span>
                      <span className="text-sm text-[#9a958c]">{percent}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#eee9e1]">
                      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                  <span className="text-base font-semibold text-[#201f1c]">{item.value.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusIcon({ status }: { status: RequestStatus }) {
  if (status === 'CONFIRMED') return <CheckCircle2 className="size-4 text-[#22a867]" />
  if (status === 'REJECTED_OPS' || status === 'REJECTED_MM') return <XCircle className="size-4 text-[#f05252]" />
  if (status === 'PENDING_MM') return <Truck className="size-4 text-[#4f8df7]" />
  return <Clock className="size-4 text-[#f6b73c]" />
}

function buildDashboardData(requests: LineHaulRequest[]) {
  const today = new Date()
  const currentYear = today.getFullYear()
  const { start: trendStart, end: trendEnd } = getNightShiftWindow(today)
  const statusCounts = {
    PENDING_OPS: 0,
    APPROVED: 0,
    REJECTED_OPS: 0,
    PENDING_MM: 0,
    CONFIRMED: 0,
    REJECTED_MM: 0,
  } satisfies Record<RequestStatus, number>

  const hourlyData: HourlyRequestData[] = NIGHT_SHIFT_HOURS.map((hour) => ({
    hour: formatHourLabel(hour),
    created: 0,
    confirmed: 0,
  }))

  let todayTotal = 0

  requests.forEach((request) => {
    statusCounts[request.status] += 1

    const requestDate = new Date(request.requestTime)
    if (!Number.isNaN(requestDate.getTime())) {
      if (requestDate.toDateString() === today.toDateString()) todayTotal += 1

      if (requestDate >= trendStart && requestDate <= trendEnd) {
        const hourIndex = NIGHT_SHIFT_HOURS.indexOf(requestDate.getHours())
        if (hourIndex >= 0) {
          hourlyData[hourIndex].created += 1
          if (request.status === 'CONFIRMED') {
            hourlyData[hourIndex].confirmed += 1
          }
        }
      }
    }
  })

  const statusBreakdown = (Object.keys(statusCounts) as RequestStatus[]).map((status) => ({
    status,
    label: REQUEST_STATUS_LABELS[status],
    value: statusCounts[status],
    color: STATUS_ACCENTS[status],
  }))

  return {
    dateLabel: `${format(new Date(currentYear, 0, 1), 'MMM d, yyyy')} - ${format(today, 'MMM d, yyyy')}`,
    hourlyData,
    rejectedTotal: statusCounts.REJECTED_OPS + statusCounts.REJECTED_MM,
    statusBreakdown,
    statusCounts,
    todayTotal,
  }
}

function getNightShiftWindow(referenceDate: Date) {
  const start = new Date(referenceDate)
  start.setHours(18, 0, 0, 0)

  if (referenceDate.getHours() < 18) {
    start.setDate(start.getDate() - 1)
  }

  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(6, 59, 59, 999)

  return { start, end }
}

function formatHourLabel(hour: number) {
  return format(new Date(2026, 0, 1, hour), 'ha')
}

function formatRequestTime(timeString: string) {
  const date = new Date(timeString)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return format(date, 'MMM d, yyyy, h:mm a')
}

type HourlyRequestData = {
  hour: string
  created: number
  confirmed: number
}

type StatusBreakdownData = {
  status: RequestStatus
  label: string
  value: number
  color: string
}
