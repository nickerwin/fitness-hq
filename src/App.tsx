import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { TabBar } from './components/ui'
import Summary from './screens/Summary'
import Train, { DayPreview, ExerciseHistory } from './screens/Train'
import Workout from './screens/Workout'
import Nutrition, { RecipeDetail } from './screens/Nutrition'
import Progress from './screens/Progress'
import Settings from './screens/Settings'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <HashRouter>
      <ScrollTop />
      <div className="app">
        <Routes>
          <Route path="/" element={<Summary />} />
          <Route path="/train" element={<Train />} />
          <Route path="/day/:key" element={<DayPreview />} />
          <Route path="/workout/:id" element={<Workout />} />
          <Route path="/exercise/:name" element={<ExerciseHistory />} />
          <Route path="/eat" element={<Nutrition />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Summary />} />
        </Routes>
      </div>
      <TabBar />
    </HashRouter>
  )
}
