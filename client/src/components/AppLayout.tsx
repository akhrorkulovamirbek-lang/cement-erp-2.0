import {
  Banknote,
  Building2,
  ChartBar,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings as SettingsIcon,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMyPermissions } from '@/api/modules';
import { ThemeToggle } from '@/components/ThemeToggle';
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
  useSidebar,
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
  const { username, fullName, role, logout, isPlatformAdmin, organizationName } = useAuth();
  const { pathname } = useLocation();
  const permissions = useMyPermissions();

  const visibleItems: NavItem[] = isPlatformAdmin
    ? [{ to: '/organizations', label: 'Организации', icon: Building2 }]
    : NAV_ITEMS.filter((item) => !item.resource || permissions.data?.resources[item.resource]);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-3 py-4">
          <div className="text-base font-semibold">Cement ERP</div>
          <div className="text-xs text-muted-foreground">{isPlatformAdmin ? 'Владелец платформы' : (organizationName ?? 'Дилер цемента')}</div>
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
            <div className="text-xs text-muted-foreground">{isPlatformAdmin ? 'Владелец платформы' : role ? ROLE_LABELS[role] : ''}</div>
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
          <span className="text-sm font-semibold md:hidden">{organizationName ?? 'Cement ERP'}</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>

      <MobileNav items={visibleItems} pathname={pathname} />
    </SidebarProvider>
  );
}

/** Раздел 10 ТЗ: на телефоне меню превращается в нижнюю панель — четыре главных раздела под
 * большой палец и «Меню» со всеми остальными (то же боковое меню, что открывается на компьютере). */
function MobileNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const { toggleSidebar } = useSidebar();
  const main = items.slice(0, 4);
  const hiddenActive = items.slice(4).some((item) => pathname.startsWith(item.to));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {main.map((item) => {
        const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <item.icon className="size-5" />
            <span className="max-w-full truncate">{item.label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={toggleSidebar}
        className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] ${
          hiddenActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Menu className="size-5" />
        <span>Меню</span>
      </button>
    </nav>
  );
}
