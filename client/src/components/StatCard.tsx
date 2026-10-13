import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  return (
    <Card className="gap-1 py-3 sm:gap-6 sm:py-6">
      <CardHeader className="pb-1 sm:pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            'text-xl tabular-nums sm:text-2xl',
            tone === 'positive' && 'text-emerald-600',
            tone === 'negative' && 'text-destructive',
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}
