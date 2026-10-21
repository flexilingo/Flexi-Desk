import { Routes, Route } from 'react-router-dom';
import { StudyLanding } from './StudyLanding';
import { StudyRunner } from './StudyRunner';

export function StudyPage() {
  return (
    <Routes>
      <Route index element={<StudyLanding />} />
      <Route path="session/:sessionId" element={<StudyRunner />} />
    </Routes>
  );
}
