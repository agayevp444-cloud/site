"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { lowQuality } from "@/lib/quality";
import type { Status } from "@/lib/types";

const LOW = lowQuality();

/* ---------- shared animated monitor textures (one canvas each, reused by every screen) ---------- */

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

let screenTextures: Record<string, THREE.CanvasTexture> | null = null;

function drawCode(ctx: CanvasRenderingContext2D, accent: string, bg: string) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const palette = [accent, "#e5e7eb", "#93c5fd", "#fca5a5", "#fde68a"];
  for (let y = 6; y < h; y += 9) {
    let x = 6 + Math.floor(Math.random() * 3) * 10;
    const segs = 1 + Math.floor(Math.random() * 4);
    for (let s = 0; s < segs; s++) {
      const len = 10 + Math.random() * 40;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y, len, 4);
      x += len + 6;
    }
  }
  ctx.globalAlpha = 1;
}

export function getScreenTextures() {
  if (screenTextures) return screenTextures;
  const mk = (draw: (ctx: CanvasRenderingContext2D) => void, repeat = false) => {
    const c = makeCanvas(256, 160);
    draw(c.getContext("2d")!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1, 0.5);
    }
    return t;
  };
  screenTextures = {
    working: mk((ctx) => drawCode(ctx, "#34d399", "#0b1220"), true),
    thinking: mk((ctx) => {
      ctx.fillStyle = "#140f24";
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
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = "#0f172a";
      for (let y = 18; y < 150; y += 12) ctx.fillRect(24, y, 120 + Math.random() * 90, 4);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(0, 0, 256, 10);
    }, true),
    idle: mk((ctx) => {
      const g = ctx.createLinearGradient(0, 0, 256, 160);
      g.addColorStop(0, "#1e293b");
      g.addColorStop(1, "#0f172a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(128, 80, 20, 0, Math.PI * 2);
      ctx.fill();
    }),
    error: mk((ctx) => {
      ctx.fillStyle = "#3b0a0a";
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = "#f87171";
      ctx.font = "bold 64px sans-serif";
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
      ctx.fillStyle = "#05070a";
      ctx.fillRect(0, 0, 256, 160);
    }),
    timeline: mk((ctx) => {
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, 256, 160);
      const cols = ["#a78bfa", "#60a5fa", "#34d399", "#f59e0b", "#f472b6"];
      for (let r = 0; r < 6; r++)
        for (let x = 4; x < 252; ) {
          const w = 15 + Math.random() * 50;
          ctx.fillStyle = cols[(r + Math.floor(x)) % cols.length];
          ctx.fillRect(x, 50 + r * 17, w - 3, 13);
          x += w;
        }
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 0, 256, 44);
    }, true),
  };
  return screenTextures;
}

export function screenFor(status: Status | undefined, occupied: boolean, zone?: string) {
  const t = getScreenTextures();
  if (!occupied) return t.off;
  switch (status) {
    case "WORKING": return zone === "post" ? t.timeline : t.working;
    case "THINKING": return t.thinking;
    case "REVIEWING": return t.reviewing;
    case "ERROR": return t.error;
    case "COMPLETED": return t.done;
    case "PAUSED": case "IDLE": case undefined: return t.idle;
    default: return t.idle;
  }
}

/** Scrolls the shared "active" screen textures - only visible on desks whose agent is really working. */
export function ScreenAnimator() {
  useFrame((_, dt) => {
    const t = getScreenTextures();
    t.working.offset.y = (t.working.offset.y + dt * 0.08) % 1;
    t.reviewing.offset.y = (t.reviewing.offset.y + dt * 0.03) % 1;
    t.timeline.offset.x = (t.timeline.offset.x + dt * 0.05) % 1;
  });
  return null;
}

