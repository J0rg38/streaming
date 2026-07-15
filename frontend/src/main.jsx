import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home           from './pages/Home.jsx';
import SeriesDetail   from './components/SeriesDetail.jsx';
import MovieDetail    from './pages/MovieDetail.jsx';
import Search         from './pages/Search.jsx';
import AdultHome      from './pages/AdultHome.jsx';
import PlayerPage     from './pages/PlayerPage.jsx';
import Admin          from './pages/Admin.jsx';
import Login          from './pages/Login.jsx';
import Register       from './pages/Register.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './index.css';

// --- Enrutado de la aplicación --------------------------------------------
//   Públicas:  /login, /register
//   Usuario:   /, /series/:id, /watch/...
//   Admin:     /admin
const Protected = ({ children, admin = false }) => (
  <ProtectedRoute requireAdmin={admin}>{children}</ProtectedRoute>
);
const AdultOnly = ({ children }) => (
  <ProtectedRoute requireAdult>{children}</ProtectedRoute>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Públicas */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Requieren usuario autenticado */}
          <Route path="/"                     element={<Protected><Home /></Protected>} />
          <Route path="/search"               element={<Protected><Search /></Protected>} />
          <Route path="/adultos"              element={<AdultOnly><AdultHome /></AdultOnly>} />
          <Route path="/adultos/buscar"       element={<AdultOnly><Search adult /></AdultOnly>} />
          <Route path="/movie/:id"            element={<Protected><MovieDetail /></Protected>} />
          <Route path="/series/:id"           element={<Protected><SeriesDetail /></Protected>} />
          <Route path="/watch/:mediaId"       element={<Protected><PlayerPage /></Protected>} />
          <Route path="/watch/:mediaId/:epId" element={<Protected><PlayerPage /></Protected>} />

          {/* Requiere rol admin */}
          <Route path="/admin" element={<Protected admin><Admin /></Protected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
