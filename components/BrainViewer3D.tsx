"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BrainCircuit } from "lucide-react";
import {
  brainRegionOrder,
  formatBrainRegion,
  getBrainRegionColor,
  normalizeRegionActivation
} from "@/lib/brainRegions";
import type { FeatureWindow } from "@/lib/types";

type BrainViewer3DProps = {
  activeWindow?: FeatureWindow;
  windows: FeatureWindow[];
  isPlaying: boolean;
  focusedRegion: string | null;
  onRegionFocus: (region: string | null) => void;
};

type RegionMesh = THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;

const regionPositions: Record<string, [number, number, number]> = {
  visual_cortex: [0, -0.74, -0.58],
  auditory_cortex: [-0.8, -0.08, 0.06],
  heschls_gyrus: [0.8, -0.1, 0.08],
  brocas_area: [-0.54, 0.26, 0.68],
  sts: [0.52, 0.18, 0.66],
  prefrontal: [0, 0.64, 0.72],
  motor_cortex: [0, 0.42, -0.2]
};

export function BrainViewer3D({
  activeWindow,
  windows,
  isPlaying,
  focusedRegion,
  onRegionFocus
}: BrainViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const regionMeshesRef = useRef<Map<string, RegionMesh>>(new Map());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const focusedRegionRef = useRef(focusedRegion);
  const onRegionFocusRef = useRef(onRegionFocus);

  const allActivations = useMemo(() => windows.map((window) => window.region_activations), [windows]);

  const regionStates = useMemo(() => {
    return brainRegionOrder.map((region) => ({
      region,
      ...normalizeRegionActivation(activeWindow, region, allActivations)
    }));
  }, [activeWindow, allActivations]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    focusedRegionRef.current = focusedRegion;
  }, [focusedRegion]);

  useEffect(() => {
    onRegionFocusRef.current = onRegionFocus;
  }, [onRegionFocus]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const containerElement = containerRef.current as HTMLDivElement;
    const canvasElement = canvasRef.current as HTMLCanvasElement;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.18, 5.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0x8ff7ff, 0.45));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(2.4, 3, 4);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x9d05ff, 2.3, 7);
    rimLight.position.set(-2.4, 1.2, 2.2);
    scene.add(rimLight);

    const group = new THREE.Group();
    group.rotation.x = -0.12;
    scene.add(group);
    groupRef.current = group;

    const shellGeometry = new THREE.IcosahedronGeometry(1.58, 4);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0x6df8ff,
      transparent: true,
      opacity: 0.11,
      wireframe: true
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.scale.set(0.86, 1.04, 0.78);
    group.add(shell);

    const meridianMaterial = new THREE.LineBasicMaterial({
      color: 0x00f2ff,
      transparent: true,
      opacity: 0.18
    });
    for (let index = 0; index < 5; index += 1) {
      const curve = new THREE.EllipseCurve(0, 0, 1.38, 0.9, 0, Math.PI * 2);
      const points = curve.getPoints(96).map((point) => new THREE.Vector3(point.x, point.y, 0));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), meridianMaterial);
      line.rotation.y = (index / 5) * Math.PI;
      line.rotation.x = Math.PI / 2;
      group.add(line);
    }

    const meshes = new Map<string, RegionMesh>();
    for (const region of brainRegionOrder) {
      const geometry = new THREE.SphereGeometry(0.13, 32, 32);
      const color = new THREE.Color(getBrainRegionColor(region));
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.18
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...regionPositions[region]);
      mesh.userData.region = region;
      group.add(mesh);
      meshes.set(region, mesh);
    }
    regionMeshesRef.current = meshes;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function resize() {
      const rect = containerElement.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function pickRegion(event: PointerEvent) {
      const rect = canvasElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...meshes.values()]);
      if (!hits[0]) return;
      const region = String(hits[0].object.userData.region);
      onRegionFocusRef.current(focusedRegionRef.current === region ? null : region);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerElement);
    canvasElement.addEventListener("pointerdown", pickRegion);
    resize();

    let frameId = 0;
    function animate() {
      frameId = requestAnimationFrame(animate);
      group.rotation.y += isPlayingRef.current ? 0.006 : 0.002;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      canvasElement.removeEventListener("pointerdown", pickRegion);
      resizeObserver.disconnect();
      renderer.dispose();
      shellGeometry.dispose();
      shellMaterial.dispose();
      meridianMaterial.dispose();
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      regionMeshesRef.current.clear();
      groupRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  useEffect(() => {
    for (const state of regionStates) {
      const mesh = regionMeshesRef.current.get(state.region);
      if (!mesh) continue;
      const isFocused = focusedRegion === state.region;
      const scale = 0.78 + state.normalizedIntensity * 1.45 + (isFocused ? 0.38 : 0);
      mesh.scale.setScalar(scale);
      mesh.material.opacity = focusedRegion && !isFocused ? 0.42 : 1;
      mesh.material.transparent = Boolean(focusedRegion && !isFocused);
      mesh.material.emissiveIntensity = 0.35 + state.normalizedIntensity * 1.7 + (isFocused ? 0.55 : 0);
    }
  }, [focusedRegion, regionStates]);

  return (
    <div className="panel relative min-h-[420px] overflow-hidden rounded-lg">
      <div ref={containerRef} className="absolute inset-0 neural-grid">
        <canvas ref={canvasRef} className="h-full w-full cursor-crosshair" aria-label="Interactive brain region activation viewer" />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,242,255,.12),transparent_38%),linear-gradient(180deg,transparent,rgba(0,0,0,.38))]" />

      <div className="relative z-10 flex h-full min-h-[420px] flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-cyan" />
            <h2 className="font-display text-xl font-bold text-white">Cortical map</h2>
          </div>
          <span className="rounded border border-white/10 bg-black/45 px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-300">
            {focusedRegion ? formatBrainRegion(focusedRegion) : "All regions"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {regionStates.map((state) => {
            const isFocused = focusedRegion === state.region;
            return (
              <button
                key={state.region}
                type="button"
                onClick={() => onRegionFocus(isFocused ? null : state.region)}
                className={`min-h-14 rounded border bg-black/55 p-2 text-left transition ${
                  isFocused ? "border-cyan shadow-cyan" : "border-white/10 hover:border-white/30"
                }`}
              >
                <span className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getBrainRegionColor(state.region) }} />
                  {formatBrainRegion(state.region)}
                </span>
                <span className="mt-1 block font-display text-base font-bold text-white">
                  {state.rawValue.toFixed(3)}
                  <span className="ml-2 text-[10px] font-medium text-cyan">{state.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
