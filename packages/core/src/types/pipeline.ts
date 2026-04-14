import type { BaseRecord } from './base'

export interface Pipeline extends BaseRecord {
  name: string
  is_default: boolean
}

export interface PipelineStage extends BaseRecord {
  pipeline_id: string
  name: string
  position: number
  color: string | null
}
