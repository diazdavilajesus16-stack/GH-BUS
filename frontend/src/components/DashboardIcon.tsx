import type { ReactNode } from 'react'

export type DashboardIconName =
  | 'home'
  | 'route'
  | 'clock'
  | 'bus'
  | 'user'
  | 'calendar'
  | 'send'
  | 'pin'
  | 'ticket'
  | 'cart'
  | 'seat'
  | 'users'
  | 'check'
  | 'cash'
  | 'receipt'
  | 'chart'
  | 'shield'
  | 'settings'
  | 'logout'
  | 'arrow'
  | 'steering'
  | 'alert'

const icons: Record<DashboardIconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  route: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M8.2 16.8 15.8 7.2M12 12h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bus: <><path d="M5 11 6.5 5h11l1.5 6v8H5v-8Zm0 0h14M8 15h.01M16 15h.01M8 19v2m8-2v2" /><path d="M8 5V3h8v2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18m-13 4h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  ticket: <><path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5Z" /><path d="M13 8v2m0 4v2" /></>,
  cart: <><path d="M3 4h2l2.4 11.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6" /><circle cx="10" cy="21" r="1" /><circle cx="18" cy="21" r="1" /></>,
  seat: <><path d="M6 4v10a3 3 0 0 0 3 3h7v3H9a6 6 0 0 1-6-6V4h3Zm3 0h8v9H9zM8 20h12" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  check: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  cash: <><circle cx="12" cy="12" r="9" /><path d="M16 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.2 1.8 3 2.2 3 1 3 2.3-1.2 2.2-3 2.2c-1.2 0-2.4-.4-3.2-1.2M13 6v12" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
  chart: <><path d="M4 20V10m5 10V4m5 16v-7m5 7V7" /><path d="M2 20h20" /></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" /></>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  arrow: <path d="m9 18 6-6-6-6" />,
  steering: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="m4 8 6 3m10-3-6 3m-2 3v7" /></>,
  alert: <><path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
}

export function DashboardIcon({ name, className = '' }: { name: DashboardIconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {icons[name]}
    </svg>
  )
}
