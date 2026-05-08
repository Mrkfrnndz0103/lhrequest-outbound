'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative flex h-8 w-[3.25rem] items-center rounded-full border px-1 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDark
          ? 'border-border bg-secondary'
          : 'border-border bg-secondary'
      )}
    >
      {/* Track icons */}
      <Sun className="absolute left-1.5 h-3.5 w-3.5 text-amber-500 transition-opacity duration-200" style={{ opacity: isDark ? 0.3 : 1 }} aria-hidden />
      <Moon className="absolute right-1.5 h-3.5 w-3.5 text-sky-400 transition-opacity duration-200" style={{ opacity: isDark ? 1 : 0.3 }} aria-hidden />

      {/* Thumb */}
      <span
        className={cn(
          'absolute h-5 w-5 rounded-full bg-primary shadow-sm transition-transform duration-300',
          isDark ? 'translate-x-[1.75rem]' : 'translate-x-0'
        )}
      />
    </button>
  )
}
