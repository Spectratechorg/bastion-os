/* BastionOS logo. The supplied mark is white, so it always sits on a dark grey tile. */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-tile.png" alt="BastionOS" width={size} height={size} className={`shrink-0 rounded-[22%] ${className}`} style={{ width: size, height: size }} />
  )
}

export function Wordmark({ size = 32, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className={`text-[18px] font-semibold tracking-tight ${dark ? 'text-[#18181B]' : 'text-white'}`}>Bastion<span className="ml-0.5 text-[11px] font-medium opacity-60">OS</span></span>
    </span>
  )
}
