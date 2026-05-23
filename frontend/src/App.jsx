import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import Admin from './pages/Admin'
import './App.css'

function App() {
  const { user, loading, login, register, logout } = useAuth()
  const [view, setView] = useState('login')
  const [showAdmin, setShowAdmin] = useState(false)

  if (loading) return <div className="loading">Loading...</div>

  if (user) {
    if (showAdmin && user.role === 'admin') {
      return <Admin user={user} onBack={() => setShowAdmin(false)} />
    }
    return <Chat user={user} onLogout={logout} onOpenAdmin={user.role === 'admin' ? () => setShowAdmin(true) : null} />
  }

  if (view === 'register') {
    return (
      <Register
        onRegister={register}
        onSwitchToLogin={() => setView('login')}
      />
    )
  }

  return (
    <Login
      onLogin={login}
      onSwitchToRegister={() => setView('register')}
    />
  )
}

export default App
