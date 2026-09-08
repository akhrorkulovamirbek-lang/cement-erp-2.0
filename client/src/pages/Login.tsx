import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { Button, Input } from '../components/form';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Cement ERP</h1>
        <p className="mb-6 text-sm text-slate-500">Войдите, чтобы продолжить</p>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Логин</span>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Пароль</span>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={loading} className="mt-6 w-full">
          {loading ? 'Вход…' : 'Войти'}
        </Button>
      </form>
    </div>
  );
}
