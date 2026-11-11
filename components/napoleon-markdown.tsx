'use client'

import { Fragment } from 'react'
import { parseInlineSegments, parseMarkdownBlocks, type TableAlign } from '@/lib/napoleon-markdown'

function renderInline(text: string) {
  return parseInlineSegments(text).map((segment, idx) => {
    if (segment.type === 'bold') {
      return (
        <strong key={idx} className="font-semibold text-[#18181B]">
          {segment.value}
        </strong>
      )
    }
    if (segment.type === 'code') {
      return (
        <code key={idx} className="rounded bg-[#E4E4E7]/70 px-1 py-0.5 font-mono text-[11px] text-[#18181B]">
          {segment.value}
        </code>
      )
    }
    return <Fragment key={idx}>{segment.value}</Fragment>
  })
}

function alignClass(align: TableAlign | undefined): string {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

export function NapoleonMarkdown({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content)

  return (
    <div className="space-y-2 text-xs leading-5 text-[#27272A]">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <p key={index} className="pt-1 font-semibold text-[#18181B]">
              {renderInline(block.text)}
            </p>
          )
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag
              key={index}
              className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-4 text-left`}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-5">
                  {renderInline(item)}
                </li>
              ))}
            </ListTag>
          )
        }

        if (block.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto rounded-lg border border-[#E4E4E7] bg-white">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E4E4E7] bg-[#FAFAFA]">
                    {block.headers.map((header, colIdx) => (
                      <th
                        key={colIdx}
                        className={`px-3 py-2 font-semibold text-[#18181B] ${alignClass(block.alignments[colIdx])}`}
                      >
                        {renderInline(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F5]">
                  {block.rows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} className={`px-3 py-2 align-top text-[#27272A] ${alignClass(block.alignments[colIdx])}`}>
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        return (
          <p key={index} className="leading-5">
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}
