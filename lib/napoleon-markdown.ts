export type InlineSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string }

export type TableAlign = 'left' | 'center' | 'right'

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; alignments: TableAlign[]; rows: string[][] }

const TABLE_SEPARATOR_RE = /^\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/
const BULLET_LINE_RE = /^[-*•]\s+(.*)$/
const ORDERED_LINE_RE = /^\d+\.\s+(.*)$/
const HEADING_LINE_RE = /^(#{1,3})\s+(.*)$/

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function parseTableAlignments(line: string, count: number): TableAlign[] {
  const cells = splitTableCells(line)
  return Array.from({ length: count }, (_, idx) => {
    const token = (cells[idx] ?? '').trim()
    const startsColon = token.startsWith(':')
    const endsColon = token.endsWith(':')
    if (startsColon && endsColon) return 'center'
    if (endsColon) return 'right'
    return 'left'
  })
}

function isTableHeaderPair(lines: string[], index: number): boolean {
  const header = lines[index]?.trim() ?? ''
  const sep = lines[index + 1]?.trim() ?? ''
  return header.includes('|') && TABLE_SEPARATOR_RE.test(sep)
}

/** Splits Markdown text into headings, paragraphs, vertical lists, and GFM tables without HTML injection. */
export function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      i++
      continue
    }

    if (isTableHeaderPair(lines, i)) {
      const headers = splitTableCells(lines[i])
      const alignments = parseTableAlignments(lines[i + 1], headers.length)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().includes('|') && !TABLE_SEPARATOR_RE.test(lines[i].trim())) {
        const rawCells = splitTableCells(lines[i])
        const normalizedRow = Array.from({ length: headers.length }, (_, idx) => rawCells[idx] ?? '')
        rows.push(normalizedRow)
        i++
      }
      blocks.push({ type: 'table', headers, alignments, rows })
      continue
    }

    const headingMatch = HEADING_LINE_RE.exec(trimmed)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2].trim() })
      i++
      continue
    }

    const bulletMatch = BULLET_LINE_RE.exec(trimmed)
    if (bulletMatch) {
      const items: string[] = [bulletMatch[1].trim()]
      i++
      while (i < lines.length) {
        const nextBullet = BULLET_LINE_RE.exec(lines[i].trim())
        if (!nextBullet) break
        items.push(nextBullet[1].trim())
        i++
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    const orderedMatch = ORDERED_LINE_RE.exec(trimmed)
    if (orderedMatch) {
      const items: string[] = [orderedMatch[1].trim()]
      i++
      while (i < lines.length) {
        const nextOrdered = ORDERED_LINE_RE.exec(lines[i].trim())
        if (!nextOrdered) break
        items.push(nextOrdered[1].trim())
        i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    const paragraphLines: string[] = [trimmed]
    i++
    while (i < lines.length) {
      const next = lines[i].trim()
      if (!next || HEADING_LINE_RE.test(next) || BULLET_LINE_RE.test(next) || ORDERED_LINE_RE.test(next) || isTableHeaderPair(lines, i)) {
        break
      }
      paragraphLines.push(next)
      i++
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') })
  }

  return blocks
}

/** Parses `**bold**` and `` `code` `` spans within plain Markdown line/cell text. */
export function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      segments.push({ type: 'bold', value: token.slice(2, -2) })
    } else if (token.startsWith('`') && token.endsWith('`')) {
      segments.push({ type: 'code', value: token.slice(1, -1) })
    }
    lastIndex = tokenRe.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
