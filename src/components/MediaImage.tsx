import { useEffect, useState } from 'react';
import { ImageOff, LoaderCircle, RotateCcw } from 'lucide-react';
import { mediaSource } from '../core/media';
export function MediaImage({
  src,
  alt,
  onLoad,
  onError,
  retry = 0,
  fallback,
}: {
  src: string;
  alt: string;
  onLoad?: () => void;
  onError?: () => void;
  retry?: number;
  fallback?: string;
}) {
  const [state, setState] = useState<{
    source: string;
    url?: string;
    error?: boolean;
    ready?: boolean;
  }>({
    source: src,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ source: src });
    mediaSource(src, !!(attempt || retry))
      .then((url) => {
        if (live) setState({ source: src, url });
      })
      .catch(() => {
        if (live) {
          setState({ source: src, error: true });
          onError?.();
        }
      });
    return () => {
      live = false;
    };
  }, [src, attempt, retry]);
  if (state.source !== src || (!state.url && !state.error))
    return (
      <span className="media-state" role="status">
        <LoaderCircle className="spin" size={18} />
        <span>Loading preview</span>
      </span>
    );
  if (state.error)
    return (
      <span className="media-state failed">
        <ImageOff size={19} />
        <span>Preview failed to load</span>
        <span
          role="button"
          tabIndex={0}
          aria-label={'Retry preview: ' + alt}
          onClick={(e) => {
            e.stopPropagation();
            setAttempt((x) => x + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setAttempt((x) => x + 1);
            }
          }}
        >
          <RotateCcw size={12} /> Retry
        </span>
      </span>
    );
  return (
    <>
      <img
        src={state.url}
        alt={alt}
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ opacity: state.ready ? 1 : 0 }}
        onLoad={() => {
          setState((s) => ({ ...s, ready: true }));
          onLoad?.();
        }}
        onError={() => {
          if (fallback && state.url !== fallback) {
            setState({ source: src, url: fallback });
            return;
          }
          setState({ source: src, error: true });
          onError?.();
        }}
      />
      {!state.ready && (
        <span className="media-state" role="status">
          <LoaderCircle className="spin" size={18} />
          <span>Loading preview</span>
        </span>
      )}
    </>
  );
}
