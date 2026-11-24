type P = { size?: number; className?: string; color?: string }
const S = ({ size = 22, className, color, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
)
export const IconHeart = (p: P) => (
  <S {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" stroke="none" /></S>
)
export const IconDumbbell = (p: P) => (
  <S {...p}><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></S>
)
export const IconFork = (p: P) => (
  <S {...p}><path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1-3 4-3 7s1 3 3 3" /></S>
)
export const IconChart = (p: P) => (
  <S {...p}><path d="M4 19h16M7 15l3-4 3 2 4-6" /></S>
)
export const IconGear = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>
)
export const IconChevron = (p: P) => <S size={p.size ?? 14} {...p}><path d="M9 6l6 6-6 6" /></S>
export const IconBack = (p: P) => <S size={p.size ?? 24} {...p}><path d="M15 5l-7 7 7 7" /></S>
export const IconCheck = (p: P) => <S size={p.size ?? 18} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={3} /></S>
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>
export const IconClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>
export const IconFlame = (p: P) => (
  <S {...p}><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" fill="currentColor" stroke="none" /></S>
)
export const IconScale = (p: P) => <S {...p}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9.5a4 4 0 0 1 6 0l-2 2.5" /></S>
export const IconCart = (p: P) => <S {...p}><path d="M3 4h2l2.4 10.5a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></S>
export const IconRun = (p: P) => <S {...p}><circle cx="14" cy="4.5" r="1.8" /><path d="M8 21l3-6 3 2v4M6 12l3-4 4 1 3 3 3 1M11 15l2-6" /></S>
export const IconTrash = (p: P) => <S {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></S>
export const IconBook = (p: P) => <S {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5" /></S>
export const IconFeet = (p: P) => <S {...p}><path d="M8 4c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM16 10c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z" fill="currentColor" stroke="none" /></S>
export const IconMore = (p: P) => <S {...p}><circle cx="6" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /></S>
