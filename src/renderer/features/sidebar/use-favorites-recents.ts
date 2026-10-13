import { useEffect, useState } from 'react'
import type { FavoriteApp, RecentApp } from '../../shared/types'
import { getApi } from '../../shared/api/electron-api'

export function useFavoritesRecents() {
  const [favorites, setFavorites] = useState<FavoriteApp[]>([])
  const [recentApps, setRecentApps] = useState<RecentApp[]>([])

  useEffect(() => {
    getApi()
      .favorites.load()
      .then((r) => {
        if (r.success && r.data) setFavorites(r.data)
      })
      .catch((err: unknown) => console.error('Failed to load favorites', err))
    getApi()
      .recent.load()
      .then((r) => {
        if (r.success && r.data) setRecentApps(r.data)
      })
      .catch((err: unknown) => console.error('Failed to load recent apps', err))
  }, [])

  const addRecent = (name: string, label: string, major: number) => {
    getApi()
      .recent.add(name, label, major)
      .then((r) => {
        if (r.success && r.data) setRecentApps(r.data)
      })
      .catch((err: unknown) => console.error('Failed to update recent apps', err))
  }

  const toggleFavorite = (name: string, label: string, major: number) => {
    const exists = favorites.some((f) => f.name === name && f.major === major)
    const updated = exists
      ? favorites.filter((f) => !(f.name === name && f.major === major))
      : [...favorites, { name, label, major, addedAt: Date.now() }]
    setFavorites(updated)
    getApi()
      .favorites.save(updated)
      .catch((err: unknown) => console.error('Failed to save favorites', err))
  }

  const isFavorite = (name: string, major: number | null) => favorites.some((f) => f.name === name && f.major === major)

  return { favorites, recentApps, addRecent, toggleFavorite, isFavorite }
}
