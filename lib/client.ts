export class ApiError extends Error {}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: { ...(init?.json ? { 'content-type': 'application/json' } : {}), ...init?.headers }, body: init?.json ? JSON.stringify(init.json) : init?.body })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError((body as { error?: string }).error ?? 'Something went wrong. Please try again.')
  return body as T
}

export const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`
export const when = (value: unknown) => value ? new Date(String(value)).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/** Shrinks a photo to a small JPEG data URL so it can be stored with the guard record. */
export function photoToDataUrl(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image(); const url = URL.createObjectURL(file)
    image.onload = () => {
      const scale = Math.min(1, max / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')) }
    image.src = url
  })
}
