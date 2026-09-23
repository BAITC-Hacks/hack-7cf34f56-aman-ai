import { useState } from 'react'
import { Check, Copy, Info, Network, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { roleLabels } from '@/lib/format'
import type { Role } from '@/lib/contracts'

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant="outline"><span className="role-dot" data-role={role} />{roleLabels[role]}</Badge>
}
export function Hint({ text }: { text: string }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={text}><Info /></Button></TooltipTrigger><TooltipContent>{text}</TooltipContent></Tooltip>
}
export function CopyButton({ value, label = 'Копировать gid' }: { value: string; label?: string }) {
  const [message, setMessage] = useState('')
  async function copy() {
    try { await navigator.clipboard.writeText(value); setMessage('Скопировано') } catch { setMessage('Не удалось скопировать') }
  }
  return <><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label} onClick={copy}>{message === 'Скопировано' ? <Check /> : <Copy />}</Button></TooltipTrigger><TooltipContent>{message || label}</TooltipContent></Tooltip><span className="sr-only" role="status">{message}</span></>
}
export function EmptyPanel({ title, description }: { title: string; description: string }) {
  return <Empty><EmptyHeader><EmptyMedia variant="icon"><Network /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>
}
export function ErrorPanel({ error, retry }: { error: string; retry: () => void }) {
  return <div className="error-panel p-4"><Alert variant="destructive"><AlertTitle>Не удалось загрузить</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={retry}><RotateCcw data-icon="inline-start" />Повторить</Button></AlertDescription></Alert></div>
}
export function LoadingPanel() {
  return <div className="flex flex-col gap-4 p-5" role="status" aria-label="Загрузка данных"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-5 w-1/2" /><span className="sr-only">Загрузка данных…</span></div>
}
