'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { Header } from '@/components/layout/header'
import { useAuth } from '@/components/auth/auth-provider'
import { useRequests } from '@/hooks/use-requests'
import { RequestsTable } from '@/components/requests/requests-table'
import { RealtimeStatusBadge } from '@/components/realtime/realtime-status-badge'
import { useSound } from '@/components/notifications/sound-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Clock, List } from 'lucide-react'
import type { LineHaulRequest, RequestStatus } from '@/lib/types'

const RequestForm = dynamic(() => import('@/components/requests/request-form').then((mod) => mod.RequestForm), {
  ssr: false,
})
const RequestDetailsDialog = dynamic(
  () => import('@/components/requests/action-dialogs').then((mod) => mod.RequestDetailsDialog),
  { ssr: false }
)
const RejectDialog = dynamic(() => import('@/components/requests/action-dialogs').then((mod) => mod.RejectDialog), {
  ssr: false,
})
const EditDialog = dynamic(() => import('@/components/requests/action-dialogs').then((mod) => mod.EditDialog), {
  ssr: false,
})

type TableFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  status?: RequestStatus | 'all'
}

const PAGE_SIZE = 50

export default function LHRequestPage() {
  const { user } = useAuth()
  const isOpsPic = user?.role === 'OPS_PIC'
  const isFteOps = user?.role === 'FTE_OPS'
  const [allFilters, setAllFilters] = useState<TableFilters>({})
  const [allOffset, setAllOffset] = useState(0)
  const [pendingFilters, setPendingFilters] = useState<TableFilters>({ status: 'PENDING_OPS' })
  const [pendingOffset, setPendingOffset] = useState(0)
  const allRequests = useRequests({
    enabled: !!user,
    search: allFilters.search,
    dateFrom: allFilters.dateFrom,
    dateTo: allFilters.dateTo,
    status: allFilters.status && allFilters.status !== 'all' ? allFilters.status : undefined,
    opsPicId: isOpsPic ? user?.opsId || user?.email || undefined : undefined,
    limit: PAGE_SIZE,
    offset: allOffset,
  })
  const pendingOps = useRequests({
    enabled: user?.role === 'FTE_OPS',
    search: pendingFilters.search,
    dateFrom: pendingFilters.dateFrom,
    dateTo: pendingFilters.dateTo,
    status: 'PENDING_OPS',
    limit: PAGE_SIZE,
    offset: pendingOffset,
  })
  const { playNotification } = useSound()
  
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LineHaulRequest | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const notifyRequestChange = () => {
    playNotification()
  }

  const handleApprove = async (request: LineHaulRequest) => {
    if (approvingId) return
    setApprovingId(request.id)
    const timestamp = new Date().toISOString()
    const optimisticRequest: LineHaulRequest = {
      ...request,
      status: 'PENDING_MM',
      fteOpsName: user?.name,
      fteOpsTimestamp: timestamp,
      fteOpsRemarks: '',
    }

    allRequests.applyRequestUpdate(optimisticRequest)
    pendingOps.applyRequestUpdate(optimisticRequest)
    setLastUpdated(new Date())

    try {
      const response = await fetch(`/api/azure/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          userName: user?.name,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.code === 'REQUEST_CONFLICT') {
          throw new Error('Request was already updated. Refreshing latest data.')
        }
        throw new Error(data?.error || 'Failed to approve request')
      }

      if (data?.request) {
        allRequests.applyRequestUpdate(data.request)
        pendingOps.applyRequestUpdate(data.request)
      }

      notifyRequestChange()
      toast.success('Request approved')
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to approve:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to approve request')
      allRequests.mutate()
      pendingOps.mutate()
    } finally {
      setApprovingId(null)
    }
  }

  const handleViewDetails = (request: LineHaulRequest) => {
    setSelectedRequest(request)
    setShowDetailsDialog(true)
  }

  const handleReject = (request: LineHaulRequest) => {
    setSelectedRequest(request)
    setShowRejectDialog(true)
  }

  const handleEdit = (request: LineHaulRequest) => {
    setSelectedRequest(request)
    setShowEditDialog(true)
  }

  const handleSuccess = (request?: LineHaulRequest) => {
    notifyRequestChange()
    setLastUpdated(new Date())
    if (request) {
      allRequests.applyRequestUpdate(request)
    } else {
      allRequests.mutate()
    }
    pendingOps.mutate()
  }

  const displayLastUpdated = lastUpdated ?? allRequests.lastUpdated
  const statusBadge = <RealtimeStatusBadge mode={allRequests.realtime.mode} />

  return (
    <>
      <Header title="LH Request" />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        {/* Action Bar */}
        {isOpsPic && (
          <div className="mb-6">
            <Button 
              onClick={() => setShowCreateForm(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Request
            </Button>
          </div>
        )}

        {/* Content based on role */}
        {isOpsPic ? (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <List className="w-5 h-5 text-primary" />
                My Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RequestsTable
                requests={allRequests.requests}
                isLoading={allRequests.isLoading}
                userRole={user?.role || 'OPS_PIC'}
                showActions={false}
                tableMode="myRequests"
                lastUpdated={displayLastUpdated}
                realtimeStatus={statusBadge}
                serverSide
                filters={allFilters}
                pagination={allRequests.pagination}
                onFiltersChange={(nextFilters) => {
                  setAllFilters(nextFilters)
                  setAllOffset(0)
                }}
                onOffsetChange={setAllOffset}
                actionLoadingId={approvingId}
              />
            </CardContent>
          </Card>
        ) : isFteOps ? (
          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="pending" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Clock className="w-4 h-4" />
                Pending
                {pendingOps.requests.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                    {pendingOps.requests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <List className="w-4 h-4" />
                All Requests
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Clock className="w-5 h-5 text-amber-400" />
                    Pending Queue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RequestsTable
                    requests={pendingOps.requests}
                    isLoading={pendingOps.isLoading}
                    userRole={user?.role || 'FTE_OPS'}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={handleEdit}
                    onViewDetails={handleViewDetails}
                    filterStatus="PENDING_OPS"
                    lastUpdated={displayLastUpdated}
                    realtimeStatus={statusBadge}
                    serverSide
                    filters={pendingFilters}
                    pagination={pendingOps.pagination}
                    onFiltersChange={(nextFilters) => {
                      setPendingFilters({ ...nextFilters, status: 'PENDING_OPS' })
                      setPendingOffset(0)
                    }}
                    onOffsetChange={setPendingOffset}
                    actionLoadingId={approvingId}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <List className="w-5 h-5 text-primary" />
                    All Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RequestsTable
                    requests={allRequests.requests}
                    isLoading={allRequests.isLoading}
                    userRole={user?.role || 'FTE_OPS'}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={handleEdit}
                    onViewDetails={handleViewDetails}
                    lastUpdated={displayLastUpdated}
                    realtimeStatus={statusBadge}
                    serverSide
                    filters={allFilters}
                    pagination={allRequests.pagination}
                    onFiltersChange={(nextFilters) => {
                      setAllFilters(nextFilters)
                      setAllOffset(0)
                    }}
                    onOffsetChange={setAllOffset}
                    actionLoadingId={approvingId}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : null}
      </main>

      {/* Dialogs */}
      <RequestForm
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        onSuccess={handleSuccess}
      />

      <RequestDetailsDialog
        request={selectedRequest}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        onSuccess={handleSuccess}
        onApprove={handleApprove}
        onReject={handleReject}
        onEdit={handleEdit}
      />

      <RejectDialog
        request={selectedRequest}
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onSuccess={handleSuccess}
      />

      <EditDialog
        request={selectedRequest}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSuccess={handleSuccess}
      />
    </>
  )
}
