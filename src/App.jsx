import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useMemo } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import Dashboard from './components/Dashboard'
import Admin from './components/Admin'
import JobCalendar from './components/JobCalendar'
import EmployeeCalendar from './components/EmployeeCalendar'
import ExportSchedule from './components/ExportSchedule'
import TeamList from './components/TeamList'
import TeamDetail from './components/TeamDetail'
import JobView from './components/JobView'
import Documentation from './components/Documentation'
import { usePersistedData } from './hooks/usePersistedData'
import { useUserPreferences } from './hooks/useUserPreferences'

function App() {
  const { data, saveData, clearData } = usePersistedData()
  const {
    viewMode,
    setViewMode,
    selectedDate,
    setSelectedDate,
    selectedCompany,
    setSelectedCompany,
    selectedTeam,
    setSelectedTeam
  } = useUserPreferences()

  // Initialize featureToggles - load from localStorage or use uploaded data
  const [debugToggles, setDebugToggles] = useState(() => {
    // Try to load from localStorage first
    const stored = localStorage.getItem('mc_backup_debug_toggles')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (e) {
        console.error('Error parsing debug toggles:', e)
      }
    }

    // Fallback to uploaded data or defaults
    if (!data?.metadata?.featureToggles || Object.keys(data.metadata.featureToggles).length === 0) {
      return {
        TechDashboard_DisplayBillRate: true,
        TechDashboard_DisplayFeeSplitRate: true,
        TechDashboard_DisplayAddOnRate: true,
        TechDashboard_DisplayRoomRate: true,
        TechDashboard_DisplayCustomerPhoneNumbers: false,
        TechDashboard_DisplayCustomerEmails: false,
        TechDashboard_HideDiscounts: false
      }
    }
    return data.metadata.featureToggles
  })

  // Update data with debug toggles - use useMemo to ensure stable reference
  const dataWithToggles = useMemo(() => {
    if (!data) return null
    return {
      ...data,
      metadata: {
        ...data.metadata,
        featureToggles: debugToggles
      }
    }
  }, [data, debugToggles])

  const toggleFeature = (key) => {
    setDebugToggles(prev => {
      const newToggles = {
        ...prev,
        [key]: !prev[key]
      }
      // Persist to localStorage
      localStorage.setItem('mc_backup_debug_toggles', JSON.stringify(newToggles))
      return newToggles
    })
  }

  const resetToggles = () => {
    const defaultToggles = data?.metadata?.featureToggles || {
      TechDashboard_DisplayBillRate: true,
      TechDashboard_DisplayFeeSplitRate: true,
      TechDashboard_DisplayAddOnRate: true,
      TechDashboard_DisplayRoomRate: true,
      TechDashboard_DisplayCustomerPhoneNumbers: false,
      TechDashboard_DisplayCustomerEmails: false,
      TechDashboard_HideDiscounts: false
    }
    setDebugToggles(defaultToggles)
    localStorage.setItem('mc_backup_debug_toggles', JSON.stringify(defaultToggles))
  }

  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <Header viewMode={viewMode} setViewMode={setViewMode} />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Routes>
            <Route path="/" element={<Dashboard data={dataWithToggles} />} />
            <Route
              path="/admin"
              element={<Admin data={dataWithToggles} saveData={saveData} clearData={clearData} />}
            />
            <Route
              path="/jobs"
              element={
                <JobCalendar
                  data={dataWithToggles}
                  viewMode={viewMode}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  selectedCompany={selectedCompany}
                  setSelectedCompany={setSelectedCompany}
                  selectedTeam={selectedTeam}
                  setSelectedTeam={setSelectedTeam}
                />
              }
            />
            <Route
              path="/employees"
              element={
                <EmployeeCalendar
                  data={dataWithToggles}
                  viewMode={viewMode}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  selectedCompany={selectedCompany}
                  setSelectedCompany={setSelectedCompany}
                  selectedTeam={selectedTeam}
                  setSelectedTeam={setSelectedTeam}
                />
              }
            />
            <Route
              path="/export"
              element={
                <ExportSchedule
                  data={dataWithToggles}
                  viewMode={viewMode}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  selectedCompany={selectedCompany}
                  setSelectedCompany={setSelectedCompany}
                />
              }
            />
            <Route
              path="/teams"
              element={
                <TeamList
                  data={dataWithToggles}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  selectedCompany={selectedCompany}
                  setSelectedCompany={setSelectedCompany}
                />
              }
            />
            <Route
              path="/teams/:teamId"
              element={
                <TeamDetail
                  data={dataWithToggles}
                  viewMode={viewMode}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  selectedCompany={selectedCompany}
                  setSelectedCompany={setSelectedCompany}
                />
              }
            />
            <Route
              path="/jobs/:jobId"
              element={
                <JobView
                  data={dataWithToggles}
                  viewMode={viewMode}
                />
              }
            />
            <Route path="/docs" element={<Documentation />} />
          </Routes>
        </main>
        <Footer />

        {/* Debug Panel - Floating */}
        {data && (
          <div className="fixed bottom-4 right-4 bg-slate-900 text-white p-4 rounded-lg shadow-2xl border border-slate-700 max-w-sm text-xs font-mono z-50">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-600">
              <h3 className="font-bold text-sm">🔧 Feature Toggles Debug</h3>
              <div className={`px-2 py-1 rounded text-xs font-semibold ${
                viewMode === 'office'
                  ? 'bg-blue-600 text-white'
                  : 'bg-orange-600 text-white'
              }`}>
                {viewMode === 'office' ? 'OFFICE' : 'TECH'}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-1">
                Feature Toggles (click to toggle):
              </div>
              {Object.entries(debugToggles)
                .filter(([key]) => key.startsWith('TechDashboard_'))
                .map(([key, value]) => {
                  // Determine if this is an inverse logic toggle (Hide* instead of Display*)
                  const isInverseLogic = key.includes('Hide')
                  const displayLabel = key
                    .replace('TechDashboard_Display', '')
                    .replace('TechDashboard_Hide', '')
                    .replace('TechDashboard_', '')

                  // For inverse logic: true = hide, false = show
                  // For normal logic: true = show, false = hide
                  const isShowing = isInverseLogic ? !value : value

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between py-1 cursor-pointer hover:bg-slate-800 px-2 rounded"
                      onClick={() => toggleFeature(key)}
                    >
                      <span className="text-slate-300 truncate mr-2 text-[11px]">
                        {displayLabel}:
                      </span>
                      <span className={`px-2 py-0.5 rounded font-semibold transition-colors text-[10px] ${
                        isShowing
                          ? 'bg-green-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}>
                        {isShowing ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  )
                })}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-600 text-[10px] text-slate-400">
              <div className="mb-2">
                {viewMode === 'office'
                  ? '✓ Office view ignores all toggles'
                  : '✓ Tech view respects FeatureToggles'}
              </div>
              <button
                onClick={resetToggles}
                className="w-full px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[10px] font-semibold transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </Router>
  )
}

export default App
