"use client";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { lowQuality } from "@/lib/quality";
import type { Status } from "@/lib/types";

const LOW = lowQuality();
export const STUDIO_NAME = "İLHAM";

/* ======================================================================================
   Procedural textures
   ====================================================================================== */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Cast-concrete look: soft blotches, fine grain and the odd pore. */
export function concreteTexture(base = 178, seed = 7, repeat: [number, number] = [1, 1], contrast = 1) {
  const c = canvas(512, 512);
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  ctx.fillStyle = `rgb(${base},${base - 1},${base - 4})`;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const x = r() * 512, y = r() * 512, rad = 30 + r() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const d = (r() - 0.5) * 26 * contrast;
    g.addColorStop(0, `rgba(${base + d},${base + d},${base + d - 3},${0.35 * contrast})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 14 * Math.max(0.5, contrast);
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(70,70,70,${0.15 + r() * 0.25})`;
    ctx.beginPath();
    ctx.arc(r() * 512, r() * 512, 0.6 + r() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Light oak with long soft grain. */
function woodTexture() {
  const c = canvas(256, 512);
  const ctx = c.getContext("2d")!;
  const r = rng(3);
  ctx.fillStyle = "#d8b58c";
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 70; i++) {
    const x = r() * 256;
    ctx.strokeStyle = `rgba(${140 + r() * 40},${95 + r() * 30},${60 + r() * 20},${0.12 + r() * 0.15})`;
    ctx.lineWidth = 0.5 + r() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y * 0.01 + i) * 6, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The studio wordmark, rendered to a transparent canvas. */
export function logoTexture(glow = true, color = "#ffffff") {
  const c = canvas(1024, 384);
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 1024, 384);
  ctx.font = "900 220px 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (glow) {
    ctx.shadowColor = "rgba(170,215,255,0.95)";
    ctx.shadowBlur = 42;
  }
  ctx.fillStyle = color;
  ctx.fillText(STUDIO_NAME, 512, 205);
  // four-point spark, like a stroke of inspiration
  ctx.save();
  ctx.translate(140, 70);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? 46 : 9;
    ctx.lineTo(Math.sin(a) * rad, -Math.cos(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- monitor screen textures (shared, one canvas each) ---------- */

let screenTextures: Record<string, THREE.CanvasTexture> | null = null;

function creativeFrame(ctx: CanvasRenderingContext2D, y0: number, hue: number) {
  const w = ctx.canvas.width;
  const h = 160;
  ctx.fillStyle = "#15161b";
  ctx.fillRect(0, y0, w, h);
  ctx.fillStyle = "#23252d";
  ctx.fillRect(0, y0, 44, h);
  ctx.fillRect(w - 50, y0, 50, h);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = "#3a3d48";
    ctx.fillRect(8, y0 + 12 + i * 22, 28, 12);
    ctx.fillRect(w - 44, y0 + 12 + i * 22, 38, 8);
  }
  const g = ctx.createRadialGradient(128, y0 + 80, 5, 128, y0 + 80, 70);
  g.addColorStop(0, `hsl(${hue},90%,72%)`);
  g.addColorStop(0.5, `hsl(${(hue + 60) % 360},80%,55%)`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(50, y0 + 5, 156, 150);
  ctx.strokeStyle = `hsla(${(hue + 160) % 360},90%,70%,0.8)`;
  ctx.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    ctx.beginPath();
    ctx.ellipse(128, y0 + 80, 20 + k * 7, 8 + k * 6, k * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function getScreenTextures() {
  if (screenTextures) return screenTextures;
  const mk = (draw: (ctx: CanvasRenderingContext2D) => void, h = 160, repeat = false) => {
    const c = canvas(256, h);
    draw(c.getContext("2d")!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1, 160 / h);
    }
    return t;
  };
  screenTextures = {
    working: mk((ctx) => [0, 1, 2, 3].forEach((i) => creativeFrame(ctx, i * 160, 200 + i * 45)), 640, true),
    code: mk((ctx) => {
      ctx.fillStyle = "#101521";
      ctx.fillRect(0, 0, 256, 640);
      const pal = ["#7dd3fc", "#e5e7eb", "#a7f3d0", "#fca5a5", "#fde68a", "#c4b5fd"];
      const r = rng(11);
      for (let y = 6; y < 640; y += 9) {
        let x = 6 + Math.floor(r() * 3) * 10;
        for (let s = 0; s < 1 + Math.floor(r() * 4); s++) {
          const len = 10 + r() * 40;
          ctx.fillStyle = pal[Math.floor(r() * pal.length)];
          ctx.fillRect(x, y, len, 4);
          x += len + 6;
        }
      }
    }, 640, true),
    thinking: mk((ctx) => {
      ctx.fillStyle = "#17122a";
      ctx.fillRect(0, 0, 256, 160);
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(128, 80, 12 + i * 11, i * 0.8, i * 0.8 + 3.6);
        ctx.stroke();
      }
    }),
    reviewing: mk((ctx) => {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, 256, 640);
      const r = rng(5);
      ctx.fillStyle = "#1e293b";
      for (let y = 18; y < 640; y += 12) ctx.fillRect(24, y, 120 + r() * 90, 4);
    }, 640, true),
    idle: mk((ctx) => {
      const g = ctx.createLinearGradient(0, 0, 256, 160);
      g.addColorStop(0, "#c7d2fe");
      g.addColorStop(0.5, "#fbcfe8");
      g.addColorStop(1, "#a5f3fc");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 160);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(128, 80, 26, 0, Math.PI * 2);
      ctx.fill();
    }),
    error: mk((ctx) => {
      ctx.fillStyle = "#3b0a0a";
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = "#f87171";
      ctx.font = "bold 70px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", 128, 105);
    }),
    done: mk((ctx) => {
      ctx.fillStyle = "#052e16";
      ctx.fillRect(0, 0, 256, 160);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(85, 82);
      ctx.lineTo(115, 110);
      ctx.lineTo(172, 52);
      ctx.stroke();
    }),
    off: mk((ctx) => {
      ctx.fillStyle = "#0b0c0f";
      ctx.fillRect(0, 0, 256, 160);
    }),
    timeline: mk((ctx) => {
      ctx.fillStyle = "#111318";
      ctx.fillRect(0, 0, 512, 160);
      const cols = ["#a78bfa", "#60a5fa", "#34d399", "#f59e0b", "#f472b6"];
      const r = rng(9);
      for (let row = 0; row < 6; row++)
        for (let x = 4; x < 256; ) {
          const w = 15 + r() * 50;
          ctx.fillStyle = cols[(row + Math.floor(x)) % cols.length];
          ctx.fillRect(x, 50 + row * 17, w - 3, 13);
          x += w;
        }
      ctx.fillStyle = "#2a2e38";
      ctx.fillRect(0, 0, 256, 44);
    }, 160, true),
  };
  return screenTextures;
}

/** Screen content is chosen from the agent's real status only. */
export function screenFor(status: Status | undefined, occupied: boolean, zone?: string) {
  const t = getScreenTextures();
  if (!occupied) return t.off;
  switch (status) {
    case "WORKING": return zone === "post" ? t.timeline : zone === "strategy" ? t.code : t.working;
    case "THINKING": return t.thinking;
    case "REVIEWING": return t.reviewing;
    case "ERROR": return t.error;
    case "COMPLETED": return t.done;
    default: return t.idle;
  }
}

export function ScreenAnimator() {
  useFrame((_, dt) => {
    const t = getScreenTextures();
    t.working.offset.y = (t.working.offset.y + dt * 0.05) % 1;
    t.code.offset.y = (t.code.offset.y + dt * 0.06) % 1;
    t.reviewing.offset.y = (t.reviewing.offset.y + dt * 0.02) % 1;
    t.timeline.offset.x = (t.timeline.offset.x + dt * 0.05) % 1;
  });
  return null;
}

/* ======================================================================================
   Materials
   ====================================================================================== */

let _mat: ReturnType<typeof buildMaterials> | null = null;
function buildMaterials() {
  const wood = woodTexture();
  return {
    wood: new THREE.MeshStandardMaterial({ map: wood, color: "#f1d6b3", roughness: 0.48 }),
    woodDark: new THREE.MeshStandardMaterial({ map: wood, color: "#c89a6a", roughness: 0.5 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(184, 7, [2, 1], 0.7), roughness: 0.92 }),
    concreteLight: new THREE.MeshStandardMaterial({ map: concreteTexture(206, 13), roughness: 0.9 }),
    aluminium: new THREE.MeshStandardMaterial({ color: "#d3d5d9", roughness: 0.28, metalness: 0.85 }),
    graphite: new THREE.MeshStandardMaterial({ color: "#2a2c31", roughness: 0.35, metalness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: "#111214", roughness: 0.3 }),
    fabric: new THREE.MeshStandardMaterial({ color: "#d9d4cc", roughness: 0.95 }),
    fabricDark: new THREE.MeshStandardMaterial({ color: "#8d8a85", roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ color: "#2f6b3f", roughness: 0.75, side: THREE.DoubleSide }),
    leaf2: new THREE.MeshStandardMaterial({ color: "#4b8a4f", roughness: 0.75, side: THREE.DoubleSide }),
    trunk: new THREE.MeshStandardMaterial({ color: "#7a6046", roughness: 0.9 }),
    led: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#f4f9ff", emissiveIntensity: 2.4, toneMapped: false }),
    white: new THREE.MeshStandardMaterial({ color: "#f4f3f0", roughness: 0.6 }),
  };
}
export function mats() {
  if (!_mat) _mat = buildMaterials();
  return _mat;
}

/* ======================================================================================
   Geometry helpers
   ====================================================================================== */

type P2 = [number, number];

/**
 * A bent "ribbon" of material: the centreline is drawn in the x/y plane (side profile),
 * thickened along its normal and extruded `depth` along z. This is what gives desks and
 * tables their flowing, waterfall shape.
 */
export function ribbonGeometry(points: P2[], thickness: number, depth: number, samples = 80) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, "centripetal", 0.5);
  const pts = curve.getSpacedPoints(samples);
  const outer: THREE.Vector2[] = [];
  const inner: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len, ny = tx / len;
    outer.push(new THREE.Vector2(pts[i].x + (nx * thickness) / 2, pts[i].y + (ny * thickness) / 2));
    inner.push(new THREE.Vector2(pts[i].x - (nx * thickness) / 2, pts[i].y - (ny * thickness) / 2));
  }
  const shape = new THREE.Shape([...outer, ...inner.reverse()]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Profile of a waterfall desk: rises from the floor, runs flat, flows back down. */
function deskProfile(w: number, h = 0.76, flare = 0.28): P2[] {
  const hw = w / 2;
  return [
    [-hw - flare, 0.02], [-hw - flare * 0.55, 0.08], [-hw - 0.02, 0.35], [-hw + 0.08, h - 0.08], [-hw + 0.3, h],
    [hw - 0.3, h], [hw - 0.08, h - 0.08], [hw + 0.02, 0.35], [hw + flare * 0.55, 0.08], [hw + flare, 0.02],
  ];
}

/* ======================================================================================
   Pieces
   ====================================================================================== */

export function Monitor({ position, rotationY = 0, texture, width = 0.66 }: {
  position: [number, number, number]; rotationY?: number; texture: THREE.Texture; width?: number;
}) {
  const m = mats();
  const h = width * 0.6;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.006, -0.03]} material={m.aluminium} castShadow><boxGeometry args={[0.22, 0.012, 0.17]} /></mesh>
      <mesh position={[0, 0.14, -0.08]} rotation={[-0.18, 0, 0]} material={m.aluminium} castShadow><boxGeometry args={[0.16, 0.28, 0.012]} /></mesh>
      <mesh position={[0, 0.22 + h / 2, -0.04]} material={m.aluminium} castShadow><boxGeometry args={[width + 0.03, h + 0.05, 0.02]} /></mesh>
      <mesh position={[0, 0.22 + h / 2 + 0.012, -0.028]}><boxGeometry args={[width, h, 0.004]} /><meshStandardMaterial color="#0d0d0f" /></mesh>
      <mesh position={[0, 0.22 + h / 2 + 0.012, -0.025]}>
        <planeGeometry args={[width - 0.02, h - 0.02]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function WaveDesk({ position, width = 1.8, monitors, screen, accent, executive = false }: {
  position: [number, number, number]; width?: number; monitors: number; screen: THREE.Texture; accent: string; executive?: boolean;
}) {
  const m = mats();
  const w = executive ? 2.3 : width;
  const depth = executive ? 0.95 : 0.78;
  const geo = useMemo(() => ribbonGeometry(deskProfile(w, 0.76, executive ? 0.4 : 0.28), 0.06, depth), [w, depth, executive]);
  const offsets = monitors === 1 ? [0] : monitors === 2 ? [-0.38, 0.38] : [-0.7, 0, 0.7];
  return (
    <group position={position}>
      <mesh geometry={geo} material={executive ? m.woodDark : m.wood} castShadow receiveShadow />
      {/* owner-coloured LED line under the front edge */}
      <mesh position={[0, 0.715, depth / 2 - 0.02]}>
        <boxGeometry args={[w - 0.7, 0.012, 0.012]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {offsets.map((ox, i) => (
        <Monitor key={i} position={[ox, 0.79, -0.14]} rotationY={ox * -0.3} texture={screen} />
      ))}
      <RoundedBox args={[0.44, 0.014, 0.13]} radius={0.006} position={[0, 0.8, 0.16]} material={m.aluminium} />
      <RoundedBox args={[0.1, 0.012, 0.14]} radius={0.006} position={[0.34, 0.8, 0.17]} material={m.white} />
      {executive && (
        <>
          <RoundedBox args={[0.32, 0.02, 0.22]} radius={0.008} position={[-0.75, 0.8, 0.1]} material={m.graphite} />
          <mesh position={[0.85, 0.85, 0.05]} castShadow><cylinderGeometry args={[0.04, 0.035, 0.11, 14]} /><meshStandardMaterial color="#efe9df" /></mesh>
        </>
      )}
    </group>
  );
}

export function Chair({ position, rotationY = 0, color }: { position: [number, number, number]; rotationY?: number; color?: string }) {
  const m = mats();
  const leg = useMemo(() => ribbonGeometry([[-0.2, 0.02], [-0.12, 0.05], [0, 0.22], [0.02, 0.42]], 0.05, 0.34, 30), []);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh geometry={leg} rotation={[0, Math.PI / 2, 0]} material={m.wood} castShadow />
      <RoundedBox args={[0.5, 0.05, 0.46]} radius={0.02} position={[0, 0.46, 0]} material={m.wood} castShadow receiveShadow />
      <RoundedBox args={[0.48, 0.42, 0.04]} radius={0.02} position={[0, 0.72, -0.22]} rotation={[-0.12, 0, 0]} material={m.wood} castShadow />
      {color && (
        <RoundedBox args={[0.42, 0.03, 0.38]} radius={0.012} position={[0, 0.5, 0.01]} castShadow>
          <meshStandardMaterial color={color} roughness={0.95} />
        </RoundedBox>
      )}
    </group>
  );
}

/* ---------- plants ---------- */

let leafGeo: THREE.ShapeGeometry | null = null;
function getLeafGeo() {
  if (leafGeo) return leafGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.09, 0.15, 0.08, 0.5, 0, 0.75);
  s.bezierCurveTo(-0.08, 0.5, -0.09, 0.15, 0, 0);
  leafGeo = new THREE.ShapeGeometry(s, 8);
  return leafGeo;
}

