'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/provider'

type ColumnKey = 'date' | 'amount' | 'debit' | 'credit' | 'recipient' | 'sender' | 'subject' | 'iban'
type ColumnMap = Record<ColumnKey, null | string>

type UploadResult = {
  imported: number
  skipped: number
  categorized: number
  transfers: number
  uncategorized: number
  parseErrors: string[]
}

type UploadErrorResponse = {
  error?: string
  details?: string[]
  needsMapping?: boolean
  headers?: string[]
  columnMap?: Partial<ColumnMap>
}

const EMPTY_COLUMN_MAP: ColumnMap = {
  date: null,
  amount: null,
  debit: null,
  credit: null,
  recipient: null,
  sender: null,
  subject: null,
  iban: null,
}

export function CsvUpload({ onSuccess }: { onSuccess: () => void }): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([])
  const [mappingDetails, setMappingDetails] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMap>(EMPTY_COLUMN_MAP)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()

  async function upload(file: File, columnMap?: ColumnMap): Promise<void> {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Nur CSV-Dateien werden unterstützt')
      return
    }
    setUploading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    if (columnMap) {
      formData.append('mapping', JSON.stringify(columnMap))
    }

    try {
      const res = await fetch('/api/budget/upload', { method: 'POST', body: formData })
      const json = await res.json() as UploadResult & UploadErrorResponse
      if (!res.ok) {
        if (res.status === 422 && json.needsMapping && json.headers?.length) {
          setPendingFile(file)
          setMappingHeaders(json.headers)
          setMappingDetails(json.details ?? [])
          setMapping({
            ...EMPTY_COLUMN_MAP,
            ...json.columnMap,
          })
          setError(null)
        } else {
          setError(json.error ?? 'Upload fehlgeschlagen')
        }
      } else {
        setResult(json)
        setPendingFile(null)
        setMappingHeaders([])
        setMappingDetails([])
        setMapping(EMPTY_COLUMN_MAP)
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

  function updateMapping(field: ColumnKey, value: string): void {
    setMapping((current) => ({
      ...current,
      [field]: value === 'none' ? null : value,
    }))
  }

  async function uploadWithMapping(): Promise<void> {
    if (!pendingFile || !mapping.date || (!mapping.amount && !mapping.debit && !mapping.credit)) {
      setError('Bitte ordne mindestens Datum und Betrag oder Soll/Haben zu.')
      return
    }
    await upload(pendingFile, mapping)
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
            {result.imported} neue Buchungen importiert
            {result.skipped > 0 && (
              <span className="ml-1 font-normal text-green-600">· {result.skipped} Duplikate übersprungen</span>
            )}
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

      {mappingHeaders.length > 0 && pendingFile && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start gap-2">
            <FileText size={16} className="mt-0.5 text-amber-700" />
            <div>
              <p className="text-sm font-medium text-amber-900">Spalten manuell zuordnen</p>
              <p className="text-xs text-amber-800">
                Die Header der CSV konnten nicht sicher erkannt werden. Wir haben die Datei behalten und du kannst die nötigen Spalten jetzt einmalig zuordnen.
              </p>
            </div>
          </div>

          {mappingDetails.length > 0 && (
            <div className="rounded-md bg-white/70 px-3 py-2 text-xs text-amber-800">
              {mappingDetails.join(' · ')}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <MappingSelect
              label="Datum"
              required
              value={mapping.date}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('date', value)}
            />
            <MappingSelect
              label="Betrag"
              value={mapping.amount}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('amount', value)}
              hint="Reicht meistens alleine aus, wenn Einnahmen und Ausgaben in derselben Betragsspalte stehen."
            />
            <MappingSelect
              label="Soll / Lastschrift"
              value={mapping.debit}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('debit', value)}
              hint="Nur zuordnen, wenn deine CSV eine eigene Spalte für Abbuchungen hat. Nicht nötig, wenn 'Betrag' bereits positive und negative Werte enthält."
            />
            <MappingSelect
              label="Haben / Gutschrift"
              value={mapping.credit}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('credit', value)}
              hint="Nur zuordnen, wenn deine CSV eine eigene Spalte für Geldeingänge hat. Zusammen mit 'Soll / Lastschrift' als Alternative zur einzelnen Betragsspalte."
            />
            <MappingSelect
              label="Empfänger"
              value={mapping.recipient}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('recipient', value)}
            />
            <MappingSelect
              label="Sender"
              value={mapping.sender}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('sender', value)}
            />
            <MappingSelect
              label="Verwendungszweck"
              value={mapping.subject}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('subject', value)}
            />
            <MappingSelect
              label="IBAN"
              value={mapping.iban}
              headers={mappingHeaders}
              onChange={(value) => updateMapping('iban', value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => void uploadWithMapping()}
              disabled={uploading || !mapping.date || (!mapping.amount && !mapping.debit && !mapping.credit)}
            >
              CSV mit Zuordnung importieren
            </Button>
            <span className="text-xs text-muted-foreground">
              Betrag oder alternativ Soll/Haben reicht aus.
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPendingFile(null)
                setMappingHeaders([])
                setMappingDetails([])
                setMapping(EMPTY_COLUMN_MAP)
              }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MappingSelect({
  headers,
  hint,
  label,
  onChange,
  required = false,
  value,
}: {
  headers: string[]
  hint?: string
  label: string
  onChange: (value: string) => void
  required?: boolean
  value: null | string
}): React.JSX.Element {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-amber-950">
        {label}
        {required ? ' *' : ''}
      </span>
      <Select value={value ?? 'none'} onValueChange={onChange}>
        <SelectTrigger className="bg-white">
          <SelectValue placeholder="Spalte wählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nicht zuordnen</SelectItem>
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? (
        <span className="block text-[11px] leading-4 text-amber-900/80">
          {hint}
        </span>
      ) : null}
    </label>
  )
}
