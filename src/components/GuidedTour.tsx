import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Play, RotateCcw, Download, Upload, ArrowRight } from 'lucide-react';
import { driver, type Driver, type PopoverDOM, type Side } from 'driver.js';
import 'driver.js/dist/driver.css';
import katex from 'katex';
import { Modal } from './Shared';
import { download } from '../core/dataset';
import type { Dataset, ToolId } from '../core/types';
import {
  availableTour,
  interpolateTour,
  parseTour,
  readTourProgress,
  resolveTour,
  tourFacts,
  tourProgressKey,
  TOUR_TARGETS,
  type ResolvedTour,
  type TourDocument,
  type TourScene,
  type TourStep,
} from '../core/tour';
import './tour.css';

type Props = {
  dataset: Dataset | null;
  busy: boolean;
  instrument?: ToolId;
  onScene: (scene: TourScene) => Promise<void>;
};
const nextFrame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', content?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
};
function equation(formula: string) {
  const node = el('div', 'tour-equation');
  katex.render(formula, node, {
    displayMode: true,
    throwOnError: false,
    strict: false,
    trust: false,
  });
  return node;
}
function visibleTarget(step: TourStep) {
  if (!step.target) return undefined;
  const found = [...document.querySelectorAll(TOUR_TARGETS[step.target])].find(
    (node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0,
  );
  // The compact header hides provenance; anchor its contextual lesson to the dataset instead.
  return (
    found ??
    (step.target === 'provenance'
      ? (document.querySelector('.masthead .dataset-button') ?? undefined)
      : undefined)
  );
}
// Driver keeps the bubble stagePadding + popoverOffset from the target; 12 px keeps it off the edge.
const STAGE_PADDING = 7,
  POPOVER_OFFSET = 16,
  GAP = STAGE_PADDING + POPOVER_OFFSET + 12,
  MIN_BUBBLE = 260;
type Placement = {
  target: Element;
  side: Side;
  docked: boolean;
  maxHeight: number;
  width?: number;
};
const compact = () => window.innerWidth <= 700;
// The bottom sheet, and the band reserved beneath targets that cannot share their row.
const sheetHeight = () =>
  Math.min(window.innerHeight - 24, Math.max(MIN_BUBBLE, window.innerHeight * 0.44));
function besideRoom(r: DOMRect): Side | undefined {
  const need = 300 + GAP;
  if (compact()) return undefined;
  return window.innerWidth - r.right >= need ? 'right' : r.left >= need ? 'left' : undefined;
}
function reveal(target: Element) {
  const r = target.getBoundingClientRect();
  if (besideRoom(r)) {
    target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    return () => {};
  }
  // Scroll margins apply only during this call: they lift the target above the narration band.
  const style = (target as HTMLElement).style,
    reserve = sheetHeight() + GAP,
    saved = [style.scrollMarginTop, style.scrollMarginBottom];
  let restore = () => {};
  let visibleHeight = window.innerHeight;
  // A final plot in a panel needs real scroll range, not only scroll-margin.
  // Reserve room only inside its existing scroller, and remove it on the next step or pause.
  for (
    let parent = target.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    if (
      /auto|scroll/.test(getComputedStyle(parent).overflowY) &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      visibleHeight = Math.min(visibleHeight, parent.clientHeight);
      const required = Math.max(0, r.top - parent.getBoundingClientRect().top - 12);
      const remaining = parent.scrollHeight - parent.clientHeight - parent.scrollTop;
      if (remaining < required + reserve) {
        const element = parent,
          previous = element.style.paddingBottom;
        element.style.paddingBottom =
          parseFloat(getComputedStyle(element).paddingBottom) + reserve + 'px';
        restore = () => {
          element.style.paddingBottom = previous;
        };
      }
      break;
    }
  }
  style.scrollMarginTop = '12px';
  style.scrollMarginBottom = reserve + 'px';
  target.scrollIntoView({
    behavior: 'instant',
    block: r.height + reserve + 12 <= visibleHeight ? 'center' : 'start',
    inline: 'nearest',
  });
  [style.scrollMarginTop, style.scrollMarginBottom] = saved;
  return restore;
}
function place(target: Element): Placement {
  const r = target.getBoundingClientRect(),
    viewport = window.innerHeight,
    beside = besideRoom(r);
  if (beside)
    return {
      target,
      side: beside,
      docked: false,
      maxHeight: viewport - 24,
      width: Math.min(380, (beside === 'right' ? window.innerWidth - r.right : r.left) - GAP),
    };
  // Large illustrations keep most of the screen; the narration scrolls inside a bounded bubble.
  const cap = compact() || r.height > viewport * 0.35 ? sheetHeight() : viewport - 24,
    below = viewport - r.bottom - GAP,
    above = r.top - GAP,
    // Phones dock at the bottom unless the target could not be lifted out of the sheet's band.
    underSheet = r.top > viewport - sheetHeight() - GAP;
  if ((!compact() || underSheet) && Math.max(below, above) >= MIN_BUBBLE) {
    const side = below >= MIN_BUBBLE ? 'bottom' : 'top',
      room = side === 'top' ? above : below;
    return { target, side, docked: false, maxHeight: Math.min(cap, room) };
  }
  return { target, side: 'bottom', docked: true, maxHeight: sheetHeight() };
}
function applyPlacement(wrapper: HTMLElement, p: Placement | null) {
  wrapper.classList.toggle('tour-docked', !!p?.docked);
  if (p) wrapper.style.setProperty('--tour-max-height', Math.floor(p.maxHeight) + 'px');
  else wrapper.style.removeProperty('--tour-max-height');
  if (p?.width) wrapper.style.setProperty('--tour-width', p.width + 'px');
  else wrapper.style.removeProperty('--tour-width');
}
export function GuidedTour(props: Props) {
  const [documents, setDocuments] = useState<TourDocument[]>([]),
    [loadError, setLoadError] = useState(''),
    [retry, setRetry] = useState(0);
  const [custom, setCustom] = useState<TourDocument | null>(() => {
    try {
      const value = localStorage.getItem('semantic-custom-tour');
      return value ? parseTour(JSON.parse(value)) : null;
    } catch {
      return null;
    }
  });
  const [choice, setChoice] = useState('default'),
    [menu, setMenu] = useState(false),
    [active, setActive] = useState(false),
    [preparing, setPreparing] = useState(''),
    [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0),
    [allDetail, setAllDetail] = useState(true);
  const upload = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    instance = useRef<Driver | null>(null);
  const session = useRef<{
    tour: ResolvedTour;
    datasetId: string;
    facts: Record<string, string>;
    index: number;
    token: number;
    running: boolean;
  } | null>(null);
  const ticket = useRef(0),
    transitioning = useRef(false),
    latest = useRef(props),
    expanded = useRef(new Set<string>()),
    detailPreference = useRef(allDetail),
    placement = useRef<Placement | null>(null),
    restoreTourSpace = useRef<() => void>(() => {});
  latest.current = props;
  detailPreference.current = allDetail;
  const goRef = useRef<(index: number) => void>(() => {}),
    pauseRef = useRef<() => void>(() => {});
  const base = documents.find((d) => d.id === 'default');
  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    Promise.all(
      ['default', 'weapons'].map(async (name) => {
        const response = await fetch('./tours/' + name + '.json');
        if (!response.ok) throw new Error('Could not open the bundled tour JSON.');
        return parseTour(await response.json());
      }),
    )
      .then((docs) => {
        if (!cancelled) {
          docs.forEach((d) => resolveTour(d, docs[0]));
          setDocuments(docs);
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  const catalog = useMemo(() => {
    if (!base || !props.dataset) return [];
    return [...documents, ...(custom ? [custom] : [])]
      .filter((d) => !d.datasetIds || d.datasetIds.includes(props.dataset!.manifest.id))
      .map((d) => ({
        document: d,
        tour: availableTour(resolveTour(d, base), props.dataset!.manifest, props.instrument),
      }))
      .filter((x) => x.tour.steps.length);
  }, [documents, base, custom, props.dataset, props.instrument]);
  const chosen = catalog.find((c) => c.document.id === choice) ?? catalog[0];
  const progress = useMemo(
    () =>
      chosen && props.dataset ? readTourProgress(chosen.tour, props.dataset.manifest.id) : null,
    [chosen, props.dataset, revision],
  );
  const save = useCallback((completed = false) => {
    const s = session.current;
    if (!s) return;
    try {
      localStorage.setItem(
        tourProgressKey(s.tour, s.datasetId),
        JSON.stringify({
          stepId: s.tour.steps[s.index].id,
          completed,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      setNotice('This browser could not save the tour position. You can still use every chapter.');
    }
    setRevision((v) => v + 1);
  }, []);
  const pause = useCallback(() => {
    const s = session.current;
    if (s?.running) save();
    if (s) s.running = false;
    ticket.current++;
    transitioning.current = false;
    instance.current?.destroy();
    instance.current = null;
    placement.current = null;
    restoreTourSpace.current();
    restoreTourSpace.current = () => {};
    delete document.body.dataset.tourTarget;
    document.body.classList.remove('semantic-tour-running');
    setActive(false);
    setPreparing('');
  }, [save]);
  pauseRef.current = pause;
  useEffect(() => {
    pause();
    setNotice('');
    const id = props.dataset?.manifest.id;
    let saved: string | null = null;
    try {
      saved = id ? localStorage.getItem('semantic-tour-choice:' + id) : null;
    } catch {
      /* Storage is optional. */
    }
    setChoice(
      saved ??
        (id && ['weapons-collection', 'weapons-paired'].includes(id) ? 'weapons' : 'default'),
    );
  }, [props.dataset?.manifest.id, pause]);
  useEffect(() => {
    const modal = () => {
      if (session.current?.running) {
        pause();
        setNotice('Tour paused. Close the window and resume when you are ready.');
      }
    };
    const key = (e: KeyboardEvent) => {
      if (!session.current?.running || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        pause();
        trigger.current?.focus();
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.closest('input,select,textarea,[contenteditable="true"]') ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey
      )
        return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) goRef.current(session.current.index + (e.key === 'ArrowRight' ? 1 : -1));
      }
    };
    const refresh = () => instance.current?.refresh();
    // Re-choose the side after rotation or resizing; the driver refreshes from its active step.
    const resize = () => {
      const d = instance.current,
        target = placement.current?.target;
      if (!d || !target?.isConnected) return;
      placement.current = place(target);
      const step = d.getActiveStep();
      if (step?.popover) step.popover.side = placement.current.side;
      const dom = d.getState('popover') as PopoverDOM | undefined;
      if (dom) applyPlacement(dom.wrapper, placement.current);
      d.refresh();
    };
    const open = () => {
      pause();
      setMenu(true);
    };
    window.addEventListener('semantic:open-tour', open);
    window.addEventListener('semantic:modal-open', modal);
    window.addEventListener('semantic:pause-tour', modal);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', resize);
    // The driver listens to window scroll; nested instrument panes need their own refresh.
    document.addEventListener('scroll', refresh, true);
    return () => {
      ticket.current++;
      if (session.current) session.current.running = false;
      instance.current?.destroy();
      instance.current = null;
      document.body.classList.remove('semantic-tour-running');
      window.removeEventListener('semantic:open-tour', open);
      window.removeEventListener('semantic:modal-open', modal);
      window.removeEventListener('semantic:pause-tour', modal);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', resize);
      document.removeEventListener('scroll', refresh, true);
    };
  }, [pause]);
  function renderBubble(popover: PopoverDOM, index: number) {
    const s = session.current;
    if (!s) return;
    const step = s.tour.steps[index],
      chapter = s.tour.chapters.find((c) => c.id === step.chapter)!;
    const t = (v: string) => interpolateTour(v, s.facts);
    popover.wrapper.dataset.tourStep = step.id;
    applyPlacement(popover.wrapper, placement.current);
    popover.wrapper.setAttribute('aria-label', t(step.title));
    popover.title.textContent = t(step.title);
    popover.title.tabIndex = -1;
    popover.description.replaceChildren();
    popover.description.style.display = 'block';
    const head = el('div', 'tour-bubble-heading');
    const chapters = el('button', 'tour-chapter-button', chapter.title + ' ▾');
    chapters.type = 'button';
    chapters.setAttribute('aria-label', 'Open tour chapters');
    chapters.onclick = () => {
      pause();
      setMenu(true);
    };
    const number = el('span', 'tour-step-number', `${index + 1} / ${s.tour.steps.length}`);
    head.append(chapters, number);
    popover.wrapper.prepend(head);
    const meter = el('div', 'tour-progress-track');
    const fill = el('i');
    fill.style.width = ((index + 1) / s.tour.steps.length) * 100 + '%';
    meter.append(fill);
    head.after(meter);
    for (const paragraph of step.body) popover.description.append(el('p', '', t(paragraph)));
    if (step.formula) popover.description.append(equation(step.formula));
    if (step.detail) {
      const details = el('details', 'tour-depth'),
        summary = el('summary', '', step.detail.title);
      details.open = expanded.current.has(step.id) || detailPreference.current;
      details.append(summary);
      for (const paragraph of step.detail.body) details.append(el('p', '', t(paragraph)));
      if (step.detail.formula) details.append(equation(step.detail.formula));
      details.ontoggle = () => {
        if (details.open) expanded.current.add(step.id);
        else expanded.current.delete(step.id);
        instance.current?.refresh();
      };
      popover.description.append(details);
    }
    if (step.try) {
      const activity = el('div', 'tour-try');
      activity.append(el('span', '', 'Explore'), el('p', '', t(step.try)));
      popover.description.append(activity);
    }
    const pauseButton = el('button', 'tour-pause', 'Pause tour');
    pauseButton.type = 'button';
    pauseButton.onclick = () => {
      pause();
      trigger.current?.focus();
    };
    popover.footer.prepend(pauseButton);
    popover.closeButton.setAttribute('aria-label', 'Pause guided tour');
    popover.closeButton.title = 'Pause · Escape';
    popover.nextButton.textContent = index === s.tour.steps.length - 1 ? 'Finish tour' : 'Next →';
    popover.previousButton.textContent = '← Back';
    popover.previousButton.setAttribute('aria-label', 'Previous tour step');
    popover.nextButton.setAttribute(
      'aria-label',
      index === s.tour.steps.length - 1 ? 'Finish tour' : 'Next tour step',
    );
    popover.description.scrollTop = 0;
    requestAnimationFrame(() => popover.title.focus({ preventScroll: true }));
  }
  const finish = () => {
    save(true);
    if (session.current) session.current.running = false;
    pause();
    setNotice('Tour complete. Revisit any chapter or keep exploring.');
    setMenu(true);
  };
  const go = async (index: number) => {
    const s = session.current;
    if (!s?.running || transitioning.current || index < 0) return;
    if (index >= s.tour.steps.length) {
      finish();
      return;
    }
    transitioning.current = true;
    const token = ++ticket.current;
    const cancelled = () =>
      ticket.current !== token || !s.running || latest.current.dataset?.manifest.id !== s.datasetId;
    const step = s.tour.steps[index];
    setPreparing('Opening ' + step.title + '…');
    // Disable navigation immediately to make rapid clicks and slow computations predictable.
    const buttons = instance.current?.getState().popover as PopoverDOM | undefined;
    if (buttons) {
      buttons.nextButton.disabled = true;
      buttons.previousButton.disabled = true;
    }
    try {
      while (latest.current.busy && !cancelled())
        await new Promise((resolve) => setTimeout(resolve, 80));
      if (cancelled()) return;
      restoreTourSpace.current();
      restoreTourSpace.current = () => {};
      document.body.dataset.tourTarget = step.target ?? '';
      await latest.current.onScene(step.scene);
      if (cancelled()) return;
      let target = visibleTarget(step);
      const deadline = Date.now() + 10000;
      while (step.target && !target && Date.now() < deadline && !cancelled()) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        target = visibleTarget(step);
      }
      if (cancelled()) return;
      if (step.target && !target)
        throw new Error(
          'This view is not available for “' +
            step.title +
            '”. Your place is saved; choose another chapter or retry.',
        );
      if (target) {
        restoreTourSpace.current = reveal(target);
        await nextFrame();
      }
      if (cancelled()) return;
      s.index = index;
      const d = instance.current!;
      const entries = d.getConfig().steps!;
      entries[index].element = target;
      placement.current = target ? place(target) : null;
      entries[index].popover!.side = placement.current?.side ?? 'right';
      d.drive(index);
      save();
    } catch (error) {
      pause();
      setNotice(error instanceof Error ? error.message : String(error));
      setMenu(true);
    } finally {
      if (ticket.current === token) {
        transitioning.current = false;
        setPreparing('');
      }
    }
  };
  goRef.current = go;
  const start = async (index: number) => {
    if (!chosen || !props.dataset || props.busy) return;
    pause();
    setMenu(false);
    setNotice('');
    const startTicket = ++ticket.current;
    // Let the native dialog close before the spotlight acquires focus.
    await nextFrame();
    if (
      ticket.current !== startTicket ||
      latest.current.dataset?.manifest.id !== props.dataset.manifest.id
    )
      return;
    const tour = chosen.tour;
    try {
      localStorage.setItem('semantic-tour-choice:' + props.dataset.manifest.id, chosen.document.id);
    } catch {
      /* The running tour remains usable. */
    }
    session.current = {
      tour,
      datasetId: props.dataset.manifest.id,
      facts: tourFacts(props.dataset.manifest),
      index,
      token: ticket.current,
      running: true,
    };
    instance.current = driver({
      animate: false,
      smoothScroll: false,
      overlayColor: '#25334d',
      overlayOpacity: 0.22,
      stagePadding: STAGE_PADDING,
      stageRadius: 10,
      popoverOffset: POPOVER_OFFSET,
      allowKeyboardControl: false,
      allowClose: true,
      overlayClickBehavior: () => {},
      popoverClass: 'semantic-tour',
      showProgress: false,
      steps: tour.steps.map((step) => ({
        popover: { title: step.title, description: '', side: 'right', align: 'center' },
        data: { id: step.id },
      })),
      onPopoverRender: (popover, opts) =>
        renderBubble(popover, opts.index ?? session.current?.index ?? 0),
      onNextClick: () => goRef.current((session.current?.index ?? 0) + 1),
      onPrevClick: () => goRef.current((session.current?.index ?? 0) - 1),
      onCloseClick: () => pauseRef.current(),
      onDoneClick: finish,
    });
    document.body.classList.add('semantic-tour-running');
    setActive(true);
    await go(index);
  };
  const choose = (id: string) => {
    setChoice(id);
    try {
      if (props.dataset)
        localStorage.setItem('semantic-tour-choice:' + props.dataset.manifest.id, id);
    } catch {
      /* Narration remains available for the session. */
    }
  };
  const loadCustom = async (file: File) => {
    try {
      if (file.size > 500000) throw new Error('Tour JSON must be smaller than 500 KB.');
      const doc = parseTour(JSON.parse(await file.text()));
      if (['default', 'weapons'].includes(doc.id)) doc.id = 'custom-' + doc.id;
      const resolved = resolveTour(doc, base);
      if (
        props.dataset &&
        !availableTour(resolved, props.dataset.manifest, props.instrument).steps.length
      )
        throw new Error('This tour has no steps available for the loaded dataset and instrument.');
      if (doc.datasetIds && props.dataset && !doc.datasetIds.includes(props.dataset.manifest.id))
        throw new Error(
          'This tour targets another dataset. Load that dataset first, or change datasetIds in the JSON.',
        );
      setCustom(doc);
      choose(doc.id);
      setNotice('Custom tour loaded.');
      try {
        localStorage.setItem('semantic-custom-tour', JSON.stringify(doc));
      } catch {
        setNotice('Custom tour loaded for this session; browser storage is unavailable.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  // Small read-only state hook for deterministic browser checks and embedded consumers.
  useEffect(() => {
    (window as any).__tour = {
      active,
      step: session.current?.tour.steps[session.current.index]?.id ?? null,
      count: session.current?.tour.steps.length ?? chosen?.tour.steps.length ?? 0,
      variant: chosen?.tour.id,
      preparing,
    };
  }, [active, preparing, chosen, revision]);
  const resumeIndex = chosen?.tour.steps.findIndex((s) => s.id === progress?.stepId) ?? 0;
  return (
    <>
      <button
        ref={trigger}
        className={
          'toolbar-button tour-trigger ' + (progress && !progress.completed ? 'has-progress' : '')
        }
        aria-label="Guided tour"
        disabled={!props.dataset || props.busy}
        onClick={() => {
          pause();
          setMenu(true);
        }}
      >
        <Compass size={16} />
        <span>{progress && !progress.completed ? 'Resume tour' : 'Guided tour'}</span>
      </button>
      {active && preparing && (
        <div className="tour-opening" role="status">
          <i className="tour-spinner" />
          {preparing}
          <button onClick={pause}>Pause</button>
        </div>
      )}
      {menu &&
        createPortal(
          <Modal
            title="A guided way through."
            onClose={() => setMenu(false)}
            wide
            className="tour-menu"
          >
            {notice && (
              <p className="tour-notice" role="status">
                {notice}
              </p>
            )}
            {loadError ? (
              <div role="alert">
                <p>{loadError}</p>
                <button className="secondary" onClick={() => setRetry((x) => x + 1)}>
                  Retry loading tours
                </button>
              </div>
            ) : !chosen ? (
              <p role="status">Opening the tour library…</p>
            ) : (
              <>
                <div className="tour-menu-intro">
                  <div>
                    <span className="eyebrow">OPTIONAL · INTERACTIVE · SELF-PACED</span>
                    <h3>{chosen.tour.title}</h3>
                    <p>{chosen.tour.description}</p>
                  </div>
                  <label className="tour-variant">
                    Narration
                    <select
                      aria-label="Tour narration"
                      value={chosen.document.id}
                      onChange={(e) => {
                        choose(e.target.value);
                        setNotice('');
                      }}
                    >
                      {catalog.map((c) => (
                        <option key={c.document.id} value={c.document.id}>
                          {c.document.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="tour-menu-actions">
                  <button
                    className="primary"
                    disabled={props.busy}
                    onClick={() =>
                      start(progress && !progress.completed ? Math.max(0, resumeIndex) : 0)
                    }
                  >
                    <Play size={15} />
                    {progress && !progress.completed
                      ? 'Resume at step ' + (resumeIndex + 1)
                      : 'Start the full tour'}
                  </button>
                  {progress && (
                    <button className="secondary" disabled={props.busy} onClick={() => start(0)}>
                      <RotateCcw size={14} />
                      Start again
                    </button>
                  )}
                  <span>
                    {chosen.tour.steps.length} explanations · {chosen.tour.chapters.length} chapters
                  </span>
                </div>
                <p className="tour-menu-hint">
                  Use the arrows to follow the story, or choose a chapter. Controls remain live.
                  Opening a window pauses the tour; your place is saved in this browser.
                </p>
                <div className="tour-chapter-grid">
                  {chosen.tour.chapters.map((chapter, i) => {
                    const at = chosen.tour.steps.findIndex((s) => s.chapter === chapter.id),
                      count = chosen.tour.steps.filter((s) => s.chapter === chapter.id).length;
                    return (
                      <button
                        key={chapter.id}
                        className="tour-chapter-card"
                        disabled={props.busy}
                        onClick={() => start(at)}
                      >
                        <span className="tour-chapter-index">{String(i + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>{chapter.title}</strong>
                          <p>{chapter.description}</p>
                          <small>
                            {count} explanations
                            {!progress?.completed &&
                            progress?.stepId &&
                            at <= resumeIndex &&
                            resumeIndex < at + count
                              ? ' · resume here'
                              : ''}
                          </small>
                        </div>
                        <ArrowRight size={18} />
                      </button>
                    );
                  })}
                </div>
                <details className="tour-authoring">
                  <summary>Customize the narration</summary>
                  <p>
                    Tours are editable JSON: prose, equations, chapters and named views. A
                    specialized tour can extend the default and replace its explanations. Load your
                    own file here; it stays in this browser.
                  </p>
                  <div>
                    <button
                      className="secondary"
                      onClick={() =>
                        download(
                          chosen.document.id + '-tour.json',
                          JSON.stringify(resolveTour(chosen.document, base), null, 2),
                          'application/json',
                        )
                      }
                    >
                      <Download size={14} />
                      Download this tour JSON
                    </button>
                    <button className="secondary" onClick={() => upload.current?.click()}>
                      <Upload size={14} />
                      Load tour JSON
                    </button>
                    <a href="./tours/README.md" target="_blank" rel="noreferrer">
                      Tour format guide ↗
                    </a>
                  </div>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={allDetail}
                      onChange={(e) => setAllDetail(e.target.checked)}
                    />
                    Open mathematical details by default
                  </label>
                </details>
              </>
            )}
            <input
              ref={upload}
              type="file"
              accept=".json"
              hidden
              aria-label="Import tour JSON"
              onChange={(e) => {
                if (e.target.files?.[0]) loadCustom(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </Modal>,
          document.body,
        )}
    </>
  );
}
