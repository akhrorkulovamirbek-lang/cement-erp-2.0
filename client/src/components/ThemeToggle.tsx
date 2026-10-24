import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

/** Переключатель светлой/тёмной темы. По умолчанию тема берётся из настроек устройства, выбор запоминается. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
