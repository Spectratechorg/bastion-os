'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Nfc, RotateCcw } from 'lucide-react'
import { btn, smallBtn } from '@/components/ui-bits'
import { decodeTagText, tagHex } from '@/lib/nfc-decode'

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

type Status = 'idle' | 'writing' | 'written' | 'checking' | 'verified' | 'mismatch' | 'error'

/**
 * Writes a guard's tag code onto a physical NFC tag, then optionally reads it back to prove the write landed.
 * Renders nothing actionable on devices without Web NFC, so the page still works by typing the code.
 */
export function WriteTagButton({ token, owner, writeLabel = 'Write tag' }: { token: string; owner?: string; writeLabel?: string }) {
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
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    setStatus('writing'); setDetail('')
    try {
      await new Reader().write({ records: [{ recordType: 'text', data: token }] }, { signal: controller.signal })
      setStatus('written')
      setDetail('Tag written. Hold it to the phone again to verify it.')
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') { setStatus('idle'); setDetail(''); return }
      const name = cause instanceof DOMException || cause instanceof Error ? cause.name : ''
      const reason =
        name === 'NotAllowedError' ? 'Permission was refused, or this tag is read-only or locked.' :
          name === 'NotSupportedError' ? 'This tag cannot be written; it may be locked or an unsupported type.' :
            name === 'NotReadableError' ? 'The phone lost contact with the tag part-way through.' :
              name === 'NetworkError' ? 'The transfer broke part-way through.' :
                name === 'InvalidStateError' ? 'NFC is switched off on this phone.' :
                  'The tag could not be written.'
      setStatus('error')
      setDetail(`${reason}${name ? ` (${name})` : ''} Hold the tag flat against the back of the phone and try again.`)
    }
  }, [token])

  const cancelWrite = () => { abort.current?.abort(); setStatus('idle'); setDetail('') }

  const verify = useCallback(async () => {
    const Reader = reader(); if (!Reader) return
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    setStatus('checking'); setDetail('Hold the tag to the back of the phone to verify…')
    try {
      const device = new Reader()
      let seen: { recordType?: string; data?: DataView | string } | undefined
      const result = new Promise<string>((resolve, reject) => {
        device.onreading = (event) => {
          seen = event.message.records.find((item) => item.data !== undefined && item.data !== null)
          resolve(seen ? decodeTagText(seen) : '')
        }
        device.onreadingerror = () => reject(new Error('unreadable'))
        controller.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
      await device.scan({ signal: controller.signal })
      const read = (await result).trim()
      controller.abort()
      if (read === token.trim()) { setStatus('verified'); setDetail('Verified — the tag holds this guard’s code.') }
      else {
        setStatus('mismatch')
        const hex = seen ? tagHex(seen) : ''
        setDetail(`This tag holds “${read || 'nothing'}”, not this guard’s code.${hex ? ` Raw bytes: ${hex}` : ''}`)
      }
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
      {status === 'writing'
        ? <button type="button" onClick={cancelWrite} className={btn}>Cancel</button>
        : <button type="button" onClick={() => void write()} disabled={status === 'checking'} className={btn}>
          {showSuccess ? <RotateCcw className="size-3.5" /> : <Nfc className="size-3.5" />}
          {showSuccess ? 'Write again' : writeLabel}
        </button>}
      {canVerify && <button type="button" onClick={() => void verify()} disabled={status === 'checking'} className={smallBtn}>{status === 'checking' ? 'Reading…' : 'Verify tag'}</button>}
    </div>
    {status === 'writing' && <p className="mt-2 text-[11px] text-[#52525B]">Waiting for a tag. Hold {owner ? `${owner}’s` : 'the'} tag flat against the back of the phone, or tap Cancel.</p>}
    {status === 'checking' && <p className="mt-2 text-[11px] text-[#52525B]">Reading the tag back…</p>}
    {showSuccess && <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#16794A]"><Check className="size-3.5" />{detail}</p>}
    {(status === 'error' || status === 'mismatch') && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-[#FDECEA] p-2.5 text-[11px] text-[#B42318]">{detail}</p>}
  </div>
}
