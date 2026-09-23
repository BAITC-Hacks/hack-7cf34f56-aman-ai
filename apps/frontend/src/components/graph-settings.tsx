import { useId } from 'react'
import { RotateCcw } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { roles } from '@/lib/contracts'
import { compact, roleLabels } from '@/lib/format'
import { applyGraphPreset, type GraphPreset, type GraphSettings } from '@/lib/graph-settings'

export type GraphSettingsPanelProps = {
  settings: GraphSettings
  onChange: (value: GraphSettings) => void
  clusters: number[]
  maxVolume: number
  onResetLayout: () => void
  metricLabel?: string
}

function SettingSlider({ label, value, min, max, step, onChange, suffix = '' }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (value: number) => void; suffix?: string
}) {
  const id = useId()
  return <Field>
    <div className="flex items-center justify-between gap-2">
      <FieldLabel id={id}>{label}</FieldLabel>
      <output className="text-xs tabular-nums text-muted-foreground">{Number(value.toFixed(3))}{suffix}</output>
    </div>
    <Slider aria-labelledby={id} value={[value]} min={min} max={max} step={step} onValueChange={values => onChange(values[0])} />
  </Field>
}

function SettingSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  return <Field orientation="horizontal"><FieldLabel htmlFor={id}>{label}</FieldLabel><Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} /></Field>
}

