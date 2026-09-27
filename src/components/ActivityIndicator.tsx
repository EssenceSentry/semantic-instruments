import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useActivity } from '../core/activity';
export function ActivityIndicator({
  busy,
  status,
  progress,
  inline = false,
}: {
  busy: boolean;
  status: string;
  progress?: number;
  inline?: boolean;
}) {
  const jobs = useActivity(),
    [elapsed, setElapsed] = useState(0);
  const active = busy || jobs.length > 0;
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const start = performance.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((performance.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [active]);
  if (!active) return null;
  const job = jobs[0],
    label = busy ? status : job?.label,
    fraction = progress ?? job?.fraction;
  return (
    <div
      className={'activity-indicator ' + (busy ? 'blocking' : '') + (inline ? ' inline' : '')}
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="spin" size={18} />
      <div>
        <strong>{label}</strong>
        <span>
          {elapsed > 0 ? elapsed + 's elapsed' : 'Working locally'}
          {jobs.length > 1 ? ' · ' + jobs.length + ' calculations queued' : ''}
        </span>
        <progress aria-label="Computation progress" max={1} value={fraction} />
      </div>
      {fraction != null && <b>{Math.round(fraction * 100)}%</b>}
    </div>
  );
}
