import { useEffect, useState } from 'react'
import { http } from '@/services/http'

/** Carga una lista corta (hasta 200) de un endpoint, p. ej. para llenar un selector. */
export function useList<T>(endpoint: string, params: Record<string, string> = {}): T[] {
  const [items, setItems] = useState<T[]>([])
  const clave = JSON.stringify(params)
  useEffect(() => {
    let cancelado = false
    http
      .get<{ results: T[] }>(endpoint, { params: { page_size: 200, ...JSON.parse(clave) } })
      .then(({ data }) => {
        if (!cancelado) setItems(data.results)
      })
      .catch(() => undefined)
    return () => {
      cancelado = true
    }
  }, [endpoint, clave])
  return items
}
