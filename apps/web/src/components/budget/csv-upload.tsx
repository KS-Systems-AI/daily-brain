'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/provider'

type UploadResult = {
  imported: number
  categorized: number
  transfers: number
  uncategorized: number
  parseErrors: string[]
}

export function CsvUpload({ onSuccess }: { onSuccess: () => void }): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()

  async function upload(file: File): Promise<void> {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Nur CSV-Dateien werden unterstützt')
      return
    }
    setUploading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/budget/upload', { method: 'POST', body: formData })
      const json = await res.json() as UploadResult & { error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Upload fehlgeschlagen')
      } else {
        setResult(json)
        await utils.budget.invalidate()
        onSuccess()
      }
    } catch {
      setError('Netzwerkfehler beim Upload')
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void upload(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file) void upload(file)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50',
          uploading && 'pointer-events-none opacity-60',
        )}
      >
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
        {uploading ? (
          <>
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Wird importiert...</p>
          </>
        ) : (
          <>
            <Upload size={28} className="text-muted-foreground" />
            <p className="text-sm font-medium">CSV-Datei hochladen</p>
            <p className="text-xs text-muted-foreground">Drag & Drop oder klicken — DKB, Sparkasse, ING, Comdirect, N26 u.a.</p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md bg-green-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-green-800">
            <CheckCircle2 size={14} />
            {result.imported} Buchungen importiert
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-green-700">
            <span>Auto-kategorisiert: {result.categorized}</span>
            <span>Umbuchungen: {result.transfers}</span>
            <span>Unkategorisiert: {result.uncategorized}</span>
          </div>
          {result.parseErrors.length > 0 && (
            <div className="mt-2 text-xs text-amber-700">
              {result.parseErrors.length} Zeilen übersprungen
            </div>
          )}
        </div>
      )}
    </div>
  )
}
