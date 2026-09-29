import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface SidePanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}

/** Раздел 10 ТЗ: форма открывается боковой панелью справа, таблица остаётся видна. Замена
 * центральной модалки (components/Modal.tsx) как основного контейнера форм создания/правки. */
export function SidePanel({ title, onClose, children, widthClass = 'sm:max-w-md' }: SidePanelProps) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className={`w-full ${widthClass} gap-0 p-0`}>
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
