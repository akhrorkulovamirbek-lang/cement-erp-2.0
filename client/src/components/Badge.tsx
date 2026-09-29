import { Badge as UiBadge } from '@/components/ui/badge';

const TONE_TO_VARIANT = {
  slate: 'secondary',
  green: 'outline',
  red: 'destructive',
  amber: 'secondary',
  blue: 'secondary',
} as const;

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: keyof typeof TONE_TO_VARIANT }) {
  return <UiBadge variant={TONE_TO_VARIANT[tone]}>{children}</UiBadge>;
}
