import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Menu, X, Calendar, Users, FileText, Upload, BookOpen, LayoutDashboard, Briefcase } from 'lucide-react'

export default function Header({ viewMode, setViewMode }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/jobs', label: 'Job Calendar', icon: Calendar },
    { path: '/employees', label: 'Employees', icon: Users },
    { path: '/teams', label: 'Teams', icon: Briefcase },
    { path: '/export', label: 'Export', icon: FileText },
    { path: '/admin', label: 'Admin', icon: Upload },
    { path: '/docs', label: 'Docs', icon: BookOpen }
  ]

  const isActive = (path) => {
    return location.pathname === path
  }

  const handleNavClick = () => {
    setMobileMenuOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-lg shadow-sm">
        <div className="container flex h-16 items-center max-w-7xl mx-auto px-4 sm:px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 mr-6">
            <div className="w-8 h-8 bg-[#005DA5] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">MC</span>
            </div>
            <span className="font-bold text-lg hidden sm:inline-block text-gray-900">
              MaidCentral Backup
            </span>
            <span className="font-bold text-lg sm:hidden text-gray-900">MC Backup</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 flex-1">
            {navLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive(link.path)
                      ? "bg-[#005DA5]/10 text-[#005DA5]"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Desktop View Mode Toggle */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100">
              <button
                onClick={() => setViewMode('office')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  viewMode === 'office'
                    ? "bg-white text-[#005DA5] shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                Office
              </button>
              <button
                onClick={() => setViewMode('technician')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  viewMode === 'technician'
                    ? "bg-white text-[#005DA5] shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                Technician
              </button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden ml-auto p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-gray-600" />
            ) : (
              <Menu className="w-6 h-6 text-gray-600" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-40 lg:hidden bg-black/20 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div className="bg-white border-b shadow-lg" onClick={(e) => e.stopPropagation()}>
            <nav className="container max-w-7xl mx-auto px-4 py-4 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                      isActive(link.path)
                        ? "bg-[#005DA5]/10 text-[#005DA5]"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                  </Link>
                )
              })}

              {/* Mobile View Mode Toggle */}
              <div className="pt-4 mt-4 border-t">
                <div className="text-xs font-semibold text-gray-500 mb-2 px-4">View Mode</div>
                <div className="flex gap-2 px-4">
                  <button
                    onClick={() => setViewMode('office')}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-full text-sm font-bold transition-all border-2",
                      viewMode === 'office'
                        ? "bg-[#005DA5] text-white border-[#1A1A1A] shadow-sm"
                        : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"
                    )}
                  >
                    Office View
                  </button>
                  <button
                    onClick={() => setViewMode('technician')}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-full text-sm font-bold transition-all border-2",
                      viewMode === 'technician'
                        ? "bg-[#005DA5] text-white border-[#1A1A1A] shadow-sm"
                        : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"
                    )}
                  >
                    Technician View
                  </button>
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
