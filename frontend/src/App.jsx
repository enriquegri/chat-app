import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import Admin from './pages/Admin'
import Profile from './pages/Profile'
import './App.css'

function App() {
  const { user, loading, login, register, logout, updateUser } = useAuth()
  const [view, setView] = useState('login')
  const [page, setPage] = useState('chat') // 'chat' | 'admin' | 'profile'

  if (loading) return <div className="loading">Loading...</div>

  if (user) {
    if (page === 'admin' && user.role === 'admin') {
      return <Admin user={user} onBack={() => setPage('chat')} />
    }
    if (page === 'profile') {
      return <Profile user={user} onBack={() => setPage('chat')} onUpdate={(u) => { updateUser(u); setPage('chat') }} />
    }
    return (
      <Chat
        user={user}
        onLogout={logout}
        onOpenAdmin={user.role === 'admin' ? () => setPage('admin') : null}
        onOpenProfile={() => setPage('profile')}
      />
    )
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
