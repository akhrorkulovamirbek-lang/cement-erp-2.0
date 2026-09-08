import clsx from 'clsx';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Панель', icon: '📊', end: true },
  { to: '/exchange', label: 'Биржа', icon: '🎫' },
  { to: '/incoming', label: 'Приход', icon: '🚚' },
  { to: '/sales', label: 'Продажи', icon: '💰' },
  { to: '/logistics', label: 'Логистика', icon: '🚛' },
  { to: '/cash', label: 'Касса', icon: '🏦' },
  { to: '/clients', label: 'Клиенты', icon: '👥' },
  { to: '/zavody', label: 'Заводы', icon: '🏭' },
  { to: '/references', label: 'Справочники', icon: '📁' },
];

export function Sidebar() {
  const { username, logout } = useAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-5">
        <div className="text-lg font-bold text-slate-900">Cement ERP</div>
        <div className="text-xs text-slate-500">Дилер цемента</div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-4 py-4">
        <div className="mb-2 truncate text-xs text-slate-500">{username}</div>
        <button
          onClick={() => logout()}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Выйти
        </button>
      </div>
    </aside>
  );
}
