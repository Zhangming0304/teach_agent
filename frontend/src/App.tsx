import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Students from './pages/Students'
import Grading from './pages/Grading'
import ErrorAnalysis from './pages/ErrorAnalysis'
import PracticeGenerator from './pages/PracticeGenerator'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/students" element={<Students />} />
          <Route path="/grading" element={<Grading />} />
          <Route path="/errors" element={<ErrorAnalysis />} />
          <Route path="/practice" element={<PracticeGenerator />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
