'use client'

import { Component, type ReactNode } from 'react'

import { smallBtn } from '@/components/ui-bits'

/**
 * Keeps one broken card from taking down a whole page: the rest of the dashboard still renders.
 * The fallback matches the app's card language (white surface, 18px radius, zinc border).
 */
export class WidgetBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-[#E4E4E7] bg-white p-4">
        <h2 className="text-sm font-semibold">{this.props.title} could not load</h2>
        <p className="text-xs text-[#6B6B72]">This section failed, but the rest of the page is still usable.</p>
        <button className={smallBtn} onClick={() => this.setState({ failed: false })}>Try again</button>
      </section>
    )
  }
}
