import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, RequireAuth, RequireAdmin } from './auth'
import { UIProvider } from './components/ui'
import BottomNav from './components/BottomNav'
import { startQueueSync } from './lib/offlineQueue'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import AdminLayout from './pages/admin/AdminLayout'
import Users from './pages/admin/Users'
import Classes from './pages/admin/Classes'
import Assignments from './pages/admin/Assignments'
import Templates from './pages/admin/Templates'
import Settings from './pages/admin/Settings'
import Dashboard from './pages/Dashboard'
import Calendar from './pages/Calendar'
import Documents from './pages/Documents'
import Timetable from './pages/Timetable'
import ClassDetail from './pages/ClassDetail'
import Synthesis from './pages/Synthesis'
import ScoreEntry from './pages/ScoreEntry'
import PrintFinale from './pages/PrintFinale'
import Profile from './pages/Profile'
import Exams from './pages/Exams'
import ExamEditor from './pages/ExamEditor'
import ExamPrint from './pages/ExamPrint'
import ExamGrade from './pages/ExamGrade'

export default function App() {
  useEffect(() => { startQueueSync() }, [])
  return (
    <AuthProvider>
      <UIProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"            element={<Login />} />
            <Route path="/change-password"  element={<RequireAuth><ChangePassword /></RequireAuth>} />
            <Route path="/admin"            element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
              <Route index                  element={<Navigate to="users" replace />} />
              <Route path="users"           element={<Users />} />
              <Route path="classes"         element={<Classes />} />
              <Route path="assignments"     element={<Assignments />} />
              <Route path="templates"       element={<Templates />} />
              <Route path="settings"        element={<Settings />} />
            </Route>
            <Route path="/"                 element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/calendar"         element={<RequireAuth><Calendar /></RequireAuth>} />
            <Route path="/documents"        element={<RequireAuth><Documents /></RequireAuth>} />
            <Route path="/timetable"        element={<RequireAuth><Timetable /></RequireAuth>} />
            <Route path="/classes/:id"      element={<RequireAuth><ClassDetail /></RequireAuth>} />
            <Route path="/classes/:id/synthesis" element={<RequireAuth><Synthesis /></RequireAuth>} />
            <Route path="/sessions/:id"     element={<RequireAuth><ScoreEntry /></RequireAuth>} />
            <Route path="/sessions/:id/print" element={<RequireAuth><PrintFinale /></RequireAuth>} />
            <Route path="/exams"            element={<RequireAuth><Exams /></RequireAuth>} />
            <Route path="/exams/:id"        element={<RequireAuth><ExamEditor /></RequireAuth>} />
            <Route path="/exams/:id/print"  element={<RequireAuth><ExamPrint /></RequireAuth>} />
            <Route path="/exams/:id/grade"  element={<RequireAuth><ExamGrade /></RequireAuth>} />
            <Route path="/profile"          element={<RequireAuth><Profile /></RequireAuth>} />
          </Routes>
          <BottomNav />
        </BrowserRouter>
      </UIProvider>
    </AuthProvider>
  )
}
