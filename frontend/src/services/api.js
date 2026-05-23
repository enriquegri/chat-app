import axios from 'axios'

const api = axios.create({ baseURL: '' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const auth = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
}

export const channels = {
  list: () => api.get('/api/channels'),
  create: (data) => api.post('/api/channels', data),
  messages: (id) => api.get(`/api/channels/${id}/messages`),
  join: (id) => api.post(`/api/channels/${id}/join`),
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

export default api
