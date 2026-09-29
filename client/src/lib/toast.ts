import { toast } from 'sonner';

export function notify(message: string, kind: 'success' | 'error' = 'success') {
  if (kind === 'error') {
    toast.error(message);
  } else {
    toast.success(message);
  }
}

export function useToast() {
  return { notify };
}
