import { Routes, Route, Link } from 'react-router-dom'
import './App.css'
import { DbConfirmationProvider } from './context/DbConfirmationContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import AddStory from './pages/AddStory'
import Classes from './pages/Classes'
import Clients from './pages/Clients'
import Courses from './pages/Courses'
import Connectors from './pages/Connectors'
import Students from './pages/Students'
import HrClassReviewDashboard from './pages/HrClassReviewDashboard'
import TeWhaingaAmorangi from './pages/TeWhaingaAmorangi'
import Patterns from './pages/Patterns'
import StoriesList from './pages/StoriesList'
import StoryEditor from './pages/StoryEditor'
import Words from './pages/Words'
import FrequencyNumbersPage from './pages/FrequencyNumbersPage'
import Users from './pages/Users'
import Login from './pages/Login'

function Nav() {
  const { user, signOut } = useAuth()
  return (
    <nav className="p-4 border-b flex flex-wrap items-center gap-2">
      <Link to="/" className="mr-4">Home</Link>
      <Link to="/stories" className="mr-4">Stories</Link>
      <Link to="/words" className="mr-4">Words</Link>
      <Link to="/frequency-numbers" className="mr-4">Frequency</Link>
      <Link to="/patterns" className="mr-4">Patterns</Link>
      <Link to="/connectors" className="mr-4">Connectors</Link>
      <Link to="/clients" className="mr-4">Clients</Link>
      <Link to="/courses" className="mr-4">Courses</Link>
      <Link to="/classes" className="mr-4">Classes</Link>
      <Link to="/students" className="mr-4">Students</Link>
      <Link to="/te-whainga-amorangi" className="mr-4">Te Whainga Amorangi</Link>
      <Link to="/hr-class-review" className="mr-4">HR review (demo)</Link>
      <Link to="/users" className="mr-4">Users</Link>
      <Link to="/add" className="mr-4">Add Story</Link>
      {user ? (
        <span className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-600 mr-2">{user.email}</span>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-sm text-gray-600 hover:text-blue-600"
          >
            Sign out
          </button>
        </span>
      ) : (
        <Link to="/login" className="ml-auto">Sign in</Link>
      )}
    </nav>
  )
}

function App() {
  return (
    <AuthProvider>
      <DbConfirmationProvider>
        <Nav />
      <Routes>
        <Route path="/" element={<div className="p-6"><h1>Pūrākau</h1></div>} />
        <Route path="/stories" element={<StoriesList />} />
        <Route path="/stories/list" element={<StoriesList />} />
        <Route path="/stories/:id" element={<StoryEditor />} />
        <Route path="/words" element={<Words />} />
        <Route path="/frequency-numbers" element={<FrequencyNumbersPage />} />
        <Route path="/patterns" element={<Patterns />} />
        <Route path="/connectors" element={<Connectors />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/students" element={<Students />} />
        <Route path="/te-whainga-amorangi" element={<TeWhaingaAmorangi />} />
        <Route path="/hr-class-review" element={<HrClassReviewDashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/login" element={<Login />} />
        <Route path="/add" element={<AddStory />} />
      </Routes>
      </DbConfirmationProvider>
    </AuthProvider>
  )
}

export default App
