/**
 * Reading text out of an NFC record is fussier than it looks. Web NFC normally hands over a text payload that
 * starts with a status byte (bit 7 = UTF-16, bits 0-5 = language-code length) followed by the language code and
 * then the text. Some stacks instead hand over the bare text, and some hand over the whole NDEF record with its
 * header, type length, payload length and type before the payload.
 *
 * Rather than betting on one shape, try each in turn and take the first result that looks like real text.
 */
export type TagRecord = { recordType?: string; encoding?: string; lang?: string; data?: DataView | string }

const utf8 = new TextDecoder('utf-8')

/** Printable text only: drop NULs and other control characters that come from reading raw bytes. */
function clean(text: string) {
  return text.replace(/[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
}

function read(bytes: Uint8Array) {
  return clean(utf8.decode(bytes))
}

export function decodeTagText(record: TagRecord): string {
  const data = record.data
  if (data === undefined || data === null) return ''
  if (typeof data === 'string') return clean(data)

  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (bytes.length === 0) return ''

  // The documented shape: status byte + language code + text.
  if (record.recordType === 'text') {
    const skip = 1 + (bytes[0] & 0x3f)
    if (skip < bytes.length) {
      const text = read(bytes.subarray(skip))
      if (text) return text
    }
  }

  // Bare text with no prefix at all.
  const bare = read(bytes)
  if (bare) return bare

  // A whole NDEF record: flags, type length, payload length, type, payload.
  if (bytes.length > 3) {
    const typeLength = bytes[1]
    const payloadStart = 3 + typeLength
    if (payloadStart < bytes.length) {
      const payload = bytes.subarray(payloadStart)
      const skip = 1 + (payload[0] & 0x3f)
      const inner = skip < payload.length ? read(payload.subarray(skip)) : read(payload)
      if (inner) return inner
    }
  }

  return ''
}

/** Space-separated hex of the raw payload, for showing the user what the tag actually holds. */
export function tagHex(record: TagRecord, limit = 96): string {
  if (!(record.data instanceof DataView)) return ''
  const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength)
  return Array.from(bytes)
    .slice(0, limit)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ')
}

/** The first record on a tag that carries a payload. */
export function firstPayloadRecord(records: TagRecord[]): TagRecord | undefined {
  return records.find((record) => record.data !== undefined && record.data !== null)
}
