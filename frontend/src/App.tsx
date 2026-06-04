import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ClassDetail from './pages/ClassDetail'
import ScoreEntry from './pages/ScoreEntry'
import PrintFinale from './pages/PrintFinale'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                       element={<Dashboard />} />
        <Route path="/classes/:id"            element={<ClassDetail />} />
        <Route path="/sessions/:id"           element={<ScoreEntry />} />
        <Route path="/sessions/:id/print"     element={<PrintFinale />} />
      </Routes>
    </BrowserRouter>
  )
}
