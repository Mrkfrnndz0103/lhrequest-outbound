'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Hook to track page visibility state using the Page Visibility API.
 * Returns whether the page is currently visible and a function to check visibility.
 * Used to pause polling when the tab is hidden to reduce unnecessary network traffic.
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(true)

  const handleVisibilityChange = useCallback(() => {
    setIsVisible(document.visibilityState === 'visible')
  }, [])

  useEffect(() => {
    // Set initial visibility state
    setIsVisible(document.visibilityState === 'visible')

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [handleVisibilityChange])

  return {
    isVisible,
    isHidden: !isVisible,
  }
}
