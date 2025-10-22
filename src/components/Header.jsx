import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

export default function Header() {
  const location = useLocation()

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/jobs', label: 'Job Calendar' },
    { path: '/employees', label: 'Employee Schedule' },
    { path: '/export', label: 'Export' },
    { path: '/admin', label: 'Admin' },
    { path: '/docs', label: 'Documentation' }
  ]

  const isActive = (path) => {
    return location.pathname === path
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center max-w-7xl mx-auto px-4">
        <div className="mr-4 hidden md:flex">
          <Link to="/" className="mr-6 flex items-center space-x-2">
            <span className="hidden font-bold sm:inline-block">
              MaidCentral Backup
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  "transition-colors hover:text-foreground/80",
                  isActive(link.path) ? "text-foreground" : "text-foreground/60"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile navigation */}
        <div className="flex flex-1 items-center justify-between space-x-2 md:hidden">
          <Link to="/" className="flex items-center space-x-2">
            <span className="font-bold">MaidCentral Backup</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
