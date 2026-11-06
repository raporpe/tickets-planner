import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Smooth 60/120fps cursor-anchored zoom for whiteboard scroll containers.
 * - Trackpad two-finger swipe pans natively.
 * - Trackpad pinch (ctrlKey) and physical mouse wheel glide smoothly toward target zoom.
 */
export function useSmoothBoardZoom(boardRef, depKey) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const targetRef = useRef(1);
  const rafRef = useRef(0);

  const resetZoom = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    zoomRef.current = 1;
    targetRef.current = 1;
    setZoom(1);
  }, []);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    let trackpadPanUntil = 0;
    let lastTime = 0;
    let rate = 0.018;
    const anchor = { vx: 0, vy: 0, wx: 0, wy: 0, clientX: -1, clientY: -1 };

    const step = (now) => {
      const dt = lastTime ? Math.min(48, Math.max(4, now - lastTime)) : 16;
      lastTime = now;
      const curZ = zoomRef.current;
      const targetZ = targetRef.current;
      const diff = targetZ - curZ;

      if (Math.abs(diff) < 0.0007) {
        zoomRef.current = targetZ;
        setZoom(targetZ);
        el.scrollLeft = Math.max(0, anchor.wx * targetZ - anchor.vx);
        el.scrollTop = Math.max(0, anchor.wy * targetZ - anchor.vy);
        rafRef.current = 0;
        lastTime = 0;
        return;
      }

      const alpha = 1 - Math.exp(-dt * rate);
      const nextZ = curZ + diff * alpha;
      zoomRef.current = nextZ;
      setZoom(nextZ);
      el.scrollLeft = Math.max(0, anchor.wx * nextZ - anchor.vx);
      el.scrollTop = Math.max(0, anchor.wy * nextZ - anchor.vy);
      rafRef.current = requestAnimationFrame(step);
    };

    const onWheel = (e) => {
      const now = performance.now();
      const isPinch = e.ctrlKey || e.metaKey;
      if (!isPinch) {
        const looksLikeTrackpad =
          Math.abs(e.deltaX) > 0 ||
          (e.deltaMode === 0 && Math.abs(e.deltaY) < 50) ||
          (typeof e.wheelDeltaY === 'number' && Math.abs(e.wheelDeltaY) % 120 !== 0);
        if (looksLikeTrackpad || now < trackpadPanUntil) {
          trackpadPanUntil = now + 220;
          return;
        }
      }
      e.preventDefault();

      const r = el.getBoundingClientRect();
      const vx = e.clientX - r.left;
      const vy = e.clientY - r.top;
      const curZ = zoomRef.current;

      if (!rafRef.current || Math.hypot(e.clientX - anchor.clientX, e.clientY - anchor.clientY) > 2) {
        anchor.vx = vx;
        anchor.vy = vy;
        anchor.wx = (el.scrollLeft + vx) / curZ;
        anchor.wy = (el.scrollTop + vy) / curZ;
        anchor.clientX = e.clientX;
        anchor.clientY = e.clientY;
      }

      rate = isPinch ? 0.032 : 0.016;
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      const clampedDelta = Math.max(-140, Math.min(140, rawDelta));
      const factor = isPinch ? Math.exp(-e.deltaY * 0.0075) : Math.exp(-clampedDelta * 0.00042);
      const nextTarget = clampZoom(targetRef.current * factor);
      if (nextTarget === targetRef.current && !rafRef.current) return;
      targetRef.current = nextTarget;

      if (!rafRef.current) {
        lastTime = performance.now();
        rafRef.current = requestAnimationFrame(step);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      el.removeEventListener('wheel', onWheel);
    };
  }, [boardRef, depKey]);

  return { zoom, zoomRef, resetZoom };
}
