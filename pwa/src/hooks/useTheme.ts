import { useState, useEffect } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) || 'system'
  })

  useEffect(() => {
    localStorage.setItem('theme', theme)

    // Apply theme to document
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  return { theme, setTheme, toggleTheme }
}
