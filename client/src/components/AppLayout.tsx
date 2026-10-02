import {
  Banknote,
  ChartBar,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  Settings as SettingsIcon,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMyPermissions } from '@/api/modules';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  /** Раздел доступен только если у роли есть право на этот ресурс (раздел 8.2.3 ТЗ). */
  resource?: string;
}

// Биржа/тикеты — внутри Прихода (раздел 2 ТЗ), Логистика — тип продажи внутри Продажи (раздел 3),
// Клиенты/Заводы/Справочники — вкладки на «Контрагентах», Пользователи — вкладка в Настройках.
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Панель', icon: LayoutDashboard, end: true },
  { to: '/incoming', label: 'Приход', icon: Package, resource: 'incoming' },
  { to: '/sales', label: 'Продажи', icon: Wallet, resource: 'sales' },
  { to: '/cash', label: 'Касса', icon: Wallet, resource: 'cash' },
  { to: '/cash-service', label: 'Обналичивание', icon: Banknote, resource: 'cashService' },
  { to: '/reports', label: 'Отчёты', icon: ChartBar, resource: 'reports' },
  { to: '/counterparties', label: 'Контрагенты', icon: UsersIcon, resource: 'references' },
  { to: '/audit-log', label: 'Журнал действий', icon: History, resource: 'auditLog' },
  { to: '/settings', label: 'Настройки', icon: SettingsIcon, resource: 'settings' },
];

export function AppLayout() {
  const { username, fullName, role, logout } = useAuth();
  const { pathname } = useLocation();
  const permissions = useMyPermissions();

  const visibleItems = NAV_ITEMS.filter((item) => !item.resource || permissions.data?.resources[item.resource]);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-3 py-4">
          <div className="text-base font-semibold">Cement ERP</div>
          <div className="text-xs text-muted-foreground">Дилер цемента</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map((item) => {
                  const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink to={item.to}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 pb-1">
            <div className="text-sm font-medium">{fullName ?? username}</div>
            <div className="text-xs text-muted-foreground">{role ? ROLE_LABELS[role] : ''}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => logout()}>
            <LogOut />
            Выйти
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="mx-auto max-w-7xl p-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>

      {/* Раздел 10 ТЗ: на телефоне меню превращается в нижнюю панель. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-background md:hidden">
        {visibleItems.slice(0, 5).map((item) => {
          const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </SidebarProvider>
  );
}
