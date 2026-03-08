import Store from 'electron-store'
import { IpmSettings, FavoriteApp, RecentApp } from '../types'

interface StoreSchema {
  settings: IpmSettings
  theme: string
  favorites: FavoriteApp[]
  recentApps: RecentApp[]
}

const defaults: StoreSchema = {
  settings: {
    host: 'ipme.integromat.com',
    ipmToken: '',
    ipmeToken: '',
    env: 'staging',
    ipmVersion: '3.20.0'
  },
  theme: 'dark',
  favorites: [],
  recentApps: []
}

const store = new Store<StoreSchema>({ defaults })

export function loadSettings(): IpmSettings {
  const raw = store.get('settings')
  return {
    host: raw.host || defaults.settings.host,
    ipmToken: raw.ipmToken ?? '',
    ipmeToken: raw.ipmeToken ?? '',
    env: raw.env || defaults.settings.env,
    ipmVersion: raw.ipmVersion || defaults.settings.ipmVersion
  }
}

export function saveSettings(settings: IpmSettings): void {
  store.set('settings', settings)
}

export function loadTheme(): string {
  return store.get('theme') || 'dark'
}

export function saveTheme(theme: string): void {
  store.set('theme', theme)
}

export function loadFavorites(): FavoriteApp[] {
  return store.get('favorites') || []
}

export function saveFavorites(favorites: FavoriteApp[]): void {
  store.set('favorites', favorites)
}

export function loadRecentApps(): RecentApp[] {
  return store.get('recentApps') || []
}

export function saveRecentApps(recent: RecentApp[]): void {
  store.set('recentApps', recent)
}
