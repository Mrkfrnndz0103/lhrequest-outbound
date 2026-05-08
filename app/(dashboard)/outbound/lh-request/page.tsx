'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Header } from '@/components/layout/header'
import { useAuth } from '@/components/auth/auth-provider'
import { useRequests } from '@/hooks/use-requests'
import { RequestsTable } from '@/components/requests/requests-table'
import { useSound } from '@/components/notifications/sound-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Clock, List } from 'lucide-react'
import type { LineHaulRequest } from '@/lib/types'

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

export default function LHRequestPage() {
  const { user } = useAuth()
  const { requests, isLoading, mutate } = useRequests()
  const { playNotification } = useSound()
  
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LineHaulRequest | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  const isOpsPic = user?.role === 'OPS_PIC'
  const isFteOps = user?.role === 'FTE_OPS'

  // Filter requests
  const pendingOpsRequests = requests.filter(r => r.status === 'PENDING_OPS')
  const myRequests = isOpsPic
    ? requests.filter(r => {
        const requestOpsId = (r.opsPicId || '').toString().trim().toLowerCase()
        const userId = (user?.opsId || user?.email || '').toString().trim().toLowerCase()
        return requestOpsId === userId && requestOpsId !== ''
      })
    : []

  const notifyRequestChange = () => {
    playNotification()
  }

  const handleApprove = async (request: LineHaulRequest) => {
    try {
      const response = await fetch(`/api/supabase/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          userName: user?.name,
        }),
      })

      if (response.ok) {
        notifyRequestChange()
        mutate()
      }
    } catch (error) {
      console.error('Failed to approve:', error)
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

  const handleSuccess = () => {
    notifyRequestChange()
    mutate()
  }

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
                requests={myRequests}
                isLoading={isLoading}
                userRole={user?.role || 'OPS_PIC'}
                showActions={false}
                tableMode="myRequests"
              />
            </CardContent>
          </Card>
        ) : isFteOps ? (
          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="pending" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Clock className="w-4 h-4" />
                Pending
                {pendingOpsRequests.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                    {pendingOpsRequests.length}
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
                    requests={pendingOpsRequests}
                    isLoading={isLoading}
                    userRole={user?.role || 'FTE_OPS'}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={handleEdit}
                    onViewDetails={handleViewDetails}
                    filterStatus="PENDING_OPS"
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
                    requests={requests}
                    isLoading={isLoading}
                    userRole={user?.role || 'FTE_OPS'}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={handleEdit}
                    onViewDetails={handleViewDetails}
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
