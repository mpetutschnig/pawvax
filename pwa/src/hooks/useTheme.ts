import { useState, useEffect } from 'react'

export type ThemeMode = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme') as ThemeMode
    if (saved === 'light' || saved === 'dark') return saved
    // Default to light theme; ignore OS prefers-color-scheme so new users land on light
    return 'light'
  })

  useEffect(() => {
    localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggleTheme }
}
