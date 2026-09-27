import { frameState, registerRenderer } from '../core/scene-runtime';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Matrix, Item } from '../core/types';
import { clamp, quantile } from '../core/math';

interface Props {
  scoreKey?: string;
  scoreRange?: [number, number];
  scoreName?: string;
  positions: Matrix;
  items: Item[];
  selected: number[];
  pinned: number[];
  onSelect: (indices: number[]) => void;
  colorBy: string;
  rotate?: boolean;
  label?: string;
  ghost?: Matrix | null;
  pointSize?: number;
  reference?: Matrix;
  diagonal?: boolean;
  positiveName?: string;
  negativeName?: string;
}
export function PointCloud(props: Props) {
  const mount = useRef<HTMLDivElement>(null),
    live = useRef(props),
    api = useRef<{ update: (p: Props) => void; snapshot: () => string } | null>(null);
  live.current = props;
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null),
    [brush, setBrush] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const container = mount.current!;
    let width = container.clientWidth,
      height = container.clientHeight;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0, 0);
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    camera.position.z = 5;
    let n = props.items.length,
      geometry = new THREE.BufferGeometry(),
      coordinates = new Float32Array(n * 3),
      from = new Float32Array(n * 3),
      target = new Float32Array(n * 3),
      colors = new Float32Array(n * 3),
      sizes = new Float32Array(n),
      alpha = new Float32Array(n),
      start = 0,
      rotation = 0,
      zoom = 1,
      panX = 0,
      panY = 0,
      frame = 0,
      dragging = false;
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aAlpha;varying vec3 vColor;varying float vAlpha;uniform float pixelRatio;void main(){vColor=aColor;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*pixelRatio;}`,
      fragmentShader: `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-vec2(.5));float a=1.-smoothstep(.32,.50,d);if(a<.01)discard;gl_FragColor=vec4(vColor,vAlpha*a);}`,
      uniforms: { pixelRatio: { value: Math.min(devicePixelRatio, 2) } },
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    const boundaryGeometry = new THREE.BufferGeometry(),
      boundaryMaterial = new THREE.LineBasicMaterial({
        color: 0x7890b4,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      }),
      boundary = new THREE.Line(boundaryGeometry, boundaryMaterial);
    scene.add(boundary);
    const warm = new THREE.Color('#b54d36'),
      teal = new THREE.Color('#267570'),
      gray = new THREE.Color('#929591'),
      gold = new THREE.Color('#e6a72a');
    function coords(matrix: Matrix, reference?: Matrix) {
      const out = new Float32Array(n * 3),
        xs: number[] = [],
        ys: number[] = [];
      for (let i = 0; i < n; i++) {
        xs.push(matrix.data[i * matrix.cols]);
        ys.push(matrix.cols > 1 ? matrix.data[i * matrix.cols + 1] : 0);
      }
      const rx = reference
          ? Array.from({ length: n }, (_, i) => reference.data[i * reference.cols])
          : xs,
        ry = reference
          ? Array.from({ length: n }, (_, i) =>
              reference.cols > 1 ? reference.data[i * reference.cols + 1] : 0,
            )
          : ys;
      const xlo = quantile(rx, 0),
        xhi = quantile(rx, 1),
        ylo = quantile(ry, 0),
        yhi = quantile(ry, 1),
        cx = (xlo + xhi) / 2,
        cy = (ylo + yhi) / 2;
      const lo = Math.min(xlo, ylo),
        hi = Math.max(xhi, yhi),
        mx = live.current.diagonal ? (lo + hi) / 2 : cx,
        my = live.current.diagonal ? (lo + hi) / 2 : cy,
        sx = Math.max(1e-8, live.current.diagonal ? hi - lo : xhi - xlo),
        sy = Math.max(1e-8, live.current.diagonal ? hi - lo : yhi - ylo),
        scale = Math.min((width * 0.86) / sx, (height * 0.72) / sy);
      for (let i = 0; i < n; i++) {
        out[i * 3] = (((xs[i] - mx) * scale) / width) * 2;
        out[i * 3 + 1] = (((ys[i] - my) * scale) / height) * 2;
        out[i * 3 + 2] =
          (((matrix.cols > 2 ? matrix.data[i * matrix.cols + 2] : 0) * scale) / width) * 2;
      }
      boundary.visible = !!live.current.diagonal;
      boundaryGeometry.setFromPoints([
        new THREE.Vector3((((lo - mx) * scale) / width) * 2, (((lo - my) * scale) / height) * 2, 0),
        new THREE.Vector3((((hi - mx) * scale) / width) * 2, (((hi - my) * scale) / height) * 2, 0),
      ]);
      return out;
    }
    let viewVersion = 0,
      drawnVersion = -1,
      drawnFrame = -1;
    function update(p: Props) {
      viewVersion++;
      if (p.items.length !== n) return;
      if (!p.rotate) rotation = 0;
      from = coordinates.slice();
      target = coords(p.positions, p.reference);
      start = performance.now();
      const selected = new Set(p.selected),
        pinned = new Set(p.pinned);
      p.items.forEach((item, i) => {
        let c = item.label === 1 ? warm : item.label === 0 ? teal : gray;
        if (p.colorBy === 'score') {
          const score = item.scores?.[p.scoreKey ?? 'model'];
          const [lo, hi] = p.scoreRange ?? [0, 1];
          c =
            score == null
              ? gray
              : teal.clone().lerp(warm, clamp((score - lo) / Math.max(1e-12, hi - lo)));
        }
        if (p.colorBy === 'outcome') {
          const pred = (item.scores?.model ?? 0) >= 0.5;
          c = item.label == null ? gray : pred === (item.label === 1) ? teal : warm;
        }
        if (p.colorBy === 'split') c = item.split === 'holdout' ? warm : gray;
        if (pinned.has(i)) c = gold;
        // This minimal shader writes display RGB directly (no Three.js color-space chunk).
        const display = c.clone().convertLinearToSRGB();
        colors[i * 3] = display.r;
        colors[i * 3 + 1] = display.g;
        colors[i * 3 + 2] = display.b;
        sizes[i] = selected.has(i) || pinned.has(i) ? 9 : (p.pointSize ?? (n > 6000 ? 3.7 : 5));
        alpha[i] = selected.size ? (selected.has(i) || pinned.has(i) ? 1 : 0.2) : 0.64;
      });
      geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    }
    update(props);
    coordinates.set(target);
    function screen(i: number) {
      const x = coordinates[i * 3],
        z = coordinates[i * 3 + 2],
        xx = x * Math.cos(rotation) + z * Math.sin(rotation);
      return {
        x: ((xx * zoom + panX) / 2 + 0.5) * width,
        y: (0.5 - (coordinates[i * 3 + 1] * zoom + panY) / 2) * height,
      };
    }
    function closest(x: number, y: number) {
      let index = -1,
        min = 110;
      for (let i = 0; i < n; i++) {
        const p = screen(i),
          d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < min) {
          min = d;
          index = i;
        }
      }
      return index;
    }
    let down: { x: number; y: number; shift: boolean; px: number; py: number } | null = null;
    const xy = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const p = xy(e);
      down = { ...p, shift: e.shiftKey, px: panX, py: panY };
      dragging = false;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const p = xy(e);
      if (down) {
        if (Math.hypot(p.x - down.x, p.y - down.y) > 4) dragging = true;
        if (down.shift)
          setBrush({
            x: Math.min(down.x, p.x),
            y: Math.min(down.y, p.y),
            w: Math.abs(p.x - down.x),
            h: Math.abs(p.y - down.y),
          });
        else if (dragging) {
          panX = down.px + ((p.x - down.x) / width) * 2;
          panY = down.py - ((p.y - down.y) / height) * 2;
        }
        setHover(null);
      } else {
        const index = closest(p.x, p.y);
        setHover(index >= 0 ? { index, ...p } : null);
        renderer.domElement.style.cursor = index >= 0 ? 'pointer' : 'grab';
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const p = xy(e);
      if (down.shift && dragging) {
        const x0 = Math.min(down.x, p.x),
          x1 = Math.max(down.x, p.x),
          y0 = Math.min(down.y, p.y),
          y1 = Math.max(down.y, p.y),
          found = [];
        for (let i = 0; i < n; i++) {
          const pt = screen(i);
          if (pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1) found.push(i);
        }
        live.current.onSelect(found);
      } else if (!dragging) {
        const i = closest(p.x, p.y);
        live.current.onSelect(i >= 0 ? [i] : []);
      }
      down = null;
      setBrush(null);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = clamp(zoom * Math.exp(-e.deltaY * 0.001), 0.5, 12);
    };
    const reset = () => {
      zoom = 1;
      panX = 0;
      panY = 0;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('wheel', wheel, { passive: false });
    renderer.domElement.addEventListener('dblclick', reset);
    const observer = new ResizeObserver(() => {
      width = container.clientWidth;
      height = container.clientHeight;
      renderer.setSize(width, height);
      from = coordinates.slice();
      target = coords(live.current.positions, live.current.reference);
      start = performance.now();
      viewVersion++;
    });
    observer.observe(container);
    function render(now: number) {
      frame = requestAnimationFrame(render);
      const clock = frameState();
      const t = clock.fixed ? 1 : clamp((now - start) / 1050),
        ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      for (let i = 0; i < coordinates.length; i++)
        coordinates[i] = from[i] + (target[i] - from[i]) * ease;
      geometry.attributes.position.needsUpdate = true;
      if (clock.fixed) {
        rotation = clock.camera.angle + (live.current.rotate ? clock.time * 0.15 : 0);
        zoom = clock.camera.zoom;
        panX = clock.camera.panX;
        panY = clock.camera.panY;
      } else if (live.current.rotate) rotation += 0.0025;
      points.rotation.y = rotation;
      points.scale.set(zoom, zoom, zoom);
      points.position.set(panX, panY, 0);
      boundary.scale.copy(points.scale);
      boundary.position.copy(points.position);
      renderer.render(scene, camera);
      drawnFrame = clock.revision;
      if (t === 1) drawnVersion = viewVersion;
    }
    const unregister = registerRenderer(
      () =>
        width > 0 &&
        height > 0 &&
        drawnVersion === viewVersion &&
        drawnFrame === frameState().revision,
    );
    frame = requestAnimationFrame(render);
    api.current = { update, snapshot: () => renderer.domElement.toDataURL() };
    return () => {
      unregister();
      cancelAnimationFrame(frame);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      boundaryGeometry.dispose();
      boundaryMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [props.items.length]);
  useEffect(() => {
    api.current?.update(props);
  }, [
    props.positions,
    props.selected,
    props.pinned,
    props.colorBy,
    props.scoreKey,
    props.scoreRange,
    props.pointSize,
    props.items,
    props.reference,
    props.rotate,
    props.diagonal,
  ]);
  const item = hover ? props.items[hover.index] : null;
  return (
    <div
      className="cloud"
      ref={mount}
      role="img"
      aria-label={props.label ?? 'Interactive representation of dataset records'}
    >
      <div className="cloud-grid" />
      {brush && (
        <div
          className="brush"
          style={{ left: brush.x, top: brush.y, width: brush.w, height: brush.h }}
        />
      )}
      {hover && item && (
        <div
          className="cloud-tooltip"
          style={{
            left: clamp(hover.x + 14, 8, (mount.current?.clientWidth ?? 800) - 210),
            top: clamp(hover.y - 15, 8, (mount.current?.clientHeight ?? 600) - 100),
          }}
        >
          <span className="eyebrow">
            {item.label === 1
              ? (props.positiveName ?? 'Positive')
              : item.label === 0
                ? (props.negativeName ?? 'Negative')
                : 'Unlabeled'}
          </span>
          <strong>{item.name ?? item.id}</strong>
          <small>
            {props.scoreName ?? 'Score'}{' '}
            {(item.scores?.[props.scoreKey ?? 'model'] ?? NaN).toFixed(3)}
          </small>
        </div>
      )}
    </div>
  );
}
