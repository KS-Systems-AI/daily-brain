import { NativeModule, requireNativeModule } from 'expo'

declare class DailybrainIntentsModuleType extends NativeModule {
  getSharedData(key: string): string | null
  setSharedData(key: string, value: string): void
  removeSharedData(key: string): void
}

export default requireNativeModule<DailybrainIntentsModuleType>('DailybrainIntents')
