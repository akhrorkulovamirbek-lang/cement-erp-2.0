import type { Control, FieldErrors, FieldValues, Path, UseFormRegister, UseFormWatch } from 'react-hook-form';
import { RHFButtonGroup } from './ButtonGroup';
import { FormRow, Input } from './form';

const CURRENCY_OPTIONS = [
  { value: 'UZS', label: 'Сум' },
  { value: 'USD', label: '$ USD' },
];
const PAYMENT_OPTIONS = [
  { value: 'перечисление', label: 'Перечисление' },
  { value: 'наличка', label: 'Наличка' },
  { value: 'карта', label: 'Карта' },
];

interface MoneyFormValues {
  amount: string;
  currency: 'UZS' | 'USD';
  usd_rate: string;
  payment_type: 'перечисление' | 'наличка' | 'карта';
}

/** Общий кусок формы «сумма + валюта + курс + способ оплаты» — переиспользуется в Кассе,
 * «Погасить долг» на карточке клиента и где ещё потребуется ввести сумму с валютой. */
export function MoneyFields<T extends FieldValues & MoneyFormValues>({
  control,
  register,
  watch,
  errors,
  forceShowRate,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  errors: FieldErrors<T>;
  /** Показать курс доллара, даже если основная валюта — сум (например, когда вторая часть
   * смешанного платежа в долларах и курс всё равно нужен для её конвертации). */
  forceShowRate?: boolean;
}) {
  const currency = watch('currency' as Path<T>);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormRow label="Сумма" error={errors.amount?.message as string | undefined}>
          <Input type="number" step="0.01" {...register('amount' as Path<T>, { required: 'Укажите сумму' })} />
        </FormRow>
        <FormRow label="Валюта">
          <RHFButtonGroup control={control} name={'currency' as Path<T>} options={CURRENCY_OPTIONS} />
        </FormRow>
      </div>
      {(currency === 'USD' || forceShowRate) && (
        <FormRow label="Курс доллара" error={errors.usd_rate?.message as string | undefined}>
          <Input type="number" step="0.01" {...register('usd_rate' as Path<T>, { required: 'Укажите курс' })} />
        </FormRow>
      )}
      <FormRow label="Способ оплаты">
        <RHFButtonGroup control={control} name={'payment_type' as Path<T>} options={PAYMENT_OPTIONS} />
      </FormRow>
    </>
  );
}
