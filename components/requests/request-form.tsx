'use client'

import { useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { useClusters } from '@/hooks/use-clusters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { LH_TYPES } from '@/lib/constants'
import type { LHType } from '@/lib/types'

interface RequestFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function RequestForm({ open, onOpenChange, onSuccess }: RequestFormProps) {
  const { user } = useAuth()
  const { clusters, isLoading: clustersLoading, isError: clustersError } = useClusters()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    hubCluster: '',
    dockNumber: '',
    backlogs: '',
    lhType: '' as LHType | '',
  })

  const selectedCluster = clusters.find(c => c.name === formData.hubCluster)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/supabase/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hubCluster: formData.hubCluster,
          region: selectedCluster?.region || 'Unknown',
          dockNumber: formData.dockNumber,
          backlogs: parseInt(formData.backlogs, 10),
          lhType: formData.lhType,
          opsPicName: user?.name,
          opsPicId: user?.opsId || user?.email,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create request')
      }

      // Reset form
      setFormData({
        hubCluster: '',
        dockNumber: '',
        backlogs: '',
        lhType: '',
      })
      
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">New LH Request</DialogTitle>
          <DialogDescription>Create a new linehaul request for approval.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Hub/Cluster */}
          <div className="space-y-2">
            <Label htmlFor="hubCluster">Hub/Cluster</Label>
            <Select
              value={formData.hubCluster}
              onValueChange={(value) => setFormData(prev => ({ ...prev, hubCluster: value }))}
            >
              <SelectTrigger className="bg-secondary/30 border-border">
                <SelectValue placeholder={clustersLoading ? "Loading..." : "Select hub/cluster"} />
              </SelectTrigger>
              <SelectContent>
                {clusters.length > 0 ? (
                  clusters.map((cluster) => (
                    <SelectItem key={cluster.name} value={cluster.name}>
                      {cluster.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-clusters" disabled>
                    {clustersError ? 'Unable to load clusters' : 'No clusters available'}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {clustersError && (
              <p className="text-xs text-destructive">
                Cluster list could not load. Please sign in again or refresh the page.
              </p>
            )}
          </div>

          {/* Region (auto-filled) */}
          <div className="space-y-2">
            <Label>Region</Label>
            <Input
              value={selectedCluster?.region || ''}
              readOnly
              className="bg-muted/50 border-border"
              placeholder="Auto-filled from cluster"
            />
          </div>

          {/* Dock Number */}
          <div className="space-y-2">
            <Label htmlFor="dockNumber">Dock #</Label>
            <Input
              id="dockNumber"
              value={formData.dockNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, dockNumber: e.target.value }))}
              placeholder="e.g., DAC 1"
              className="bg-secondary/30 border-border"
              required
            />
          </div>

          {/* Backlogs */}
          <div className="space-y-2">
            <Label htmlFor="backlogs">Backlogs</Label>
            <Input
              id="backlogs"
              type="number"
              min="0"
              value={formData.backlogs}
              onChange={(e) => setFormData(prev => ({ ...prev, backlogs: e.target.value }))}
              placeholder="e.g., 2000"
              className="bg-secondary/30 border-border"
              required
            />
          </div>

          {/* LH Type */}
          <div className="space-y-2">
            <Label htmlFor="lhType">LH Type</Label>
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
              disabled={isSubmitting || !formData.hubCluster || !formData.dockNumber || !formData.backlogs || !formData.lhType}
            >
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create Request'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
