'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shader';
import styles from './Blob.module.css';

export type BlobPulse = 'hover' | 'select' | 'success' | 'error';

export interface BlobHandle {
  pulse(kind: BlobPulse): void;
}

const PULSES: Record<BlobPulse, { strength: number; color: [number, number, number] }> = {
  hover: { strength: 0.35, color: [0.55, 0.6, 1.0] },
  select: { strength: 0.8, color: [0.75, 0.45, 1.0] },
  success: { strength: 1.2, color: [0.37, 0.95, 0.69] },
  error: { strength: 1.0, color: [1.0, 0.42, 0.54] },
};

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render|software/i;

function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    return typeof name === 'string' && SOFTWARE_RENDERER.test(name);
  } catch {
    return false;
  }
}

export function Blob({ ref, className }: { ref?: Ref<BlobHandle>; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef({ value: 0, color: new THREE.Color(0.75, 0.45, 1.0) });
  const [fallback, setFallback] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      pulse(kind) {
        const p = PULSES[kind];
        pulseRef.current.value = Math.max(pulseRef.current.value, p.strength);
        pulseRef.current.color.setRGB(...p.color);
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    } catch {
      setFallback(true);
      return;
    }
    // Программный WebGL (SwiftShader, llvmpipe…) рендерит шейдер на CPU и забирает главный поток
    // настолько, что страница перестаёт успевать загружать данные — используем CSS-заглушку.
    if (isSoftwareRenderer(renderer)) {
      renderer.forceContextLoss();
      renderer.dispose();
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: 100 },
      uPulse: { value: 0 },
      uPulseColor: { value: new THREE.Color() },
      uMotion: { value: reduced ? 0 : 1 },
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false });
    scene.add(new THREE.Mesh(geometry, material));

    const base = new THREE.Vector2();
    const mouse = new THREE.Vector2();
    const target = new THREE.Vector2();
    let hasMouse = false;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w, h);
      base.set(w / 2, h / 2);
      uniforms.uRadius.value = Math.min(w, h) * 0.36;
      if (!hasMouse) {
        mouse.copy(base);
        uniforms.uCenter.value.copy(base);
        uniforms.uMouse.value.copy(base);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.set(e.clientX - rect.left, rect.height - (e.clientY - rect.top));
      hasMouse = true;
    };
    window.addEventListener('pointermove', onMove);

    let frame = 0;
    let running = false;
    let last = performance.now();
    const tick = (now: number) => {
      // Во скрытой вкладке цикл останавливается; возобновляется по visibilitychange
      if (document.hidden) {
        running = false;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      uniforms.uTime.value += dt;
      // Параллакс: центр капли слегка тянется к курсору
      target.copy(mouse).sub(base).multiplyScalar(reduced ? 0 : 0.04).add(base);
      uniforms.uCenter.value.lerp(target, 1 - Math.exp(-dt * 4));
      uniforms.uMouse.value.lerp(mouse, 1 - Math.exp(-dt * 8));
      pulseRef.current.value *= Math.exp(-dt * 2.5);
      uniforms.uPulse.value = pulseRef.current.value;
      uniforms.uPulseColor.value.copy(pulseRef.current.color);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || document.hidden) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        running = false;
      } else {
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    start();

    return () => {
      cancelAnimationFrame(frame);
      running = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onMove);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  const cls = [styles.blob, fallback && styles['blob--fallback'], className].filter(Boolean).join(' ');
  return (
    <div className={cls} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.blob__canvas} />
    </div>
  );
}
