import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, RequireAuth, RequireAdmin } from './auth'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import AdminLayout from './pages/admin/AdminLayout'
import Users from './pages/admin/Users'
import Classes from './pages/admin/Classes'
import Assignments from './pages/admin/Assignments'
import Settings from './pages/admin/Settings'
import Dashboard from './pages/Dashboard'
import ClassDetail from './pages/ClassDetail'
import ScoreEntry from './pages/ScoreEntry'
import PrintFinale from './pages/PrintFinale'
import Profile from './pages/Profile'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"            element={<Login />} />
          <Route path="/change-password"  element={<RequireAuth><ChangePassword /></RequireAuth>} />
          <Route path="/admin"            element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
            <Route index                  element={<Navigate to="users" replace />} />
            <Route path="users"           element={<Users />} />
            <Route path="classes"         element={<Classes />} />
            <Route path="assignments"     element={<Assignments />} />
            <Route path="settings"        element={<Settings />} />
          </Route>
          <Route path="/"                 element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/classes/:id"      element={<RequireAuth><ClassDetail /></RequireAuth>} />
          <Route path="/sessions/:id"     element={<RequireAuth><ScoreEntry /></RequireAuth>} />
          <Route path="/sessions/:id/print" element={<RequireAuth><PrintFinale /></RequireAuth>} />
          <Route path="/profile"          element={<RequireAuth><Profile /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
