import { Link } from 'react-router-dom'
import { Calendar, Users, FileText, Upload, BookOpen, Briefcase, TrendingUp, Clock, AlertCircle, ArrowRight, ChevronRight } from 'lucide-react'

export default function Dashboard({ data }) {
  if (!data) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-4 py-12">
          <div className="w-20 h-20 bg-[#005DA5] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Calendar className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
            Welcome to MaidCentral Backup
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Offline schedule viewer for emergency use when the main system is unavailable.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">No data loaded</h3>
            <p className="text-amber-800 text-sm">
              Please upload a JSON file to get started viewing your schedules.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-8">
            <h2 className="text-2xl font-bold mb-2">Get Started</h2>
            <p className="text-gray-600 mb-6">
              Upload schedule data to view jobs, employee schedules, and generate exports
            </p>
            <Link to="/admin">
              <button className="inline-flex items-center justify-center px-8 py-3 bg-[#BF9F50] hover:bg-[#A88A43] text-white rounded-full font-bold border-2 border-[#1A1A1A] shadow-sm transition-all gap-2">
                <ChevronRight className="w-5 h-5" />
                Upload Data
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { metadata } = data

  const stats = [
    {
      label: 'Total Jobs',
      value: metadata?.stats?.totalJobs || 0,
      subtitle: metadata?.dataRange?.startDate && metadata?.dataRange?.endDate
        ? `${metadata.dataRange.startDate} to ${metadata.dataRange.endDate}`
        : 'No date range',
      icon: Calendar,
      gradient: 'from-[#005DA5] to-[#0382E5]'
    },
    {
      label: 'Active Teams',
      value: metadata?.stats?.totalTeams || 0,
      subtitle: 'Teams scheduled',
      icon: Briefcase,
      gradient: 'from-[#01726B] to-[#00A79D]'
    },
    {
      label: 'Total Employees',
      value: metadata?.stats?.totalEmployees || 0,
      subtitle: 'Scheduled employees',
      icon: Users,
      gradient: 'from-[#BF9F50] to-[#EECB75]'
    }
  ]

  const navigationCards = [
    {
      title: 'Job Calendar',
      description: 'View all scheduled jobs on a calendar with team filtering',
      icon: Calendar,
      path: '/jobs',
      gradient: 'from-[#005DA5] to-[#0382E5]',
      primary: true
    },
    {
      title: 'Employee Schedule',
      description: 'View employee work schedules and shifts',
      icon: Users,
      path: '/employees',
      gradient: 'from-[#BF9F50] to-[#EECB75]',
      primary: true
    },
    {
      title: 'Teams',
      description: 'View and manage team assignments',
      icon: Briefcase,
      path: '/teams',
      gradient: 'from-[#01726B] to-[#00A79D]',
      primary: true
    },
    {
      title: 'Export Schedule',
      description: 'Generate PDF/PNG exports of team schedules',
      icon: FileText,
      path: '/export',
      gradient: 'from-[#005DA5] to-[#0382E5]',
      primary: false
    },
    {
      title: 'Upload New Data',
      description: 'Replace current data with a new JSON file',
      icon: Upload,
      path: '/admin',
      gradient: 'from-gray-500 to-gray-600',
      primary: false
    },
    {
      title: 'Documentation',
      description: 'Learn how to use this application',
      icon: BookOpen,
      path: '/docs',
      gradient: 'from-[#01726B] to-[#00A79D]',
      primary: false
    }
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Dashboard</h1>
        <p className="text-gray-600 text-lg">
          Schedule data loaded. Select an option below to get started.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${stat.gradient} rounded-lg flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-sm font-medium text-gray-900 mb-1">{stat.label}</div>
              <p className="text-xs text-gray-500">{stat.subtitle}</p>
            </div>
          )
        })}
      </div>

      {/* Navigation Cards */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {navigationCards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.path} to={card.path} className="group">
              <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full hover:shadow-lg hover:border-[#005DA5]/30 transition-all ${card.primary ? 'sm:col-span-1' : ''}`}>
                <div className={`w-12 h-12 bg-gradient-to-br ${card.gradient} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold mb-2 group-hover:text-[#005DA5] transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {card.description}
                </p>
                <div className="flex items-center text-sm font-medium text-[#005DA5] group-hover:gap-2 transition-all">
                  <span>View</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Last Updated Info */}
      {metadata?.lastUpdated && (
        <div className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg p-4 border border-gray-200">
          <Clock className="w-4 h-4 text-gray-500" />
          <span className="text-gray-600">Last Updated:</span>
          <span className="font-medium text-gray-900">{new Date(metadata.lastUpdated).toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}
