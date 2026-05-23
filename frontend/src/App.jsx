import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import './App.css'

function App() {
  const { user, loading, login, register, logout } = useAuth()
  const [view, setView] = useState('login')

  if (loading) return <div className="loading">Loading...</div>

  if (user) return <Chat user={user} onLogout={logout} />

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