/* ---------- materials ---------- */
const mat = {
  wood: new THREE.MeshStandardMaterial({ color: "#a47148", roughness: 0.55 }),
  darkWood: new THREE.MeshStandardMaterial({ color: "#5c3d2e", roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: "#f2efe9", roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: "#2b2d31", roughness: 0.35, metalness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: "#9aa0a6", roughness: 0.3, metalness: 0.8 }),
  black: new THREE.MeshStandardMaterial({ color: "#16171a", roughness: 0.4 }),
  fabric: new THREE.MeshStandardMaterial({ color: "#3f4c5a", roughness: 0.9 }),
  leaf: new THREE.MeshStandardMaterial({ color: "#3f7d4e", roughness: 0.8 }),
  leaf2: new THREE.MeshStandardMaterial({ color: "#5a9b5f", roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: "#d8cfc4", roughness: 0.7 }),
  terracotta: new THREE.MeshStandardMaterial({ color: "#b5643c", roughness: 0.8 }),
};
export { mat };

/* ---------- pieces ---------- */

function Box({ args, position, material, rotation, cast = true }: {
  args: [number, number, number]; position: [number, number, number]; material: THREE.Material;
  rotation?: [number, number, number]; cast?: boolean;
}) {
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow={cast} receiveShadow>
      <boxGeometry args={args} />
    </mesh>
  );
}

export function Monitor({ position, rotationY = 0, texture, width = 0.62 }: {
  position: [number, number, number]; rotationY?: number; texture: THREE.Texture; width?: number;
}) {
  const h = width * 0.6;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Box args={[0.08, 0.22, 0.08]} position={[0, 0.11, -0.02]} material={mat.metal} />
      <Box args={[0.26, 0.015, 0.16]} position={[0, 0.008, -0.02]} material={mat.metal} />
      <Box args={[width + 0.04, h + 0.04, 0.035]} position={[0, 0.22 + h / 2, 0]} material={mat.black} />
      <mesh position={[0, 0.22 + h / 2, 0.019]}>
        <planeGeometry args={[width, h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Desk({ position, monitors, screen, accent, executive = false }: {
  position: [number, number, number]; monitors: number; screen: THREE.Texture; accent: string; executive?: boolean;
}) {
  const w = executive ? 2.2 : 1.7;
  const d = executive ? 1.0 : 0.8;
  const top = executive ? mat.darkWood : mat.wood;
  const offsets = monitors === 1 ? [0] : monitors === 2 ? [-0.36, 0.36] : [-0.66, 0, 0.66];
  return (
    <group position={position}>
      <Box args={[w, 0.05, d]} position={[0, 0.75, 0]} material={top} />
      {executive ? (
        <Box args={[w - 0.1, 0.7, 0.06]} position={[0, 0.37, -d / 2 + 0.05]} material={mat.darkWood} />
      ) : (
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
          <Box key={i} args={[0.04, 0.74, 0.04]} position={[sx * (w / 2 - 0.06), 0.37, sz * (d / 2 - 0.06)]} material={mat.metal} />
        ))
      )}
      {/* drawer unit with the owner's accent colour */}
      <mesh position={[w / 2 - 0.25, 0.32, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.6, d - 0.12]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      {offsets.map((ox, i) => (
        <Monitor key={i} position={[ox, 0.775, -0.18]} rotationY={ox * -0.35} texture={screen} />
      ))}
      <Box args={[0.46, 0.02, 0.15]} position={[0, 0.785, 0.17]} material={mat.black} />
      <Box args={[0.07, 0.02, 0.1]} position={[0.36, 0.785, 0.18]} material={mat.black} />
      {/* coffee mug */}
      <mesh position={[-w / 2 + 0.2, 0.83, 0.12]} castShadow>
        <cylinderGeometry args={[0.04, 0.035, 0.1, 12]} />
        <meshStandardMaterial color="#e9e3d9" />
      </mesh>
    </group>
  );
}

export function Chair({ position, rotationY = 0, color = "#2f3640" }: {
  position: [number, number, number]; rotationY?: number; color?: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.08, 0.48]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.82, -0.22]} castShadow>
        <boxGeometry args={[0.48, 0.62, 0.07]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <Box args={[0.05, 0.4, 0.05]} position={[0, 0.22, 0]} material={mat.metal} />
      <Box args={[0.55, 0.03, 0.06]} position={[0, 0.03, 0]} material={mat.metal} />
      <Box args={[0.06, 0.03, 0.55]} position={[0, 0.03, 0]} material={mat.metal} />
    </group>
  );
}

