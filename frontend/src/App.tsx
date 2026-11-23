import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ReservaPage } from './pages/ReservaPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta temporal para probar nuestra pantalla */}
        <Route path="/" element={<ReservaPage />} />
        <Route path="/reservar/:tripId" element={<ReservaPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;