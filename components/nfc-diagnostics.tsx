'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeTagText, tagHex } from '@/lib/nfc-decode'

type Line = { at: string; text: string }

interface DiagnosticsReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: { message: { records: Array<{ recordType?: string; encoding?: string; lang?: string; data?: DataView | string }> } }) => void) | null
  onreadingerror: (() => void) | null
}

const pickReader = () => (window as unknown as { NDEFReader?: new () => DiagnosticsReader }).NDEFReader

function hexOf(data: DataView | string | undefined) {
  if (!(data instanceof DataView)) return ''
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ')
}

/**
 * Reports what the browser can actually do with NFC and logs every raw tag event.
 * This is the only way to tell "Chrome never received the tag" apart from "Chrome received it and we misread it".
 */
export function NfcDiagnostics() {
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [listening, setListening] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const push = useCallback((text: string) => {
    setLines((previous) => [{ at: new Date().toLocaleTimeString(), text }, ...previous].slice(0, 30))
  }, [])

  useEffect(() => () => abort.current?.abort(), [])

  const environment = useCallback(() => {
    const Reader = pickReader()
    push(`NDEFReader: ${Reader ? 'present' : 'MISSING'}`)
    push(`secure context: ${String(window.isSecureContext)}`)
    push(`origin: ${window.location.origin}`)
    push(`isChrome: ${/Chrome\//.test(navigator.userAgent)} · android: ${/Android/.test(navigator.userAgent)}`)
    const permissions = (navigator as unknown as { permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> } }).permissions
    if (permissions?.query) {
      permissions.query({ name: 'nfc' })
        .then((status) => push(`nfc permission: ${status.state}`))
        .catch(() => push('nfc permission: not queryable on this browser'))
    } else {
      push('nfc permission: Permissions API unavailable')
    }
  }, [push])

  const listen = useCallback(async () => {
    const Reader = pickReader()
    if (!Reader) return push('cannot scan: NDEFReader is missing')
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    setListening(true); push('scan() starting…')
    const pending = window.setTimeout(() => {
      push('scan() is STILL PENDING after 10s. Chrome has not granted NFC to this site, so no tag will ever arrive. Open the address-bar site controls (or Chrome → Settings → Site settings) and set NFC to Allow, then try again.')
      push('Also confirm Android Settings → Connected devices → NFC is on, and that Chrome is allowed to use it.')
    }, 10_000)
    try {
      const device = new Reader()
      device.onreading = (event) => {
        const records = Array.from(event.message.records)
        push(`READING: ${records.length} record(s)`)
        for (const record of records) {
          const shown = typeof record.data === 'string' ? JSON.stringify(record.data) : 'DataView'
          push(`  type=${record.recordType ?? '?'} enc=${record.encoding ?? '-'} lang=${record.lang ?? '-'} data=${shown}`)
          const hex = tagHex(record)
          if (hex) push(`  hex=${hex.slice(0, 180)}`)
          const decoded = decodeTagText(record)
          if (decoded) push(`  decoded=${JSON.stringify(decoded)}`)
        }
      }
      device.onreadingerror = () => push('readingerror fired: tag seen but unreadable')
      await device.scan({ signal: controller.signal })
      window.clearTimeout(pending)
      push('scan() accepted. Hold the tag to the phone now.')
    } catch (cause) {
      window.clearTimeout(pending)
      const name = cause instanceof DOMException || cause instanceof Error ? cause.name : 'Error'
      const message = cause instanceof Error ? cause.message : String(cause)
      push(`scan() FAILED: ${name} — ${message}`)
      setListening(false)
    }
  }, [push])

  const stop = () => { abort.current?.abort(); setListening(false); push('scan() cancelled') }

  return <section className="mt-4 rounded-[12px] border border-zinc-300 bg-white p-4">
    <button type="button" onClick={() => { setOpen((value) => !value); if (!open) environment() }} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-xs font-semibold text-[#3F3F46]">
      <span>NFC diagnostics</span>
      <span className="text-[#9A9AA1]">{open ? 'Hide' : 'Show'}</span>
    </button>
    {open && <>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={environment} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold">Check environment</button>
        {listening
          ? <button type="button" onClick={stop} className="rounded-lg bg-[#B42318] px-3 py-2 text-xs font-semibold text-white">Stop listening</button>
          : <button type="button" onClick={() => void listen()} className="rounded-lg bg-[#2A2B2E] px-3 py-2 text-xs font-semibold text-white">Listen for any tag</button>}
        <button type="button" onClick={() => setLines([])} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold">Clear</button>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#6B6B72]">“Listen for any tag” logs every record the browser receives. If nothing appears while the phone beeps, Chrome is not being handed the tag. If a READING appears, the payload is being received and the problem is in how we read it.</p>
      <ol className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-[#F5F5F6] p-2 font-mono text-[10px] leading-4 text-[#3F3F46]">
        {lines.length === 0 ? <li className="text-[#9A9AA1]">No output yet.</li> : lines.map((line, index) => <li key={`${line.at}-${index}`} className="whitespace-pre-wrap break-all">{line.at}  {line.text}</li>)}
      </ol>
    </>}
  </section>
}