export function Plant({ position, scale = 1, variant = 0 }: { position: [number, number, number]; scale?: number; variant?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.25, 0]} material={variant ? mat.terracotta : mat.pot} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.5, 16]} />
      </mesh>
      {variant === 0 ? (
        <>
          <mesh position={[0, 0.95, 0]} material={mat.leaf} castShadow><sphereGeometry args={[0.42, 14, 12]} /></mesh>
          <mesh position={[0.18, 1.25, 0.08]} material={mat.leaf2} castShadow><sphereGeometry args={[0.28, 12, 10]} /></mesh>
        </>
      ) : (
        [0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[Math.cos(i * 1.3) * 0.1, 0.95, Math.sin(i * 1.3) * 0.1]} rotation={[Math.cos(i) * 0.35, 0, Math.sin(i) * 0.35]}
            material={i % 2 ? mat.leaf : mat.leaf2} castShadow>
            <coneGeometry args={[0.09, 0.95, 6]} />
          </mesh>
        ))
      )}
    </group>
  );
}

export function Sofa({ position, rotationY = 0, color = "#8c5a3c", seats = 3 }: {
  position: [number, number, number]; rotationY?: number; color?: string; seats?: number;
}) {
  const w = seats * 1.0;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.44, 0.9]} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>
      <mesh position={[0, 0.62, -0.36]} castShadow><boxGeometry args={[w, 0.5, 0.2]} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 + 0.08), 0.38, 0]} castShadow><boxGeometry args={[0.18, 0.5, 0.9]} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>
      ))}
    </group>
  );
}

export function CameraRig({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[0, 2.09, 4.19].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * 0.25, 0.6, Math.cos(a) * 0.25]} rotation={[Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]} material={mat.metal} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 1.25, 6]} />
        </mesh>
      ))}
      <Box args={[0.3, 0.26, 0.45]} position={[0, 1.33, 0]} material={mat.black} />
      <mesh position={[0, 1.33, 0.34]} rotation={[Math.PI / 2, 0, 0]} material={mat.black} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.3, 16]} />
      </mesh>
      <mesh position={[0, 1.33, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.08, 16]} />
        <meshStandardMaterial color="#1e3a8a" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.17, 1.5, -0.05]} material={mat.metal}><boxGeometry args={[0.05, 0.12, 0.2]} /></mesh>
    </group>
  );
}

