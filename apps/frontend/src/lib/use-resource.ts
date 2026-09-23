import { useEffect, useRef, useState } from 'react'

type Result<T> = { key: string; attempt: number; status: 'error' | 'success'; data?: T; error?: string }
export function useResource<T>(key: string | null, loader: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<Result<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const currentLoader = useRef(loader)
  useEffect(() => { currentLoader.current = loader }, [loader])
  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    currentLoader.current(controller.signal).then(
      data => { if (!controller.signal.aborted) setResult({ key, attempt, status: 'success', data }) },
      error => { if (!controller.signal.aborted) setResult({ key, attempt, status: 'error', error: error instanceof Error ? error.message : 'Не удалось загрузить данные' }) },
    )
    return () => controller.abort()
  }, [key, attempt])
  const active = key !== null && result?.key === key && result.attempt === attempt ? result : null
  return { data: active?.data, error: active?.error, loading: key !== null && !active, retry: () => setAttempt(n => n + 1) }
}
