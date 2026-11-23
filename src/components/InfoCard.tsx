/**
 * Info card for the selected structure: names, chips, TA ID, facts, clinical note and actions.
 */
import { useAtlasStore } from '../store/useAtlasStore';
import { getStructure } from '../anatomy/catalog';
import { REGION_LABEL, SYSTEM_BY_ID } from '../data/systems';
import type { FactKey } from '../types';
import { focusSelected } from '../actions';
import { Icon } from './ui';

const FACT_LABELS: [FactKey, string][] = [
  ['origin', 'Origin'],
  ['insertion', 'Insertion'],
  ['action', 'Action'],
  ['function', 'Function'],
  ['articulations', 'Articulations'],
  ['features', 'Key features'],
  ['roots', 'Roots'],
  ['course', 'Course'],
  ['branches', 'Branches'],
  ['supplies', 'Supplies'],
  ['drainage', 'Drainage'],
  ['innervation', 'Innervation'],
  ['bloodSupply', 'Blood supply'],
];

export function InfoCard({ id }: { id: string }) {
  const sex = useAtlasStore((s) => s.sex);
  const inStudy = useAtlasStore((s) => s.studyList.includes(id));
  const isolated = useAtlasStore((s) => !!s.isolateIds?.includes(id));
  const def = getStructure(sex, id);
  if (!def) return null;
  const sys = SYSTEM_BY_ID[def.system];
  const st = useAtlasStore.getState;

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-3">
        <button className="mb-3 flex items-center gap-1 text-[12.5px] font-medium text-accent-soft hover:text-white" onClick={() => st().select(null)}>
          <Icon name="back" size={14} /> Back to explore
        </button>
        <h2 className="font-display text-[26px] font-semibold leading-tight text-white">{def.nameEn}</h2>
        <div className="mt-0.5 text-[13.5px] italic text-white/55">{def.nameLatin}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip">
            <span className="h-2 w-2 rounded-full" style={{ background: sys.dot }} />
            {sys.label}
          </span>
          {def.side !== 'midline' && <span className="chip capitalize">{def.side}</span>}
          <span className="chip">{REGION_LABEL[def.region]}</span>
          {def.taId || !def.fmaId ? (
            <span className="chip font-mono text-[10.5px]" title="Terminologia Anatomica identifier">
              TA {def.taId ?? '—'}
            </span>
          ) : (
            <span className="chip font-mono text-[10.5px]" title="Foundational Model of Anatomy concept (BodyParts3D)">
              {def.fmaId}
            </span>
          )}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <Section title="Overview">{def.overview}</Section>
        {def.source && (
          <p className="text-[11px] leading-snug text-white/40">
            {def.source === 'bodyparts3d'
              ? 'Geometry: BodyParts3D (real anatomy, CC BY-SA 2.1 JP).'
              : def.source === 'reconstructed'
                ? 'Geometry: reconstructed by AnatoVerse from surrounding BodyParts3D structures.'
                : 'Geometry: schematic AnatoVerse model fitted to the real skeleton (not in BodyParts3D).'}
            {sex === 'female' && ' Female body: shaped from the real male anatomy with a landmark-guided female morph (pelvis, shoulders, rib cage, breasts); female reproductive organs are AnatoVerse models.'}
          </p>
        )}
        {FACT_LABELS.filter(([k]) => def.facts[k]).map(([k, label]) => (
          <Section key={k} title={label}>
            {def.facts[k]}
          </Section>
        ))}
        {def.clinicalNote && (
          <div className="rounded-2xl border border-amber/30 bg-amber/[0.08] p-3.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-amber">
              <Icon name="info" size={13} /> Clinical note
            </div>
            <p className="text-[13px] leading-relaxed text-white/85">{def.clinicalNote}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-t border-white/[0.08] p-3">
        <Action icon="eye-off" label="Hide" onClick={() => st().hide(id)} />
        <Action icon="isolate" label={isolated ? 'Un-isolate' : 'Isolate'} active={isolated} onClick={() => st().isolate(isolated ? null : [id])} />
        <Action icon="layers" label="Only system" onClick={() => st().showOnlySystem(def.system)} />
        <Action icon="focus" label="Focus" onClick={focusSelected} hint="F" />
        <Action icon={inStudy ? 'bookmark-fill' : 'bookmark'} label={inStudy ? 'In study list' : 'Add to study'} active={inStudy} onClick={() => st().toggleStudy(id)} className="col-span-2" />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="section-title mb-1">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-white/80">{children}</p>
    </section>
  );
}

function Action({ icon, label, onClick, active, className = '', hint }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; active?: boolean; className?: string; hint?: string }) {
  return (
    <button onClick={onClick} title={hint ? `${label} (${hint})` : label} className={`btn flex-col !gap-1 !px-1 !py-2 !text-[11.5px] ${active ? 'bg-accent/20 text-accent-soft' : 'bg-white/[0.04]'} ${className}`}>
      <Icon name={icon} size={16} />
      {label}
    </button>
  );
}
