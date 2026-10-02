import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { RequirePermission } from '@/components/RequirePermission';
import { useAuth } from '@/context/AuthContext';
import { AuditLog } from './pages/AuditLog';
import { Cash } from './pages/Cash';
import { CashService } from './pages/CashService';
import { ClientDetail } from './pages/ClientDetail';
import { Counterparties } from './pages/Counterparties';
import { Dashboard } from './pages/Dashboard';
import { IncomingPage } from './pages/Incoming';
import { Login } from './pages/Login';
import { Reports } from './pages/Reports';
import { Sales } from './pages/Sales';
import { Settings } from './pages/Settings';
import { ZavodDetail } from './pages/ZavodDetail';

function ProtectedLayout() {
  const { username, loading } = useAuth();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Загрузка…</div>;
  }
  if (!username) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/incoming" element={<RequirePermission resource="incoming"><IncomingPage /></RequirePermission>} />
        <Route path="/sales" element={<RequirePermission resource="sales"><Sales /></RequirePermission>} />
        <Route path="/cash" element={<RequirePermission resource="cash"><Cash /></RequirePermission>} />
        <Route path="/cash-service" element={<RequirePermission resource="cashService"><CashService /></RequirePermission>} />
        <Route path="/reports" element={<RequirePermission resource="reports"><Reports /></RequirePermission>} />
        <Route path="/counterparties" element={<RequirePermission resource="references"><Counterparties /></RequirePermission>} />
        <Route path="/clients/:id" element={<RequirePermission resource="references"><ClientDetail /></RequirePermission>} />
        <Route path="/zavody/:id" element={<RequirePermission resource="references"><ZavodDetail /></RequirePermission>} />
        <Route path="/audit-log" element={<RequirePermission resource="auditLog"><AuditLog /></RequirePermission>} />
        <Route path="/settings" element={<RequirePermission resource="settings"><Settings /></RequirePermission>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
