import { useState } from 'react';
import clsx from 'clsx';
import { PageHeader } from '../components/PageHeader';
import { SimpleRefTable } from '../components/SimpleRefTable';
import { cementMarksHooks, machinesHooks } from '../api/modules';

const TABS = [
  { key: 'marks', label: 'Марки цемента' },
  { key: 'machines', label: 'Машины (свои)' },
] as const;

export function References() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('marks');
  const marks = cementMarksHooks.useList();
  const machines = machinesHooks.useList();

  return (
    <div>
      <PageHeader title="Справочники" subtitle="Марки цемента и собственный автопарк" />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'marks' && (
        <SimpleRefTable
          title="Марки цемента"
          addLabel="Добавить марку"
          fieldLabel="Название"
          fieldName="name"
          rows={marks.data}
          loading={marks.isLoading}
          useCreate={cementMarksHooks.useCreate}
          useUpdate={cementMarksHooks.useUpdate}
          useDelete={cementMarksHooks.useDelete}
          displayValue={(r) => r.name}
        />
      )}

      {tab === 'machines' && (
        <SimpleRefTable
          title="Свои машины"
          addLabel="Добавить машину"
          fieldLabel="Номер"
          fieldName="number"
          rows={machines.data}
          loading={machines.isLoading}
          useCreate={machinesHooks.useCreate}
          useUpdate={machinesHooks.useUpdate}
          useDelete={machinesHooks.useDelete}
          displayValue={(r) => r.number}
        />
      )}
    </div>
  );
}
