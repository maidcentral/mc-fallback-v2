import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
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
  const { viewMode, hideInfo, setViewMode, setHideInfo } = useUserPreferences()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedCompany, setSelectedCompany] = useState('all')
  const [selectedTeam, setSelectedTeam] = useState('all')

  // Debug logging
  console.log('App.jsx - data exists:', !!data)
  console.log('App.jsx - data.metadata exists:', !!data?.metadata)
  console.log('App.jsx - data.metadata.featureToggles exists:', !!data?.metadata?.featureToggles)
  console.log('App.jsx - featureToggles:', data?.metadata?.featureToggles)
  console.log('App.jsx - metadata.dataFormat:', data?.metadata?.dataFormat)
  console.log('App.jsx - metadata.lastUpdated:', data?.metadata?.lastUpdated)

  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <Header viewMode={viewMode} setViewMode={setViewMode} />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Routes>
            <Route path="/" element={<Dashboard data={data} />} />
            <Route
              path="/admin"
              element={<Admin data={data} saveData={saveData} clearData={clearData} />}
            />
            <Route
              path="/jobs"
              element={
                <JobCalendar
                  data={data}
                  viewMode={viewMode}
                  hideInfo={hideInfo}
                  setHideInfo={setHideInfo}
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
                  data={data}
                  viewMode={viewMode}
                  hideInfo={hideInfo}
                  setHideInfo={setHideInfo}
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
                  data={data}
                  viewMode={viewMode}
                  hideInfo={hideInfo}
                  setHideInfo={setHideInfo}
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
                  data={data}
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
                  data={data}
                  viewMode={viewMode}
                  hideInfo={hideInfo}
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
                  data={data}
                  viewMode={viewMode}
                  hideInfo={hideInfo}
                  setHideInfo={setHideInfo}
                />
              }
            />
            <Route path="/docs" element={<Documentation />} />
          </Routes>
        </main>
        <Footer />

        {/* Debug Panel - Floating */}
        {data?.metadata?.featureToggles && (
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
                From Uploaded Data:
              </div>
              {Object.entries(data.metadata.featureToggles)
                .filter(([key]) => key.startsWith('TechDashboard_Display'))
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-slate-300 truncate mr-2">
                      {key.replace('TechDashboard_Display', '')}:
                    </span>
                    <span className={`px-2 py-0.5 rounded font-semibold ${
                      value
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}>
                      {value ? 'SHOW' : 'HIDE'}
                    </span>
                  </div>
                ))}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-600 text-[10px] text-slate-400">
              <div>Manual Toggle: <span className={hideInfo ? 'text-orange-400' : 'text-green-400'}>
                {hideInfo ? 'ON (hiding)' : 'OFF (showing)'}
              </span></div>
              <div className="mt-1">
                {viewMode === 'office'
                  ? '✓ Office view ignores all toggles'
                  : '✓ Tech view respects FeatureToggles'}
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  )
}

export default App
