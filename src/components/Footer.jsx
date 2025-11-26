import { Shield } from 'lucide-react'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t bg-white/50 backdrop-blur-sm mt-auto">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#005DA5] rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-sm font-medium text-gray-900">
                MaidCentral Backup System
              </p>
              <p className="text-xs text-gray-500">
                Emergency use only • © {currentYear}
              </p>
            </div>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs font-medium text-gray-600">
              Offline Schedule Viewer
            </p>
            <p className="text-xs text-gray-500">
              All data stored locally in your browser
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
