import { useContext, useEffect, useRef } from 'react';
import { Context } from '../core/context';
import katex from 'katex';
import { ArrowUpRight, ImageOff, Pin, X, RotateCcw, Info } from 'lucide-react';
import { ActivityIndicator } from './ActivityIndicator';
import { MediaImage } from './MediaImage';
import type { Dataset, Item } from '../core/types';
export const fmt = (x: number, d = 3) =>
  Number.isFinite(x)
    ? x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
    : '—';
export const count = (x: number) => x.toLocaleString('en-US');
export function Equation({ children, block = true }: { children: string; block?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current)
      katex.render(children, ref.current, {
        displayMode: block,
        throwOnError: false,
        strict: false,
      });
  }, [children, block]);
  return <div className={'equation ' + (!block ? 'inline' : '')} ref={ref} />;
}
export function Label({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}
export function Pill({
  children,
  active = false,
  onClick,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      className={'pill ' + (active ? 'active' : '')}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
export function Segment({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="segmented" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          className={value === o.id ? 'active' : ''}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}
export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format = fmt,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (x: number) => string;
}) {
  return (
    <label className="slider">
      <span>
        {label}
        <strong>{format(value)}</strong>
      </span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}
export function Photo({
  item,
  className = '',
  label = true,
}: {
  item: Item;
  className?: string;
  label?: boolean;
}) {
  const provenance = useContext(Context)?.dataset.manifest.provenance;
  return (
    <div className={'photo ' + className}>
      {item.media ? (
        <MediaImage
          key={item.media}
          src={item.media}
          fallback={item.mediaFallback}
          alt={item.name ?? item.id}
        />
      ) : (
        <div className="photo-missing">
          <ImageOff size={22} />
          <span>No preview supplied</span>
          <small>{item.category ?? 'Vector record'}</small>
        </div>
      )}
      {label && (
        <span
          className={
            'photo-label ' + (item.label === 1 ? 'positive' : item.label === 0 ? 'negative' : '')
          }
        >
          {item.label === 1
            ? String(provenance?.positiveLabel ?? 'Positive')
            : item.label === 0
              ? String(provenance?.negativeLabel ?? 'Negative')
              : 'Unlabeled'}
        </span>
      )}
    </div>
  );
}
export function ItemStrip({
  dataset,
  indices,
  selected,
  onSelect,
  pins = [],
  onPin,
}: {
  dataset: Dataset;
  indices: number[];
  selected?: number;
  onSelect: (i: number) => void;
  pins?: number[];
  onPin?: (i: number) => void;
}) {
  return (
    <div className="item-strip">
      {indices.map((i) => (
        <div key={i} className={'item-card ' + (selected === i ? 'selected' : '')}>
          <button
            onClick={() => onSelect(i)}
            aria-label={'Inspect ' + dataset.manifest.items[i].name}
          >
            <Photo item={dataset.manifest.items[i]} />
            <span className="item-name">
              {dataset.manifest.items[i].name ?? dataset.manifest.items[i].id}
            </span>
          </button>
          {onPin && (
            <button
              className={'pin ' + (pins.includes(i) ? 'pinned' : '')}
              aria-label={'Pin ' + dataset.manifest.items[i].id}
              onClick={() => onPin(i)}
            >
              <Pin size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <Info size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = '',
  busy = false,
  status = '',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
  status?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    window.dispatchEvent(new Event('semantic:modal-open'));
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '') + ' ' + className}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </header>
      <div className="modal-body">
        <ActivityIndicator inline busy={busy} status={status} />
        {children}
      </div>
    </dialog>
  );
}
export function Reset({ onClick }: { onClick: () => void }) {
  return (
    <button className="text-button" onClick={onClick}>
      <RotateCcw size={13} />
      Reset experiment
    </button>
  );
}
export function InspectLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="inspect-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
