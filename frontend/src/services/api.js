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
  me: () => api.get('/api/me'),
}

export const channels = {
  list: () => api.get('/api/channels'),
  create: (data) => api.post('/api/channels', data),
  messages: (id) => api.get(`/api/channels/${id}/messages`),
  join: (id) => api.post(`/api/channels/${id}/join`),
}

export default api
