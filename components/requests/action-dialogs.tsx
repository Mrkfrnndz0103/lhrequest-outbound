'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { useClusters } from '@/hooks/use-clusters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { LH_TYPES, REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { LineHaulRequest, LHType } from '@/lib/types'

interface BaseDialogProps {
  request: LineHaulRequest | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface RequestDetailsDialogProps extends BaseDialogProps {
  onApprove?: (request: LineHaulRequest) => void
  onReject?: (request: LineHaulRequest) => void
  onEdit?: (request: LineHaulRequest) => void
  onAssign?: (request: LineHaulRequest) => void
}

function DetailItem({ label, value, mono = false }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium text-foreground", mono && "font-mono")}>{value || '-'}</p>
    </div>
  )
}

function getActionErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object') {
    if ('code' in data && data.code === 'REQUEST_CONFLICT') {
      return 'Request was already updated. Please refresh and try again.'
    }

    if ('error' in data && typeof data.error === 'string') {
      return data.error
    }
  }

  return fallback
}

export function RequestDetailsDialog({
  request,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onEdit,
  onAssign,
}: RequestDetailsDialogProps) {
  const isOpsPending = request?.status === 'PENDING_OPS'
  const isMmPending = request?.status === 'PENDING_MM'

  const closeAndRun = (action?: (request: LineHaulRequest) => void) => {
    if (!request || !action) return
    onOpenChange(false)
    action(request)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Request Details</DialogTitle>
          <DialogDescription>
            Review the request details before taking action.
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="space-y-5 mt-2">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Request ID</p>
                <p className="font-mono text-sm font-semibold text-foreground">{request.id}</p>
              </div>
              <span className={cn(
                'inline-flex w-fit px-2 py-0.5 text-xs font-medium rounded-full border',
                REQUEST_STATUS_COLORS[request.status]
              )}>
                {REQUEST_STATUS_LABELS[request.status]}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <DetailItem label="Hub/Cluster" value={request.hubCluster} />
              <DetailItem label="Region" value={request.region} />
              <DetailItem label="Dock #" value={request.dockNumber} />
              <DetailItem label="Backlogs" value={request.backlogs.toLocaleString()} />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">LH Type</p>
                <Badge variant="outline" className="font-mono">{request.lhType}</Badge>
              </div>
              <DetailItem label="Plate #" value={request.plateNumber} mono />
              <DetailItem label="Ops PIC" value={request.opsPicName} />
              <DetailItem label="FTE Ops" value={request.fteOpsName} />
              <DetailItem label="FTE MM" value={request.fteMmName} />
              <DetailItem label="LH Trip" value={request.lhTrip} mono />
              <DetailItem label="FTE Ops Remarks" value={request.fteOpsRemarks} />
              <DetailItem label="FTE MM Remarks" value={request.fteMmRemarks} />
            </div>

            {(isOpsPending || isMmPending) && (
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                {isOpsPending && (
                  <>
                    <Button type="button" variant="outline" onClick={() => closeAndRun(onEdit)}>
                      Edit
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => closeAndRun(onReject)}>
                      Cancel
                    </Button>
                    <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={() => closeAndRun(onApprove)}>
                      Approve
                    </Button>
                  </>
                )}
                {isMmPending && (
                  <>
                    <Button type="button" variant="destructive" onClick={() => closeAndRun(onReject)}>
                      Cancel
                    </Button>
                    <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={() => closeAndRun(onAssign)}>
                      Assign
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Reject Dialog (for both FTE Ops and FTE MM)
export function RejectDialog({ request, open, onOpenChange, onSuccess }: BaseDialogProps) {
  const { user } = useAuth()
  const [remarks, setRemarks] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isMmReject = request?.status === 'PENDING_MM'
  const dialogTitle = isMmReject ? 'Reject Request' : 'Cancel Request'
  const submitLabel = isMmReject ? 'Reject' : 'Cancel'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!request || !remarks.trim()) return

    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/azure/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isMmReject ? 'reject_mm' : 'reject_ops',
          userName: user?.name,
          remarks,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(getActionErrorMessage(data, 'Failed to reject request'))
      }

      setRemarks('')
      onSuccess()
      toast.success(isMmReject ? 'Request rejected' : 'Request canceled')
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject request'
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isMmReject ? 'Provide a reason for rejecting this request.' : 'Provide a reason for canceling this request.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="p-3 rounded-lg bg-muted/30 space-y-1">
            <p className="text-sm text-muted-foreground">Request ID</p>
            <p className="font-mono text-foreground">{request?.id}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks (Required)</Label>
            <Textarea
              id="remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Enter reason for rejection..."
              className="bg-secondary/30 border-border min-h-[100px]"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isMmReject ? 'destructive' : 'outline'}
              className="flex-1"
              disabled={isSubmitting || !remarks.trim()}
            >
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2" />
                  {submitLabel}ing...
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Assign Dialog (for FTE MM - assign plate number)
export function AssignDialog({ request, open, onOpenChange, onSuccess }: BaseDialogProps) {
  const { user } = useAuth()
  const [plateNumber, setPlateNumber] = useState('')
  const [lhTrip, setLhTrip] = useState('')
  const [remarks, setRemarks] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!request || !plateNumber.trim()) return

    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/azure/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          userName: user?.name,
          plateNumber,
          lhTrip,
          remarks,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(getActionErrorMessage(data, 'Failed to assign request'))
      }

      setPlateNumber('')
      setLhTrip('')
      setRemarks('')
      onSuccess()
      toast.success('Truck assigned')
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign request'
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Assign Truck</DialogTitle>
          <DialogDescription>
            Assign a plate number to route this request to For Docking.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="p-3 rounded-lg bg-muted/30 grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Hub/Cluster</p>
              <p className="font-medium text-foreground">{request?.hubCluster}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">LH Type</p>
              <p className="font-medium text-foreground">{request?.lhType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dock #</p>
              <p className="font-medium text-foreground">{request?.dockNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Backlogs</p>
              <p className="font-medium text-foreground">{request?.backlogs?.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plateNumber">Plate Number (Required)</Label>
            <Input
              id="plateNumber"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
              placeholder="e.g., ABC 123"
              className="bg-secondary/30 border-border font-mono uppercase"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lhTrip">LH Trip</Label>
            <Input
              id="lhTrip"
              value={lhTrip}
              onChange={(e) => setLhTrip(e.target.value)}
              placeholder="e.g., LT1Q510286JE1"
              className="bg-secondary/30 border-border font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmRemarks">Remarks (Optional)</Label>
            <Textarea
              id="confirmRemarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any additional notes..."
              className="bg-secondary/30 border-border"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={isSubmitting || !plateNumber.trim()}
            >
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2" />
                  Assigning...
                </>
              ) : (
                'Assign'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Edit Dialog (for FTE Ops)
export function EditDialog({ request, open, onOpenChange, onSuccess }: BaseDialogProps) {
  const { user } = useAuth()
  const { clusters } = useClusters()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    hubCluster: request?.hubCluster || '',
    dockNumber: request?.dockNumber || '',
    backlogs: request?.backlogs?.toString() || '',
    lhType: (request?.lhType || '') as LHType | '',
  })

  // Update form when the dialog opens or the selected request changes.
  useEffect(() => {
    if (open && request) {
      setFormData({
        hubCluster: request.hubCluster,
        dockNumber: request.dockNumber,
        backlogs: request.backlogs.toString(),
        lhType: request.lhType,
      })
    }
  }, [
    open,
    request?.id,
    request?.hubCluster,
    request?.dockNumber,
    request?.backlogs,
    request?.lhType,
  ])

  const selectedCluster = clusters.find(c => c.name === formData.hubCluster)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!request) return

    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/azure/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          userName: user?.name,
          hubCluster: formData.hubCluster,
          region: selectedCluster?.region || request.region,
          dockNumber: formData.dockNumber,
          backlogs: parseInt(formData.backlogs, 10),
          lhType: formData.lhType,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(getActionErrorMessage(data, 'Failed to edit request'))
      }

      onSuccess()
      toast.success('Request updated')
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to edit request'
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Request</DialogTitle>
          <DialogDescription>
            Modify the request details before approval.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="editHubCluster">Hub/Cluster</Label>
            <Select
              value={formData.hubCluster}
              onValueChange={(value) => setFormData(prev => ({ ...prev, hubCluster: value }))}
            >
              <SelectTrigger className="bg-secondary/30 border-border">
                <SelectValue placeholder="Select hub/cluster" />
              </SelectTrigger>
              <SelectContent>
                {clusters.map((cluster) => (
                  <SelectItem key={cluster.name} value={cluster.name}>
                    {cluster.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Region</Label>
            <Input
              value={selectedCluster?.region || request?.region || ''}
              readOnly
              className="bg-muted/50 border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editDockNumber">Dock #</Label>
            <Input
              id="editDockNumber"
              value={formData.dockNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, dockNumber: e.target.value }))}
              className="bg-secondary/30 border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editBacklogs">Backlogs</Label>
            <Input
              id="editBacklogs"
              type="number"
              min="0"
              value={formData.backlogs}
              onChange={(e) => setFormData(prev => ({ ...prev, backlogs: e.target.value }))}
              className="bg-secondary/30 border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editLhType">LH Type</Label>
            <Select
              value={formData.lhType}
              onValueChange={(value) => setFormData(prev => ({ ...prev, lhType: value as LHType }))}
            >
              <SelectTrigger className="bg-secondary/30 border-border">
                <SelectValue placeholder="Select LH type" />
              </SelectTrigger>
              <SelectContent>
                {LH_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary hover:bg-primary/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
