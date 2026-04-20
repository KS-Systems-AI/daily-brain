'use client'

import * as React from 'react'
import { FileText, ImageIcon, Trash2, Download, Loader2, Upload, FileIcon, Search } from 'lucide-react'
import { trpc } from '@/lib/trpc/provider'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

interface AttachmentsTabProps {
  contactId?: string
  companyId?: string
}

type UploadState = { filename: string; progress: number }

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.docx,.xlsx'
const MAX_MB = 50

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime: string): React.JSX.Element {
  if (mime.startsWith('image/')) return <ImageIcon className="size-4 shrink-0 text-blue-500" />
  if (mime === 'application/pdf') return <FileText className="size-4 shrink-0 text-red-500" />
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />
}

export function AttachmentsTab({ contactId, companyId }: AttachmentsTabProps): React.JSX.Element {
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const [uploads, setUploads] = React.useState<UploadState[]>([])
  const [search, setSearch] = React.useState('')
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const listFilter = contactId ? { contact_id: contactId } : { company_id: companyId! }
  const listQuery = trpc.attachments.list.useQuery(listFilter)
  const getUploadUrl = trpc.attachments.getUploadUrl.useMutation()
  const confirmUpload = trpc.attachments.confirmUpload.useMutation()
  const deleteMutation = trpc.attachments.delete.useMutation({
    onSuccess: () => void utils.attachments.list.invalidate(listFilter),
    onError: (err) => toast({ title: 'Löschen fehlgeschlagen', description: err.message, variant: 'destructive' }),
  })

  const handleFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return

      for (const file of Array.from(files)) {
        if (file.size > MAX_MB * 1024 * 1024) {
          toast({ title: `${file.name} ist zu groß (max. ${MAX_MB} MB)`, variant: 'destructive' })
          continue
        }

        setUploads((prev) => [...prev, { filename: file.name, progress: 0 }])

        try {
          const { token, attachmentId, storageKey } = await getUploadUrl.mutateAsync({
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            contact_id: contactId ?? undefined,
            company_id: companyId ?? undefined,
          })

          // Upload directly to Supabase Storage using storageKey as path
          const supabase = createClient()
          const { error } = await supabase.storage
            .from('attachments')
            .uploadToSignedUrl(storageKey, token, file, {
              contentType: file.type,
            })

          if (error) throw new Error(error.message)

          await confirmUpload.mutateAsync({ attachmentId })
          void utils.attachments.list.invalidate(listFilter)

          void fetch('/api/attachments/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachmentId }),
          }).then(() => utils.attachments.list.invalidate(listFilter))

          toast({ title: `${file.name} hochgeladen`, description: 'OCR läuft im Hintergrund.', variant: 'success' })
        } catch (err) {
          toast({
            title: `Upload fehlgeschlagen: ${file.name}`,
            description: err instanceof Error ? err.message : 'Unbekannter Fehler',
            variant: 'destructive',
          })
        } finally {
          setUploads((prev) => prev.filter((u) => u.filename !== file.name))
        }
      }
    },
    [contactId, getUploadUrl, confirmUpload, utils, toast],
  )

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      void handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const filtered = React.useMemo(() => {
    if (!listQuery.data) return []
    const q = search.toLowerCase()
    if (!q) return listQuery.data
    return listQuery.data.filter(
      (a) =>
        a.filename.toLowerCase().includes(q) ||
        a.ai_summary?.toLowerCase().includes(q) ||
        a.ocr_text?.toLowerCase().includes(q),
    )
  }, [listQuery.data, search])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dateien oder Inhalte durchsuchen…"
            className="h-8 pl-8 text-[12px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Hochladen
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 text-center transition-colors',
          dragging ? 'border-orange-400 bg-orange-50/20' : 'border-border hover:border-muted-foreground/50',
        )}
      >
        <Upload className="mb-2 size-6 text-muted-foreground" />
        <p className="text-[12px] font-medium text-foreground">Dateien hierher ziehen</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">PDF, Bilder, Word, Excel, Text · max. {MAX_MB} MB</p>
      </div>

      {/* Active uploads */}
      {uploads.map((u) => (
        <div key={u.filename} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          <span className="flex-1 truncate text-[12px]">{u.filename}</span>
          <span className="text-[11px] text-muted-foreground">Wird hochgeladen…</span>
        </div>
      ))}

      {/* File list */}
      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Lade Dateien…
        </div>
      ) : filtered.length === 0 && !uploads.length ? (
        <p className="text-[12px] text-muted-foreground">
          {search ? 'Keine Dateien gefunden.' : 'Noch keine Dateien hochgeladen.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {filtered.map((a, i) => (
            <div
              key={a.id}
              className={cn(
                'flex items-start gap-3 px-3 py-2.5',
                i !== 0 && 'border-t border-border',
              )}
            >
              {fileIcon(a.mime_type)}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-foreground">{a.filename}</p>
                {a.ai_summary ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{a.ai_summary}</p>
                ) : a.ocr_status === 'processing' ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> OCR läuft…
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {formatBytes(a.size_bytes)} · {new Date(a.created_at).toLocaleDateString('de-DE')}
                    {a.uploaded_by.full_name ? ` · ${a.uploaded_by.full_name}` : ''}
                  </span>
                  {a.ocr_method ? (
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium',
                      a.ocr_method === 'pdf-text'      && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                      a.ocr_method === 'claude-vision' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                      a.ocr_method === 'skipped'       && 'bg-muted text-muted-foreground',
                    )}>
                      {a.ocr_method === 'pdf-text'       ? 'PDF-Text'
                       : a.ocr_method === 'claude-vision' ? 'Claude Vision'
                       : 'Kein OCR'}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Herunterladen"
                  >
                    <Download className="size-3.5" />
                  </a>
                ) : null}
                <button
                  type="button"
                  title="Löschen"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ id: a.id })}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
