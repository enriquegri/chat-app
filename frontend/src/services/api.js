import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export const auth = {
  registrationStatus: () => api.get('/registration-status'),
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  verify2fa: (data) => api.post('/auth/2fa/verify', data),
}

export const twofa = {
  status: () => api.get('/api/2fa/status'),
  setup: () => api.get('/api/2fa/setup'),
  enable: (data) => api.post('/api/2fa/enable', data),
  disable: (data) => api.post('/api/2fa/disable', data),
}

export const channels = {
  list: () => api.get('/api/channels'),
  create: (data) => api.post('/api/channels', data),
  messages: (id, params = {}) => api.get(`/api/channels/${id}/messages`, { params }),
  search: (id, q) => api.get(`/api/channels/${id}/search?q=${encodeURIComponent(q)}`),
  globalSearch: (q) => api.get(`/api/search?q=${encodeURIComponent(q)}`),
  join: (id) => api.post(`/api/channels/${id}/join`),
}

export const linkPreview = {
  fetch: (url) => api.get(`/api/link-preview?url=${encodeURIComponent(url)}`),
}

export const dm = {
  list: () => api.get('/api/dm'),
  open: (userId) => api.post(`/api/dm/${userId}`),
}

export const users = {
  list: () => api.get('/api/users'),
}

export const messages = {
  edit: (id, content) => api.put(`/api/messages/${id}`, { content }),
  delete: (id) => api.delete(`/api/messages/${id}`),
  thread: (id) => api.get(`/api/messages/${id}/thread`),
}

export const reactions = {
  toggle: (messageId, emoji) => api.post(`/api/messages/${messageId}/reactions/${emoji}`),
  list: (messageId) => api.get(`/api/messages/${messageId}/reactions`),
}

export const uploads = {
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/api/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

export const push = {
  vapidKey: () => api.get('/api/push/vapid-key'),
  subscribe: (data) => api.post('/api/push/subscribe', data),
  unsubscribe: (endpoint) => api.delete('/api/push/subscribe', { data: { endpoint } }),
}

export const profile = {
  get: () => api.get('/api/profile'),
  update: (data) => api.put('/api/profile', data),
  changePassword: (data) => api.put('/api/profile/password', data),
}

export const admin = {
  listUsers: () => api.get('/api/admin/users'),
  createUser: (data) => api.post('/api/admin/users', data),
  deleteUser: (id) => api.delete(`/api/admin/users/${id}`),
  setRole: (id, role) => api.put(`/api/admin/users/${id}/role`, { role }),
  listChannels: () => api.get('/api/admin/channels'),
  deleteChannel: (id) => api.delete(`/api/admin/channels/${id}`),
  getChannelMembers: (id) => api.get(`/api/admin/channels/${id}/members`),
  addChannelMember: (channelId, userId) => api.post(`/api/admin/channels/${channelId}/members`, { user_id: userId }),
  removeChannelMember: (channelId, userId) => api.delete(`/api/admin/channels/${channelId}/members/${userId}`),
}

export default api
