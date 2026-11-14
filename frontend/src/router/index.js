import { createRouter, createWebHistory } from 'vue-router'
import { getStoredUser } from '../services/api.js'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: () => import('../views/ChangePassword.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard
router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  const mustChange = Boolean(getStoredUser()?.must_change_password)

  if (to.meta.requiresAuth && !token) return '/login'
  if (to.path === '/login' && token) return mustChange ? '/change-password' : '/'
  if (token && mustChange && to.path !== '/change-password') return '/change-password'
  if (to.path === '/change-password' && token && !mustChange) return '/'
  return true
})

export default router
