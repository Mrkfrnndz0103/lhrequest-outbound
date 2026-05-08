'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Search, Download, Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LineHaulRequest, RequestStatus, UserRole } from '@/lib/types'

interface RequestsTableProps {
  requests: LineHaulRequest[]
  isLoading: boolean
  userRole: UserRole
  onApprove?: (request: LineHaulRequest) => void
  onReject?: (request: LineHaulRequest) => void
  onEdit?: (request: LineHaulRequest) => void
  onAssign?: (request: LineHaulRequest) => void
  onViewDetails?: (request: LineHaulRequest) => void
  showActions?: boolean
  filterStatus?: RequestStatus
  tableMode?: 'default' | 'myRequests'
}

const ITEMS_PER_PAGE = 10

export function RequestsTable({
  requests,
  isLoading,
  userRole,
  onApprove,
  onReject,
  onEdit,
  onAssign,
  onViewDetails,
  showActions = true,
  filterStatus,
  tableMode = 'default',
}: RequestsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(filterStatus || 'all')
  const [currentPage, setCurrentPage] = useState(1)
  const [highlightedRequestIds, setHighlightedRequestIds] = useState<Set<string>>(new Set())
  const previousStatusesRef = useRef<Map<string, RequestStatus>>(new Map())
  const hasTrackedStatusesRef = useRef(false)

  const isMyRequestsTable = tableMode === 'myRequests'
  const visibleColumnCount = isMyRequestsTable ? 9 : showActions ? 10 : 9

  // Safe date formatting function
  const formatRequestTime = (timeString: string) => {
    try {
      const date = new Date(timeString)
      if (isNaN(date.getTime())) {
        return 'Invalid date'
      }
      return format(date, 'MMM d, HH:mm')
    } catch {
      return 'Invalid date'
    }
  }

  const formatRunningTime = (request: LineHaulRequest) => {
    const start = new Date(request.requestTime)
    const endTimestamp =
      request.status === 'CONFIRMED' || request.status === 'REJECTED_MM'
        ? request.fteMmTimestamp
        : request.status === 'PENDING_MM' || request.status === 'APPROVED' || request.status === 'REJECTED_OPS'
          ? request.fteOpsTimestamp
          : undefined

    const end = endTimestamp ? new Date(endTimestamp) : new Date()

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return '-'
    }

    const totalMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000))
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60

    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  useEffect(() => {
    if (!isMyRequestsTable) return

    const changedRequestIds: string[] = []
    const nextStatuses = new Map<string, RequestStatus>()

    requests.forEach((request) => {
      nextStatuses.set(request.id, request.status)
      const previousStatus = previousStatusesRef.current.get(request.id)

      if (hasTrackedStatusesRef.current && previousStatus && previousStatus !== request.status) {
        changedRequestIds.push(request.id)
      }
    })

    previousStatusesRef.current = nextStatuses
    hasTrackedStatusesRef.current = true

    if (!changedRequestIds.length) return

    setHighlightedRequestIds((current) => {
      const next = new Set(current)
      changedRequestIds.forEach((id) => next.add(id))
      return next
    })

    const timeout = window.setTimeout(() => {
      setHighlightedRequestIds((current) => {
        const next = new Set(current)
        changedRequestIds.forEach((id) => next.delete(id))
        return next
      })
    }, 6000)

    return () => window.clearTimeout(timeout)
  }, [isMyRequestsTable, requests])

  // Filter requests
  let filteredRequests = requests

  if (searchTerm) {
    const search = searchTerm.toLowerCase()
    filteredRequests = filteredRequests.filter(r =>
      r.plateNumber?.toLowerCase().includes(search) ||
      r.hubCluster.toLowerCase().includes(search) ||
      r.id.toLowerCase().includes(search)
    )
  }

  if (dateFrom) {
    const fromDate = new Date(dateFrom)
    filteredRequests = filteredRequests.filter(r => {
      const requestDate = new Date(r.requestTime)
      return !isNaN(requestDate.getTime()) && requestDate >= fromDate
    })
  }

  if (dateTo) {
    const toDate = new Date(dateTo)
    toDate.setHours(23, 59, 59, 999)
    filteredRequests = filteredRequests.filter(r => {
      const requestDate = new Date(r.requestTime)
      return !isNaN(requestDate.getTime()) && requestDate <= toDate
    })
  }

  if (statusFilter && statusFilter !== 'all') {
    filteredRequests = filteredRequests.filter(r => r.status === statusFilter)
  }

  // Pagination
  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE)
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Export to CSV
  const exportToCSV = () => {
    const headers = isMyRequestsTable
      ? ['Status', 'Request TS', 'Cluster', 'Region', 'Dock #', 'Backlogs', 'Truck Size', 'Plate #', 'Running Time']
      : ['ID', 'Request Time', 'Hub/Cluster', 'Region', 'Dock #', 'Backlogs', 'LH Type', 'Status', 'Plate #', 'Ops PIC']
    const rows = filteredRequests.map(r => (
      isMyRequestsTable
        ? [
            REQUEST_STATUS_LABELS[r.status],
            formatRequestTime(r.requestTime),
            r.hubCluster,
            r.region,
            r.dockNumber,
            r.backlogs,
            r.lhType,
            r.plateNumber || '',
            formatRunningTime(r),
          ]
        : [
            r.id,
            formatRequestTime(r.requestTime),
            r.hubCluster,
            r.region,
            r.dockNumber,
            r.backlogs,
            r.lhType,
            REQUEST_STATUS_LABELS[r.status],
            r.plateNumber || '',
            r.opsPicName,
          ]
    ))

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `linehaul-requests-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const canTakeAction = (request: LineHaulRequest) => {
    if (userRole === 'FTE_OPS' && request.status === 'PENDING_OPS') return true
    if (userRole === 'FTE_MM' && request.status === 'PENDING_MM') return true
    return false
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by Plate #, Hub, or ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-9 bg-secondary/30 border-border"
          />
        </div>
        
        <div className="flex gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-9 w-40 bg-secondary/30 border-border"
              placeholder="From"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-9 w-40 bg-secondary/30 border-border"
              placeholder="To"
            />
          </div>
        </div>

        {!filterStatus && (
          <Select value={statusFilter} onValueChange={(v) => {
            setStatusFilter(v)
            setCurrentPage(1)
          }}>
            <SelectTrigger className="w-40 bg-secondary/30 border-border">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING_OPS">Pending</SelectItem>
              <SelectItem value="PENDING_MM">Requested</SelectItem>
              <SelectItem value="CONFIRMED">Assigned</SelectItem>
              <SelectItem value="REJECTED_OPS">Rejected (Ops)</SelectItem>
              <SelectItem value="REJECTED_MM">Rejected (MM)</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" onClick={exportToCSV} className="shrink-0">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              {isMyRequestsTable ? (
                <>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">request TS</TableHead>
                  <TableHead className="text-muted-foreground">Cluster</TableHead>
                  <TableHead className="text-muted-foreground">Region</TableHead>
                  <TableHead className="text-muted-foreground">Dock #</TableHead>
                  <TableHead className="text-muted-foreground">Backlogs</TableHead>
                  <TableHead className="text-muted-foreground">Truck Size</TableHead>
                  <TableHead className="text-muted-foreground">Plate #</TableHead>
                  <TableHead className="text-muted-foreground">Running Time</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-muted-foreground">Time</TableHead>
                  <TableHead className="text-muted-foreground">Hub/Cluster</TableHead>
                  <TableHead className="text-muted-foreground">Region</TableHead>
                  <TableHead className="text-muted-foreground">Dock #</TableHead>
                  <TableHead className="text-muted-foreground">Backlogs</TableHead>
                  <TableHead className="text-muted-foreground">LH Type</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Plate #</TableHead>
                  <TableHead className="text-muted-foreground">Ops PIC</TableHead>
                  {showActions && <TableHead className="text-muted-foreground text-right">Actions</TableHead>}
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: visibleColumnCount }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginatedRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="text-center py-8 text-muted-foreground">
                  No requests found
                </TableCell>
              </TableRow>
            ) : (
              paginatedRequests.map((request, index) => (
                <TableRow
                  key={request.id || `request-${index}`}
                  className={cn(
                    "hover:bg-muted/20 transition-colors duration-300",
                    highlightedRequestIds.has(request.id) && "animate-status-row border-l-2 border-l-primary bg-primary/10",
                    canTakeAction(request) && onViewDetails && "cursor-pointer animate-pulse"
                  )}
                  onClick={() => {
                    if (canTakeAction(request)) {
                      onViewDetails?.(request)
                    }
                  }}
                >
                  {isMyRequestsTable ? (
                    <>
                      <TableCell>
                        <span className={cn(
                          'inline-flex px-2 py-0.5 text-xs font-medium rounded-full border transition-all duration-300',
                          REQUEST_STATUS_COLORS[request.status],
                          highlightedRequestIds.has(request.id) && 'animate-status-badge'
                        )}>
                          {REQUEST_STATUS_LABELS[request.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{formatRequestTime(request.requestTime)}</TableCell>
                      <TableCell className="font-medium">{request.hubCluster}</TableCell>
                      <TableCell>{request.region}</TableCell>
                      <TableCell>{request.dockNumber}</TableCell>
                      <TableCell>{request.backlogs.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {request.lhType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-primary">
                        {request.plateNumber || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatRunningTime(request)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-sm">
                        {formatRequestTime(request.requestTime)}
                      </TableCell>
                      <TableCell className="font-medium">{request.hubCluster}</TableCell>
                      <TableCell>{request.region}</TableCell>
                      <TableCell>{request.dockNumber}</TableCell>
                      <TableCell>{request.backlogs.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {request.lhType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'inline-flex px-2 py-0.5 text-xs font-medium rounded-full border',
                          REQUEST_STATUS_COLORS[request.status]
                        )}>
                          {REQUEST_STATUS_LABELS[request.status]}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-primary">
                        {request.plateNumber || '-'}
                      </TableCell>
                      <TableCell className="text-sm">{request.opsPicName}</TableCell>
                    </>
                  )}
                  {showActions && (
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      {canTakeAction(request) && (
                        <div className="flex gap-1 justify-end">
                          {onViewDetails ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => onViewDetails(request)}
                            >
                              View
                            </Button>
                          ) : (
                            <>
                              {request.status === 'PENDING_OPS' && userRole === 'FTE_OPS' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                    onClick={() => onApprove?.(request)}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    onClick={() => onReject?.(request)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                    onClick={() => onEdit?.(request)}
                                  >
                                    Edit
                                  </Button>
                                </>
                              )}
                              {request.status === 'PENDING_MM' && userRole === 'FTE_MM' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                    onClick={() => onAssign?.(request)}
                                  >
                                    Assign
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    onClick={() => onReject?.(request)}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length} results
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(pageNum)}
                  className="w-8"
                >
                  {pageNum}
                </Button>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
