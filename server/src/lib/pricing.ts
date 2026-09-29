export type VehicleType = 'CLIENT' | 'OWN' | 'HIRED';

/** Раздел 3 ТЗ: "для машины клиента цена перевозки = 0". Общая формула для Продажи (блок
 * доставки) и Прихода-Напрямую (тот же блок), чтобы не дублировать её в двух модулях. */
export function computeFreightTotal(vehicleType: VehicleType, tonnage: number, freightPricePerTon: number | null | undefined): number {
  if (vehicleType === 'CLIENT') return 0;
  return tonnage * (freightPricePerTon ?? 0);
}
