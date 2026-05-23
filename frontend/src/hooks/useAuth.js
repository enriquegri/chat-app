import { useState, useEffect } from 'react'
import { auth } from '../services/api'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    if (token && storedUser) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
        } else {
          const u = JSON.parse(storedUser)
          u.role = payload.role || u.role || 'user'
          setUser(u)
        }
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const { data } = await auth.login({ email, password })
    // If 2FA is required, return without logging in yet
    if (data.requires_2fa) return data
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }

  const complete2FA = async (tempToken, code) => {
    const { data } = await auth.verify2fa({ temp_token: tempToken, code })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }

  const register = async (username, email, password) => {
    const { data } = await auth.register({ username, email, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const updateUser = (updatedUser) => {
    localStorage.setItem('user', JSON.stringify(updatedUser))
    setUser(updatedUser)
  }

  return { user, loading, login, register, logout, updateUser, complete2FA }
}
