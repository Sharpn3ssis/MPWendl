import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { LoginForm } from './components/LoginForm'
import { RegisterForm } from './components/RegisterForm'
import { Dashboard } from './pages/Dashboard'
import { AddSourcePage } from './pages/AddSourcePage'
import { SourcePage } from './pages/SourcePage'
import { Navbar } from './components/Navbar'
import './App.css'

type AppShellProps = {
  isAuthenticated: boolean
  onLogin: (token: string) => void
  onLogout: () => void
}

const AppShell = ({ isAuthenticated, onLogin, onLogout }: AppShellProps) => {
  const location = useLocation()
  const isSourcePage = location.pathname.startsWith('/sources/')

  return (
    <div className="App">
      <Navbar isAuthenticated={isAuthenticated} onLogout={onLogout} />
      <main className={`main-content${isSourcePage ? ' main-content--wide' : ''}`}>
        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" />
              ) : (
                <LoginForm onLogin={onLogin} />
              )
            }
          />
          <Route path="/register" element={<RegisterForm />} />
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? <Dashboard /> : <Navigate to="/" />
            }
          />
          <Route
            path="/add-source"
            element={isAuthenticated ? <AddSourcePage /> : <Navigate to="/" />}
          />
          <Route
            path="/sources/:id"
            element={isAuthenticated ? <SourcePage /> : <Navigate to="/" />}
          />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'))

  const handleLogin = (_token: string) => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('username')
    localStorage.removeItem('userId')
    setIsAuthenticated(false)
  }

  return (
    <ThemeProvider>
      <Router>
        <AppShell isAuthenticated={isAuthenticated} onLogin={handleLogin} onLogout={handleLogout} />
      </Router>
    </ThemeProvider>
  )
}

export default App
