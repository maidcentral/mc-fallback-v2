import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import Dashboard from './components/Dashboard'
import Admin from './components/Admin'
import JobCalendar from './components/JobCalendar'
import EmployeeCalendar from './components/EmployeeCalendar'
import ExportSchedule from './components/ExportSchedule'
import Documentation from './components/Documentation'
import { usePersistedData } from './hooks/usePersistedData'

function App() {
  const { data, saveData, clearData } = usePersistedData()
  const [hideInfo, setHideInfo] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedCompany, setSelectedCompany] = useState('all')
  const [selectedTeam, setSelectedTeam] = useState('all')

  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <Header />
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
              element={<ExportSchedule data={data} hideInfo={hideInfo} setHideInfo={setHideInfo} />}
            />
            <Route path="/docs" element={<Documentation />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  )
}

export default App
