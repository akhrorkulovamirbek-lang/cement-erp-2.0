import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Exchange } from './pages/Exchange';
import { IncomingPage } from './pages/Incoming';
import { Sales } from './pages/Sales';
import { LogisticsPage } from './pages/Logistics';
import { Cash } from './pages/Cash';
import { Clients } from './pages/Clients';
import { ClientDetail } from './pages/ClientDetail';
import { Zavody } from './pages/Zavody';
import { ZavodDetail } from './pages/ZavodDetail';
import { References } from './pages/References';

function ProtectedLayout() {
  const { username, loading } = useAuth();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-400">Загрузка…</div>;
  }
  if (!username) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/exchange" element={<Exchange />} />
        <Route path="/incoming" element={<IncomingPage />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/logistics" element={<LogisticsPage />} />
        <Route path="/cash" element={<Cash />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/zavody" element={<Zavody />} />
        <Route path="/zavody/:id" element={<ZavodDetail />} />
        <Route path="/references" element={<References />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
