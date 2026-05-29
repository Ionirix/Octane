import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { SideNav } from './SideNav'
import { V5CommandDock } from './V5CommandDock'

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const isLegacyRoute = location.pathname === '/' || location.pathname.startsWith('/v5')

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg)]">
      <TopBar onMenuToggle={() => setNavOpen(v => !v)} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <SideNav mobileOpen={navOpen} onNavigate={() => setNavOpen(false)} />
        {navOpen && (
          <button
            className="md:hidden fixed inset-0 bg-black/45 z-[4900]"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          />
        )}
        <main className="relative z-0 flex-1 overflow-y-auto overflow-x-hidden p-2.5 md:p-3">
          <Outlet />
        </main>
        {isLegacyRoute && <V5CommandDock />}
      </div>
    </div>
  )
}
