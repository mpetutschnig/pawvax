export type RecentlyViewedSource = 'scan' | 'share' | 'animal'

export interface RecentlyViewedAnimal {
  id: string
  name: string
  species?: string
  breed?: string
  viewedAt: number
  source: RecentlyViewedSource
}

const RECENT_STORAGE_KEY = 'recentlyViewedAnimals'
const TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_ENTRIES = 20

function readRecentStorage(): RecentlyViewedAnimal[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRecentStorage(entries: RecentlyViewedAnimal[]) {
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function getRecentlyViewedAnimals(now = Date.now()): RecentlyViewedAnimal[] {
  const entries = readRecentStorage().filter((entry) => now - entry.viewedAt <= TTL_MS)
  writeRecentStorage(entries)
  return entries.sort((a, b) => b.viewedAt - a.viewedAt)
}

export function addRecentlyViewedAnimal(input: Omit<RecentlyViewedAnimal, 'viewedAt'>) {
  const current = getRecentlyViewedAnimals()
  const next: RecentlyViewedAnimal[] = [
    { ...input, viewedAt: Date.now() },
    ...current.filter((entry) => entry.id !== input.id)
  ]
  writeRecentStorage(next)
}
