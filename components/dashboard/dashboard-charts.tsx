'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { REQUEST_STATUS_LABELS } from '@/lib/constants'
import type { RequestStatus } from '@/lib/types'

export type HourlyRequestData = {
  hour: string
  created: number
  confirmed: number
}

export type StatusBreakdownData = {
  status: RequestStatus
  label: string
  value: number
  color: string
}

export function ChartPanelSkeleton({ title }: { title: string }) {
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

export function TrendPanel({ data, isLoading }: { data: HourlyRequestData[]; isLoading: boolean }) {
  return (
    <Card className="rounded-lg border-0 bg-white shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-[#201f1c]">Request Trend</CardTitle>
        <div className="flex items-center gap-4 text-sm text-[#6d665e]">
          <span>6 PM - 6 AM</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-[#ff7a1a]" />
            Created
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-[#6f3917]" />
            For Docking
          </span>
        </div>
      </CardHeader>
      <CardContent className="h-[300px] pt-2">
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -18, right: 12, top: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff7a1a" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#ff7a1a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#efece5" vertical={false} />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#817b72', fontSize: 11 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#817b72', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #ede8df', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}
                labelStyle={{ color: '#201f1c', fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="created" stroke="#ff7a1a" strokeWidth={2.5} fill="url(#createdFill)" />
              <Area type="monotone" dataKey="confirmed" stroke="#6f3917" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function StatusDonut({ data, isLoading }: { data: StatusBreakdownData[]; isLoading: boolean }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const confirmed = data.find((item) => item.status === 'CONFIRMED')?.value || 0
  const confirmedPercent = total > 0 ? Math.round((confirmed / total) * 100) : 0

  return (
    <Card className="rounded-lg border-0 bg-white shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-[#201f1c]">Status Share</CardTitle>
        <span className="text-sm text-[#817b72]">All Time</span>
      </CardHeader>
      <CardContent className="h-[300px]">
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="relative h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} innerRadius={58} outerRadius={82} dataKey="value" strokeWidth={0} paddingAngle={2}>
                    {data.map((item) => (
                      <Cell key={item.status} fill={item.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-semibold text-[#201f1c]">{confirmedPercent}%</span>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2 text-sm text-[#6d665e]">
              {data.slice(0, 4).map((item) => (
                <span key={item.status} className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {REQUEST_STATUS_LABELS[item.status]}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
