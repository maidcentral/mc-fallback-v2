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
      <div className="min-h-screen flex flex-col bg-gray-50">
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
          <div className="fixed bottom-4 right-4 bg-white rounded-2xl shadow-2xl border-2 border-[#005DA5]/20 max-w-sm text-xs z-50 overflow-hidden">
            <div className="bg-gradient-to-r from-[#005DA5] to-[#0382E5] px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span className="text-base">🔧</span> Feature Toggles
                </h3>
                <div className={`px-2 py-1 rounded-lg text-xs font-bold ${
                  viewMode === 'office'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-400 text-amber-900'
                }`}>
                  {viewMode === 'office' ? 'OFFICE' : 'TECH'}
                </div>
              </div>
              <p className="text-xs text-purple-100">
                Click toggles to change visibility
              </p>
            </div>

            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {Object.entries(debugToggles)
                .filter(([key]) => key.startsWith('TechDashboard_'))
                .map(([key, value]) => {
                  const isInverseLogic = key.includes('Hide')
                  const displayLabel = key
                    .replace('TechDashboard_Display', '')
                    .replace('TechDashboard_Hide', '')
                    .replace('TechDashboard_', '')
                    .replace(/([A-Z])/g, ' $1')
                    .trim()

                  const isShowing = isInverseLogic ? !value : value

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 cursor-pointer hover:bg-[#005DA5]/5 rounded-lg transition-colors border border-gray-200 hover:border-[#005DA5]/30"
                      onClick={() => toggleFeature(key)}
                    >
                      <span className="text-gray-700 font-medium text-xs">
                        {displayLabel}
                      </span>
                      <div className={`px-3 py-1 rounded-full font-bold transition-all text-[10px] ${
                        isShowing
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-red-100 text-red-700 border border-red-300'
                      }`}>
                        {isShowing ? 'ON' : 'OFF'}
                      </div>
                    </div>
                  )
                })}
            </div>

            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
              <div className="text-[10px] text-gray-600 mb-2 font-medium">
                {viewMode === 'office'
                  ? '✓ Office view shows all data'
                  : '✓ Tech view respects toggles'}
              </div>
              <button
                onClick={resetToggles}
                className="w-full px-3 py-2 bg-[#01726B] hover:bg-[#005952] text-white border-2 border-[#1A1A1A] rounded-full text-xs font-bold transition-all shadow-sm"
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