/** Tropical palm in a cast-concrete planter (the planter shape varies). */
export function Palm({ position, scale = 1, planter = "box", fronds = 11, seed = 1 }: {
  position: [number, number, number]; scale?: number; planter?: "box" | "round" | "none"; fronds?: number; seed?: number;
}) {
  const m = mats();
  const leaves = useMemo(() => {
    const r = rng(seed * 97 + 13);
    return Array.from({ length: fronds }, (_, i) => {
      const yaw = (i / fronds) * Math.PI * 2 + r() * 0.4;
      const pitch = 0.5 + r() * 0.75; // how far it droops outwards
      const len = 0.8 + r() * 0.5;
      const stem = 0.55 + r() * 0.55;
      return { yaw, pitch, len, stem, alt: r() > 0.5 };
    });
  }, [fronds, seed]);
  const g = getLeafGeo();
  return (
    <group position={position} scale={scale}>
      {planter === "box" && <RoundedBox args={[0.62, 0.55, 0.62]} radius={0.05} position={[0, 0.275, 0]} material={m.concreteLight} castShadow receiveShadow />}
      {planter === "round" && (
        <mesh position={[0, 0.3, 0]} material={m.concreteLight} castShadow receiveShadow><cylinderGeometry args={[0.34, 0.27, 0.6, 28]} /></mesh>
      )}
      <mesh position={[0, 0.56, 0]}><cylinderGeometry args={[0.28, 0.28, 0.02, 20]} /><meshStandardMaterial color="#3b2f25" /></mesh>
      {leaves.map((l, i) => (
        <group key={i} position={[0, 0.56, 0]} rotation={[0, l.yaw, 0]}>
          <mesh position={[0, l.stem / 2, 0]} material={m.trunk}><cylinderGeometry args={[0.012, 0.016, l.stem, 5]} /></mesh>
          {/* frond: a fan of leaflets leaning out from the stem */}
          <group position={[0, l.stem, 0]} rotation={[l.pitch, 0, 0]}>
            {[-0.5, -0.25, 0, 0.25, 0.5].map((z, j) => (
              <mesh key={j} geometry={g} material={l.alt ? m.leaf : m.leaf2} rotation={[0, 0, z]} scale={[1.1, l.len, 1]} castShadow />
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}

/* ---------- light & atmosphere ---------- */

export function LedStrip({ points, radius = 0.022, closed = false }: { points: [number, number, number][]; radius?: number; closed?: boolean }) {
  const m = mats();
  const geo = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, "centripetal");
    return new THREE.TubeGeometry(c, Math.max(32, points.length * 24), radius, 6, closed);
  }, [points, radius, closed]);
  return <mesh geometry={geo} material={m.led} />;
}

/** Wordmark on a wall, with a soft additive halo behind it. */
export function GlowLogo({ position, rotationY = 0, width = 3.4 }: { position: [number, number, number]; rotationY?: number; width?: number }) {
  const tex = useMemo(() => logoTexture(true), []);
  const h = width * (384 / 1024);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, 0.002]} scale={1.15}>
        <planeGeometry args={[width, h]} />
        <meshBasicMaterial map={tex} transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[width, h]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const holoVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const holoFragment = /* glsl */ `
uniform float uTime; uniform float uEnergy; uniform sampler2D uLogo;
varying vec2 vUv;
vec3 iri(float t) { return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t)); }
void main() {
  vec2 p = (vUv - 0.5) * vec2(2.8, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  float swirl = sin(a * 3.0 + r * 9.0 - uTime * 1.2) * 0.5 + sin(r * 14.0 - uTime * 0.8 + p.x * 3.0) * 0.5;
  float band = smoothstep(0.25, 0.95, abs(sin(swirl * 2.2 + r * 4.0)));
  vec3 col = iri(swirl * 0.35 + r * 0.6 + uTime * 0.05);
  vec3 base = vec3(0.56, 0.56, 0.55);
  float vign = smoothstep(1.55, 0.2, r);
  vec3 c = mix(base, col, band * vign * (0.45 + 0.55 * uEnergy));
  vec4 logo = texture2D(uLogo, vec2((vUv.x - 0.5) * 2.2 + 0.5, (vUv.y - 0.5) * 1.6 + 0.5));
  float inside = step(0.0, (vUv.x - 0.5) * 2.2 + 0.5) * step((vUv.x - 0.5) * 2.2 + 0.5, 1.0);
  c = mix(c, vec3(1.0), logo.a * inside * 0.95);
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * Iridescent projection wall. Its motion and colour intensity scale with how many agents are
 * actually working right now (energy 0..1) - when the studio is idle it slows to a calm drift.
 */
export function HoloWall({ position, rotationY = 0, size, energy }: {
  position: [number, number, number]; rotationY?: number; size: [number, number]; energy: number;
}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uLogo: { value: logoTexture(false) } },
    vertexShader: holoVertex, fragmentShader: holoFragment, toneMapped: false,
  }), []);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    u.uEnergy.value = THREE.MathUtils.lerp(u.uEnergy.value, energy, Math.min(1, dt * 1.5));
    u.uTime.value += dt * (0.12 + u.uEnergy.value * 0.9);
  });
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} material={mat}>
      <planeGeometry args={size} />
    </mesh>
  );
}

export function PendantLamp({ position, intensity = 5 }: { position: [number, number, number]; intensity?: number }) {
  const m = mats();
  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]} material={m.graphite}><cylinderGeometry args={[0.006, 0.006, 1.4, 4]} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.led}><torusGeometry args={[0.32, 0.018, 8, 40]} /></mesh>
      {!LOW && <pointLight position={[0, -0.2, 0]} color="#fff4e6" intensity={intensity} distance={7} decay={1.6} />}
    </group>
  );
}

/* ---------- lounge, production gear ---------- */

export function Sofa({ position, rotationY = 0, seats = 3, color }: { position: [number, number, number]; rotationY?: number; seats?: number; color?: string }) {
  const m = mats();
  const w = seats * 0.95;
  const fab = color ? new THREE.MeshStandardMaterial({ color, roughness: 0.95 }) : m.fabric;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[w + 0.3, 0.32, 0.92]} radius={0.12} position={[0, 0.2, 0]} material={m.concreteLight} castShadow receiveShadow />
      <RoundedBox args={[w, 0.16, 0.78]} radius={0.07} position={[0, 0.42, 0.04]} material={fab} castShadow />
      <RoundedBox args={[w + 0.3, 0.52, 0.2]} radius={0.09} position={[0, 0.6, -0.38]} material={fab} castShadow />
    </group>
  );
}

export function RoundTable({ position, radius = 0.7 }: { position: [number, number, number]; radius?: number }) {
  const m = mats();
  const logo = useMemo(() => logoTexture(false, "#3b3b3b"), []);
  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]} material={m.wood} castShadow receiveShadow><cylinderGeometry args={[radius, radius, 0.06, 48]} /></mesh>
      <mesh position={[0, 0.434, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.8, 40]} />
        <meshStandardMaterial color="#efeeea" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.436, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[radius * 1.4, radius * 0.52]} />
        <meshBasicMaterial map={logo} transparent />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={m.wood} castShadow><cylinderGeometry args={[0.14, 0.32, 0.38, 24]} /></mesh>
    </group>
  );
}

export function CoffeeBar({ position }: { position: [number, number, number] }) {
  const m = mats();
  return (
    <group position={position}>
      <RoundedBox args={[2.6, 0.98, 0.7]} radius={0.06} position={[0, 0.49, 0]} material={m.concreteLight} castShadow receiveShadow />
      <RoundedBox args={[2.75, 0.06, 0.8]} radius={0.02} position={[0, 1.0, 0]} material={m.wood} castShadow />
      <RoundedBox args={[0.42, 0.48, 0.38]} radius={0.04} position={[-0.75, 1.27, -0.06]} material={m.aluminium} castShadow />
      {[0.15, 0.4, 0.65].map((x, i) => (
        <mesh key={i} position={[x, 1.09, 0.12]} castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.11, 14]} />
          <meshStandardMaterial color={["#f2efe9", "#1f2937", "#c2410c"][i]} />
        </mesh>
      ))}
    </group>
  );
}

export function CameraRig({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const m = mats();
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[0, 2.09, 4.19].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * 0.25, 0.6, Math.cos(a) * 0.25]} rotation={[Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]} material={m.graphite} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 1.25, 6]} />
        </mesh>
      ))}
      <RoundedBox args={[0.3, 0.26, 0.45]} radius={0.03} position={[0, 1.33, 0]} material={m.black} castShadow />
      <mesh position={[0, 1.33, 0.34]} rotation={[Math.PI / 2, 0, 0]} material={m.black} castShadow><cylinderGeometry args={[0.09, 0.1, 0.3, 18]} /></mesh>
      <mesh position={[0, 1.33, 0.495]} rotation={[0, 0, 0]}><circleGeometry args={[0.08, 18]} /><meshStandardMaterial color="#1e3a8a" metalness={0.9} roughness={0.1} /></mesh>
      <RoundedBox args={[0.18, 0.12, 0.02]} radius={0.01} position={[0.2, 1.42, -0.12]} rotation={[0, -0.6, 0]} material={m.black} />
    </group>
  );
}

export function LightStand({ position, rotationY = 0, color = "#fff7e8" }: { position: [number, number, number]; rotationY?: number; color?: string }) {
  const m = mats();
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.9, 0]} material={m.graphite}><cylinderGeometry args={[0.022, 0.022, 1.8, 8]} /></mesh>
      {[0, 2.09, 4.19].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * 0.25, 0.12, Math.cos(a) * 0.25]} rotation={[Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1]} material={m.graphite}>
          <cylinderGeometry args={[0.014, 0.014, 0.55, 6]} />
        </mesh>
      ))}
      <group position={[0, 1.85, 0]} rotation={[0.35, 0, 0]}>
        <RoundedBox args={[0.7, 0.55, 0.28]} radius={0.04} material={m.graphite} castShadow />
        <mesh position={[0, 0, 0.145]}>
          <planeGeometry args={[0.6, 0.46]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function Whiteboard({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const m = mats();
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[2.4, 1.2, 0.05]} radius={0.02} material={m.white} />
      {([[-0.6, 0.25, "#f472b6"], [0.2, 0.1, "#60a5fa"], [0.7, -0.25, "#34d399"], [-0.4, -0.3, "#fbbf24"]] as const).map(([x, y, c], i) => (
        <mesh key={i} position={[x, y, 0.03]}><planeGeometry args={[0.55, 0.32]} /><meshStandardMaterial color={c} /></mesh>
      ))}
    </group>
  );
}

/** Curved wooden wall panel (rounded top corners), as used behind the workstations. */
export function WoodPanel({ position, rotationY = 0, w, h, r = 0.6 }: {
  position: [number, number, number]; rotationY?: number; w: number; h: number; r?: number;
}) {
  const m = mats();
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - r);
    s.quadraticCurveTo(w / 2, h, w / 2 - r, h);
    s.lineTo(-w / 2 + r, h);
    s.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 16 });
    return g;
  }, [w, h, r]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh geometry={geo} material={m.wood} castShadow receiveShadow />
      <LedStrip radius={0.015} points={[[-w / 2 - 0.05, 0.2, 0.06], [-w / 2 - 0.05, h - r, 0.06], [-w / 2 + r * 0.3, h + 0.03, 0.06], [w / 2 - r * 0.3, h + 0.03, 0.06], [w / 2 + 0.05, h - r, 0.06], [w / 2 + 0.05, 0.2, 0.06]]} />
    </group>
  );
}
