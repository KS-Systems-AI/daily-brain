import DailybrainIntentsModule from './src/DailybrainIntentsModule'

export function getSharedData(key: string): string | null {
  return DailybrainIntentsModule.getSharedData(key)
}

export function setSharedData(key: string, value: string): void {
  DailybrainIntentsModule.setSharedData(key, value)
}

export function removeSharedData(key: string): void {
  DailybrainIntentsModule.removeSharedData(key)
}
