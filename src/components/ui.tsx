import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { IconBack, IconChart, IconChevron, IconDumbbell, IconFork, IconHeart } from './icons'

export function TabBar() {
  const tabs = [
    { to: '/', label: 'Summary', icon: <IconHeart size={24} />, end: true },
    { to: '/train', label: 'Train', icon: <IconDumbbell size={24} /> },
    { to: '/eat', label: 'Nutrition', icon: <IconFork size={24} /> },
    { to: '/progress', label: 'Progress', icon: <IconChart size={24} /> },
  ]
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.icon}
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function NavBar({ title, back = 'Back', right }: { title?: string; back?: string | null; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="navbar">
      <div className="left">
        {back !== null && (
          <button className="navbtn" onClick={() => nav(-1)}>
            <IconBack /> {back}
          </button>
        )}
      </div>
      <div className="title">{title}</div>
      <div className="right">{right}</div>
    </div>
  )
}

export function LargeTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div className="large-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <>
      <div className="section-title">
        <h2>{title}</h2>
        {link && (
          <Link className="link" to={link.to}>
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </>
  )
}

export function Row({ to, onClick, children, trail, chevron = true }: { to?: string; onClick?: () => void; children: ReactNode; trail?: ReactNode; chevron?: boolean }) {
  const inner = (
    <>
      <div className="grow">{children}</div>
      {trail != null && <div className="trail">{trail}</div>}
      {chevron && (to || onClick) && <IconChevron className="chev" />}
    </>
  )
  if (to)
    return (
      <Link className="list-item" to={to}>
        {inner}
      </Link>
    )
  return (
    <button className="list-item" onClick={onClick} disabled={!onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      {inner}
    </button>
  )
}

export function Sheet({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <button className="navbtn" onClick={onClose}>
              Cancel
            </button>
          </div>
          <div className="title">{title}</div>
          <div style={{ justifySelf: 'end' }}>{action}</div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Ring({ size = 96, stroke = 12, rings }: { size?: number; stroke?: number; rings: { value: number; color: string }[] }) {
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }}>
      {rings.map((r, idx) => {
        const rad = c - stroke / 2 - idx * (stroke + 2)
        const circ = 2 * Math.PI * rad
        const v = Math.max(0, Math.min(r.value, 1))
        return (
          <g key={idx} transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={rad} fill="none" stroke={r.color} strokeOpacity={0.2} strokeWidth={stroke} />
            <circle cx={c} cy={c} r={rad} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circ * v} ${circ}`} style={{ transition: 'stroke-dasharray .6s' }} />
          </g>
        )
      })}
    </svg>
  )
}

export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  )
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 1800)
    return () => clearTimeout(t)
  }, [msg])
  return [msg ? <div className="toast">{msg}</div> : null, setMsg]
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
