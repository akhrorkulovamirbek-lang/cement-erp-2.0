/** Раздел 9.3 ТЗ: модуль регистрируется в ядре (код, название, описание, пункты меню),
 * переключатель в Настройках создаётся автоматически из этого списка.
 * Пока модуль не реализован (нет ни одного роута/экрана под его code), включение/выключение
 * тумблера ни на что не влияет — это плейсхолдер под будущие фазы. */
export interface ModuleDefinition {
  code: string;
  name: string;
  description: string;
  whenDisabled: string;
  defaultEnabled: boolean;
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    code: 'incoming',
    name: 'Приход',
    description: 'Приход цемента на склад Факт, Напрямую и по тикетам.',
    whenDisabled: 'Пункт «Приход» исчезнет из меню, новые приходы вносить будет нельзя.',
    defaultEnabled: true,
  },
  {
    code: 'sales_cement',
    name: 'Продажа цемента',
    description: 'Продажа цемента клиентам со склада, тикетов или напрямую.',
    whenDisabled: 'В форме продажи останется только тип «Логистика».',
    defaultEnabled: true,
  },
  {
    code: 'sales_logistics',
    name: 'Продажа логистики',
    description: 'Продажа перевозки без цемента (своими или наёмными машинами).',
    whenDisabled: 'В форме продажи останется только тип «Цемент».',
    defaultEnabled: true,
  },
  {
    code: 'cash',
    name: 'Касса',
    description: 'Приходы и расходы денег, остатки по наличным/карте/переводу.',
    whenDisabled: 'Пункт «Касса» исчезнет из меню.',
    defaultEnabled: true,
  },
  {
    code: 'broker',
    name: 'Брокерский счёт и тикеты',
    description: 'Покупка цемента на бирже по тикетам, пополнение брокерского счёта.',
    whenDisabled: 'Склад «Тикеты» и покупка по тикету станут недоступны.',
    defaultEnabled: true,
  },
  {
    code: 'warehouse_direct',
    name: 'Склад «Напрямую»',
    description: 'Мгновенная продажа: товар едет клиенту прямо с завода.',
    whenDisabled: 'В приходе и продаже пропадёт вариант «Напрямую».',
    defaultEnabled: true,
  },
  {
    code: 'goods_payment',
    name: 'Оплата товаром',
    description: 'Клиент гасит долг цементом вместо денег.',
    whenDisabled: 'Кнопка «Оплата товаром» исчезнет из Прихода и карточки клиента.',
    defaultEnabled: true,
  },
  {
    code: 'cash_service',
    name: 'Обналичивание',
    description: 'Приём переводов на банковский счёт и выдача наличных за вычетом комиссии.',
    whenDisabled: 'Пункт «Обналичивание» исчезнет из меню.',
    defaultEnabled: true,
  },
  {
    code: 'hired_vehicles',
    name: 'Наёмные машины',
    description: 'Перевозка наёмным транспортом с отдельной ценой найма и долгом перевозчику.',
    whenDisabled: 'В форме продажи и логистики останется только «Своя машина» / «Машина клиента».',
    defaultEnabled: true,
  },
  {
    code: 'cash_usd',
    name: 'Доллар в кассе',
    description: 'Приём и выдача денег в долларах с ручным курсом.',
    whenDisabled: 'В кассе, брокерском счёте и обналичивании останутся только суммы в сумах.',
    defaultEnabled: true,
  },
  {
    code: 'report_builder',
    name: 'Конструктор отчётов',
    description: 'Пользователь сам собирает и сохраняет отчёт нужного вида.',
    whenDisabled: 'Пункт «Конструктор отчётов» исчезнет из раздела Отчёты.',
    defaultEnabled: true,
  },
];
