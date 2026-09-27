import { useLayoutEffect, useState, type RefObject } from 'react';

export function RankConnections({
  root,
  revision,
}: {
  root: RefObject<HTMLDivElement | null>;
  revision: string;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const measure = () => {
      const box = host.getBoundingClientRect();
      const rows = [...host.querySelectorAll('.rank-row.selected')].map((e) =>
        e.getBoundingClientRect(),
      );
      setPaths(
        rows.slice(1).map((r, i) => {
          const a = rows[i],
            x1 = a.right - box.left,
            y1 = a.top + a.height / 2 - box.top,
            x2 = r.left - box.left,
            y2 = r.top + r.height / 2 - box.top;
          return `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [root, revision]);
  return (
    <svg className="rank-connections" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#6b91dc" strokeWidth="1.6" />
      ))}
    </svg>
  );
}
