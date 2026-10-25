'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Nfc, RotateCcw } from 'lucide-react'
import { btn, smallBtn } from '@/components/ui-bits'

/**
 * Web NFC surface we use. Declared locally rather than on `window` because the guard app already
 * augments `Window` with its own NFC reader type, and two global declarations must match exactly.
 */
interface NfcDevice extends EventTarget {
  write(message: { records: Array<{ recordType: string; data: string }> }, options?: { signal?: AbortSignal }): Promise<void>
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: { message: { records: Array<{ recordType?: string; data?: DataView | string }> } }) => void) | null
  onreadingerror: (() => void) | null
}

const reader = () => (window as unknown as { NDEFReader?: new () => NfcDevice }).NDEFReader

/** Web NFC writing needs Chrome on Android over HTTPS (or localhost). Everything else falls back to typing the code. */
export function canWriteTag() {
  return typeof window !== 'undefined' && Boolean(reader()) && window.isSecureContext
}

/** Text records carry a status byte plus a language code before the payload. Mirrors the decoder in the guard app. */
function decodeRecord(data: DataView | string): string {
  if (typeof data === 'string') return data
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new TextDecoder().decode(bytes.subarray(1 + ((bytes[0] ?? 0) & 0x3f)))
}

type Status = 'idle' | 'writing' | 'written' | 'checking' | 'verified' | 'mismatch' | 'error'

/**
 * Writes a guard's tag code onto a physical NFC tag, then optionally reads it back to prove the write landed.
 * Renders nothing actionable on devices without Web NFC, so the page still works by typing the code.
 */
export function WriteTagButton({ token, owner }: { token: string; owner?: string }) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [detail, setDetail] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    setSupported(canWriteTag())
    return () => abort.current?.abort()
  }, [])

  const write = useCallback(async () => {
    const Reader = reader(); if (!Reader) return
    setStatus('writing'); setDetail('')
    try {
      await new Reader().write({ records: [{ recordType: 'text', data: token }] })
      setStatus('written')
      setDetail('Tag written. Hold it to the phone again to verify it.')
    } catch (cause) {
      setStatus('error')
      setDetail(cause instanceof Error && cause.name === 'NotAllowedError' ? 'NFC permission was denied. Allow NFC for this site and try again.' : 'The tag could not be written. Hold it flat against the back of the phone and try again.')
    }
  }, [token])

  const verify = useCallback(async () => {
    const Reader = reader(); if (!Reader) return
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    setStatus('checking'); setDetail('Hold the tag to the back of the phone to verify…')
    try {
      const device = new Reader()
      const result = new Promise<string>((resolve, reject) => {
        device.onreading = (event) => resolve(decodeRecord(event.message.records.find((record) => record.data)?.data ?? ''))
        device.onreadingerror = () => reject(new Error('unreadable'))
        controller.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
      await device.scan({ signal: controller.signal })
      const read = (await result).trim()
      controller.abort()
      if (read === token.trim()) { setStatus('verified'); setDetail('Verified — the tag holds this guard’s code.') }
      else { setStatus('mismatch'); setDetail(`This tag holds “${read || 'nothing'}”, not this guard’s code.` ) }
    } catch (cause) {
      controller.abort()
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setStatus('error'); setDetail('The tag could not be read back. Try again, or write it once more.')
    }
  }, [token])

  if (supported === null) return null

  if (!supported) return <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
    This browser cannot write NFC tags. Open this page in <b>Chrome on an Android phone</b> over HTTPS to program the tag, or write <span className="font-mono">{token}</span> with a tag-writer app.
  </p>

  const canVerify = status === 'written' || status === 'verified' || status === 'mismatch' || status === 'checking'
  const showSuccess = status === 'written' || status === 'verified'

  return <div className="mt-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void write()} disabled={status === 'writing' || status === 'checking'} className={btn}>
        {showSuccess ? <RotateCcw className="size-3.5" /> : <Nfc className="size-3.5" />}
        {status === 'writing' ? 'Hold the tag to the phone…' : showSuccess ? 'Write again' : 'Write tag'}
      </button>
      {canVerify && <button type="button" onClick={() => void verify()} disabled={status === 'checking'} className={smallBtn}>{status === 'checking' ? 'Reading…' : 'Verify tag'}</button>}
    </div>
    {status === 'writing' && <p className="mt-2 text-[11px] text-zinc-600">Hold {owner ? `${owner}’s` : 'the'} tag flat against the back of the phone.</p>}
    {status === 'checking' && <p className="mt-2 text-[11px] text-zinc-600">Reading the tag back…</p>}
    {showSuccess && <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#16794A]"><Check className="size-3.5" />{detail}</p>}
    {(status === 'error' || status === 'mismatch') && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">{detail}</p>}
  </div>
}