export function LightStand({ position, rotationY = 0, color = "#fff3d6" }: { position: [number, number, number]; rotationY?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.9, 0]} material={mat.metal}><cylinderGeometry args={[0.025, 0.025, 1.8, 8]} /></mesh>
      {[0, 2.09, 4.19].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * 0.25, 0.12, Math.cos(a) * 0.25]} rotation={[Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1]} material={mat.metal}>
          <cylinderGeometry args={[0.015, 0.015, 0.55, 6]} />
        </mesh>
      ))}
      <group position={[0, 1.85, 0]} rotation={[0.35, 0, 0]}>
        <mesh castShadow><boxGeometry args={[0.7, 0.55, 0.3]} /><meshStandardMaterial color="#1f2937" /></mesh>
        <mesh position={[0, 0, 0.16]}>
          <planeGeometry args={[0.62, 0.48]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function Bookshelf({ position, rotationY = 0, width = 1.6 }: { position: [number, number, number]; rotationY?: number; width?: number }) {
  const books = useMemo(() => {
    const cols = ["#b23a48", "#2e4057", "#f2a541", "#4f772d", "#8e7dbe", "#e07a5f", "#264653"];
    const out: { x: number; y: number; h: number; w: number; c: string }[] = [];
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -width / 2 + 0.08;
      while (x < width / 2 - 0.12) {
        const w = 0.05 + Math.random() * 0.06;
        out.push({ x: x + w / 2, y: 0.18 + shelf * 0.48, h: 0.24 + Math.random() * 0.14, w, c: cols[Math.floor(Math.random() * cols.length)] });
        x += w + 0.01;
      }
    }
    return out;
  }, [width]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Box args={[width, 2.0, 0.36]} position={[0, 1.0, -0.02]} material={mat.darkWood} />
      {[0, 1, 2, 3].map((i) => (
        <Box key={i} args={[width - 0.06, 0.03, 0.32]} position={[0, 0.06 + i * 0.48, 0.02]} material={mat.wood} />
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + b.h / 2 - 0.1, 0.05]} castShadow>
          <boxGeometry args={[b.w, b.h, 0.24]} />
          <meshStandardMaterial color={b.c} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export function PendantLamp({ position, color = "#ffcf8a", intensity = 6 }: { position: [number, number, number]; color?: string; intensity?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]} material={mat.metal}><cylinderGeometry args={[0.008, 0.008, 1.2, 4]} /></mesh>
      <mesh castShadow>
        <coneGeometry args={[0.28, 0.25, 20, 1, true]} />
        <meshStandardMaterial color="#1f1f1f" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {!LOW && <pointLight position={[0, -0.25, 0]} color={color} intensity={intensity} distance={7} decay={1.6} />}
    </group>
  );
}

export function CoffeeBar({ position }: { position: [number, number, number] }) {
  const steam = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (steam.current) {
      const m = steam.current.material as THREE.MeshStandardMaterial;
      m.opacity = 0.25 + Math.sin(clock.elapsedTime * 2) * 0.1;
      steam.current.position.y = 1.45 + ((clock.elapsedTime * 0.2) % 0.2);
    }
  });
  return (
    <group position={position}>
      <Box args={[2.6, 1.0, 0.7]} position={[0, 0.5, 0]} material={mat.darkWood} />
      <Box args={[2.7, 0.05, 0.78]} position={[0, 1.02, 0]} material={mat.white} />
      <Box args={[0.45, 0.5, 0.4]} position={[-0.7, 1.3, -0.05]} material={mat.steel} />
      <mesh ref={steam} position={[-0.7, 1.45, 0.12]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.3} />
      </mesh>
      {[0.1, 0.35, 0.6].map((x, i) => (
        <mesh key={i} position={[x, 1.1, 0.1]} castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.11, 12]} />
          <meshStandardMaterial color={["#e9e3d9", "#2a9d8f", "#e76f51"][i]} />
        </mesh>
      ))}
      <Plant position={[1.05, 1.05, 0]} scale={0.35} variant={1} />
    </group>
  );
}

/** Large wall display; shows the live timeline texture only while the post team is actually working. */
export function WallScreen({ position, rotationY = 0, texture, w = 2.6 }: {
  position: [number, number, number]; rotationY?: number; texture: THREE.Texture; w?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Box args={[w + 0.1, w * 0.58 + 0.1, 0.06]} position={[0, 0, 0]} material={mat.black} />
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[w, w * 0.56]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Whiteboard({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Box args={[2.4, 1.2, 0.05]} position={[0, 0, 0]} material={mat.white} />
      {[[-0.6, 0.25, "#e63946"], [0.2, 0.1, "#1d3557"], [0.7, -0.25, "#2a9d8f"], [-0.4, -0.3, "#f4a261"]].map(([x, y, c], i) => (
        <mesh key={i} position={[x as number, y as number, 0.03]}>
          <planeGeometry args={[0.55, 0.32]} />
          <meshStandardMaterial color={c as string} />
        </mesh>
      ))}
    </group>
  );
}