export function GraphSettingsPanel({ settings, onChange, clusters, maxVolume, onResetLayout, metricLabel = 'Приоритет проверки' }: GraphSettingsPanelProps) {
  const id = useId()
  const update = <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => onChange({ ...settings, [key]: value })
  const presets: [GraphPreset, string][] = [
    ['priority', 'Топ приоритетов'], ['volume', 'Крупные потоки'], ['seeds', 'Сеть исходных'],
    ['coordinators', 'Координаторы'], ['consolidators', 'Консолидаторы'],
  ]
  return <div className="graph-settings-content p-4">
    <div className="flex flex-wrap gap-1.5 pb-3" aria-label="Быстрые фильтры">
      {presets.map(([key, label]) => <Button key={key} size="sm" variant="outline" onClick={() => onChange(applyGraphPreset(settings, key, maxVolume))}>{label}</Button>)}
    </div>
    <Accordion type="multiple" defaultValue={['filters']}>
      <AccordionItem value="filters">
        <AccordionTrigger>ФИЛЬТРЫ</AccordionTrigger>
        <AccordionContent>
          <FieldGroup className="gap-4 py-2">
            <Field>
              <FieldLabel id={`${id}-priority`}>{metricLabel}</FieldLabel>
              <ToggleGroup type="single" value={settings.priority} size="sm" variant="outline" className="flex-wrap" aria-labelledby={`${id}-priority`} onValueChange={value => value && update('priority', value as GraphSettings['priority'])}>
                <ToggleGroupItem value="all">Все</ToggleGroupItem>
                <ToggleGroupItem value="low" title="От 0 до 0,25">Низкий</ToggleGroupItem>
                <ToggleGroupItem value="medium" title="От 0,25 до 0,50">Средний</ToggleGroupItem>
                <ToggleGroupItem value="elevated" title="От 0,50 до 0,75">Повышенный</ToggleGroupItem>
                <ToggleGroupItem value="high" title="От 0,75 до 1,00">Высокий</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-volume`}>Мин. наблюдаемый оборот, ₸</FieldLabel>
              <Input id={`${id}-volume`} type="number" inputMode="decimal" min={0} value={settings.minVolume} onChange={event => update('minVolume', Math.max(0, Number(event.target.value) || 0))} />
              <span className="text-xs text-muted-foreground">Максимум в загруженной сети: ₸{compact(maxVolume)}</span>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Роль · гипотеза</FieldLegend>
              <FieldGroup className="gap-2">
                {roles.map(role => <Field key={role} orientation="horizontal">
                  <Checkbox id={`${id}-${role}`} checked={settings.roles.includes(role)} onCheckedChange={checked => update('roles', checked ? [...settings.roles, role] : settings.roles.filter(value => value !== role))} />
                  <FieldLabel htmlFor={`${id}-${role}`}>{roleLabels[role]}</FieldLabel>
                </Field>)}
              </FieldGroup>
            </FieldSet>
            <Field>
              <FieldLabel htmlFor={`${id}-cluster`}>Кластер</FieldLabel>
              <Select value={settings.cluster} onValueChange={value => update('cluster', value)}>
                <SelectTrigger id={`${id}-cluster`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="all">Все кластеры</SelectItem>{clusters.map(cluster => <SelectItem value={String(cluster)} key={cluster}>Кластер {cluster}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel id={`${id}-depth`}>Колено от исходного клиента</FieldLabel>
              <ToggleGroup type="multiple" value={settings.depths.map(String)} variant="outline" size="sm" spacing={0} aria-labelledby={`${id}-depth`} onValueChange={values => update('depths', values.map(Number))}>
                {[0, 1, 2, 3, 4].map(depth => <ToggleGroupItem key={depth} value={String(depth)}>{depth === 0 ? '0 · seed' : depth === 4 ? '4 · край' : depth}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel id={`${id}-seed`}>Исходные клиенты</FieldLabel>
              <ToggleGroup type="single" value={settings.seeds} variant="outline" size="sm" spacing={0} aria-labelledby={`${id}-seed`} onValueChange={value => value && update('seeds', value as GraphSettings['seeds'])}>
                <ToggleGroupItem value="all">Все</ToggleGroupItem><ToggleGroupItem value="seeds">Только seed</ToggleGroupItem><ToggleGroupItem value="non-seeds">Без seed</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-top`}>Топ по приоритету проверки</FieldLabel>
              <Select value={String(settings.topN)} onValueChange={value => update('topN', Number(value))}>
                <SelectTrigger id={`${id}-top`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="0">Все узлы</SelectItem>{[20, 50, 100].map(count => <SelectItem value={String(count)} key={count}>{count} приоритетов</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <SettingSwitch label="Скрыть изолированные узлы" checked={settings.hideIsolated} onChange={value => update('hideIsolated', value)} />
            <Button variant="ghost" size="sm" onClick={() => onChange(applyGraphPreset(settings, 'all', maxVolume))}><RotateCcw data-icon="inline-start" />Сбросить фильтры</Button>
          </FieldGroup>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="grouping">
        <AccordionTrigger>ГРУППИРОВКА</AccordionTrigger>
        <AccordionContent><FieldGroup className="py-2"><Field>
          <FieldLabel id={`${id}-colors`}>Цвет узлов</FieldLabel>
          <ToggleGroup type="single" value={settings.colorBy} variant="outline" size="sm" spacing={0} aria-labelledby={`${id}-colors`} onValueChange={value => value && update('colorBy', value as GraphSettings['colorBy'])}>
            <ToggleGroupItem value="risk">{metricLabel.includes('Риск') ? 'Риск' : 'Приоритет'}</ToggleGroupItem><ToggleGroupItem value="role">Роль</ToggleGroupItem><ToggleGroupItem value="cluster">Кластер</ToggleGroupItem>
          </ToggleGroup>
        </Field></FieldGroup></AccordionContent>
      </AccordionItem>
      <AccordionItem value="display">
        <AccordionTrigger>ОТОБРАЖЕНИЕ</AccordionTrigger>
        <AccordionContent><FieldGroup className="gap-4 py-2">
          <SettingSwitch label="Стрелки переводов" checked={settings.showArrows} onChange={value => update('showArrows', value)} />
          <SettingSwitch label="Подписи GID" checked={settings.showLabels} onChange={value => update('showLabels', value)} />
          <SettingSwitch label="Суммы на связях" checked={settings.showAmounts} onChange={value => update('showAmounts', value)} />
          <SettingSwitch label="Кольца исходных узлов" checked={settings.showSeedRings} onChange={value => update('showSeedRings', value)} />
          <SettingSwitch label="Анимация потока" checked={settings.animateFlow} onChange={value => update('animateFlow', value)} />
          <SettingSlider label="Масштаб узлов" value={settings.nodeScale} min={0.5} max={2} step={0.1} suffix="×" onChange={value => update('nodeScale', value)} />
          <SettingSlider label="Толщина связей" value={settings.linkScale} min={0.5} max={3} step={0.1} suffix="×" onChange={value => update('linkScale', value)} />
          <SettingSlider label="Видимость подписей" value={settings.labelVisibility} min={0.5} max={2} step={0.1} suffix="×" onChange={value => update('labelVisibility', value)} />
        </FieldGroup></AccordionContent>
      </AccordionItem>
      <AccordionItem value="forces">
        <AccordionTrigger>СИЛЫ</AccordionTrigger>
        <AccordionContent><FieldGroup className="gap-5 py-2">
          <SettingSlider label="Притяжение к центру" value={settings.centerForce} min={0} max={0.15} step={0.005} onChange={value => update('centerForce', value)} />
          <SettingSlider label="Отталкивание" value={settings.repulsion} min={10} max={400} step={5} onChange={value => update('repulsion', value)} />
          <SettingSlider label="Сила связей" value={settings.linkForce} min={0} max={1} step={0.05} onChange={value => update('linkForce', value)} />
          <SettingSlider label="Длина связей" value={settings.linkDistance} min={25} max={220} step={5} onChange={value => update('linkDistance', value)} />
          <Button variant="outline" size="sm" onClick={onResetLayout}><RotateCcw data-icon="inline-start" />Перестроить раскладку</Button>
        </FieldGroup></AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>
}
