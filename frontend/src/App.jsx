import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { auth as authApi } from './services/api'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import Admin from './pages/Admin'
import Profile from './pages/Profile'
import './App.css'

function App() {
  const { user, loading, login, register, logout, updateUser, complete2FA } = useAuth()
  const [view, setView] = useState('login')
  const [page, setPage] = useState('chat') // 'chat' | 'admin' | 'profile'
  const [registrationEnabled, setRegistrationEnabled] = useState(false)

  useEffect(() => {
    authApi.registrationStatus()
      .then(({ data }) => setRegistrationEnabled(data.enabled))
      .catch(() => setRegistrationEnabled(false))
  }, [])

  // Handle Android back gesture for admin/profile overlays
  useEffect(() => {
    const handler = () => {
      if (page !== 'chat') setPage('chat')
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [page])

  const goToAdmin = () => {
    window.history.pushState({ overlay: 'admin' }, '')
    setPage('admin')
  }

  const goToProfile = () => {
    window.history.pushState({ overlay: 'profile' }, '')
    setPage('profile')
  }

  const goToChat = () => {
    setPage('chat')
  }

  if (loading) return <div className="loading">Loading...</div>

  if (user) {
    return (
      <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
        {/* Chat siempre montado — evita flash al volver de admin/profile */}
        <Chat
          user={user}
          onLogout={logout}
          onOpenAdmin={user.role === 'admin' ? goToAdmin : null}
          onOpenProfile={goToProfile}
        />
        {/* Admin/Profile como overlays fijos encima */}
        {page === 'admin' && user.role === 'admin' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
            <Admin user={user} onBack={goToChat} />
          </div>
        )}
        {page === 'profile' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
            <Profile
              user={user}
              onBack={goToChat}
              onUpdate={(u) => { updateUser(u); goToChat() }}
            />
          </div>
        )}
      </div>
    )
  }

  if (view === 'register' && registrationEnabled) {
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
      on2FA={complete2FA}
      onSwitchToRegister={registrationEnabled ? () => setView('register') : null}
    />
  )
}

export default App
