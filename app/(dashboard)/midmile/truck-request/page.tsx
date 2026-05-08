'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Header } from '@/components/layout/header'
import { useAuth } from '@/components/auth/auth-provider'
import { useRequests } from '@/hooks/use-requests'
import { RequestsTable } from '@/components/requests/requests-table'
import { useSound } from '@/components/notifications/sound-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Clock, CheckCircle, List, Truck } from 'lucide-react'
import type { LineHaulRequest } from '@/lib/types'

const RequestDetailsDialog = dynamic(
  () => import('@/components/requests/action-dialogs').then((mod) => mod.RequestDetailsDialog),
  { ssr: false }
)
const AssignDialog = dynamic(() => import('@/components/requests/action-dialogs').then((mod) => mod.AssignDialog), {
  ssr: false,
})
const RejectDialog = dynamic(() => import('@/components/requests/action-dialogs').then((mod) => mod.RejectDialog), {
  ssr: false,
})

export default function TruckRequestPage() {
  const { user } = useAuth()
  const { requests, isLoading, mutate } = useRequests()
  const { playNotification } = useSound()
  
  const [selectedRequest, setSelectedRequest] = useState<LineHaulRequest | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  // Filter requests
  const pendingMmRequests = requests.filter(r => r.status === 'PENDING_MM')
  const confirmedRequests = requests.filter(r => r.status === 'CONFIRMED')

  const notifyRequestChange = () => {
    playNotification()
  }

  const handleViewDetails = (request: LineHaulRequest) => {
    setSelectedRequest(request)
    setShowDetailsDialog(true)
  }

  const handleAssign = (request: LineHaulRequest) => {
    setSelectedRequest(request)
    setShowConfirmDialog(true)
  }

  const handleReject = (request: LineHaulRequest) => {
    setSelectedRequest(request)
    setShowRejectDialog(true)
  }

  const handleSuccess = () => {
    notifyRequestChange()
    mutate()
  }

  return (
    <>
      <Header title="Truck Request" />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="pending" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="w-4 h-4" />
              Requested
              {pendingMmRequests.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">
                  {pendingMmRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="confirmed" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CheckCircle className="w-4 h-4" />
              Assigned
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
                  <Truck className="w-5 h-5 text-blue-400" />
                  Requested (Pending Assignment)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingMmRequests.length === 0 && !isLoading ? (
                  <div className="text-center py-12">
                    <Truck className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Requested Trucks</h3>
                    <p className="text-muted-foreground">All approved requests have been assigned.</p>
                  </div>
                ) : (
                  <RequestsTable
                    requests={pendingMmRequests}
                    isLoading={isLoading}
                    userRole={user?.role || 'FTE_MM'}
                    onAssign={handleAssign}
                    onReject={handleReject}
                    onViewDetails={handleViewDetails}
                    filterStatus="PENDING_MM"
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="confirmed">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  Assigned (For Docking)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RequestsTable
                  requests={confirmedRequests}
                  isLoading={isLoading}
                  userRole={user?.role || 'FTE_MM'}
                  showActions={false}
                  filterStatus="CONFIRMED"
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
                  userRole={user?.role || 'FTE_MM'}
                  onAssign={handleAssign}
                  onReject={handleReject}
                  onViewDetails={handleViewDetails}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialogs */}
      <RequestDetailsDialog
        request={selectedRequest}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        onSuccess={handleSuccess}
        onAssign={handleAssign}
        onReject={handleReject}
      />

      <AssignDialog
        request={selectedRequest}
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onSuccess={handleSuccess}
      />

      <RejectDialog
        request={selectedRequest}
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onSuccess={handleSuccess}
      />
    </>
  )
}
