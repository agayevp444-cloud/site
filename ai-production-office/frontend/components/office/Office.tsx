"use client";
import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Employee } from "@/lib/types";
import {
  Bookshelf, CameraRig, Chair, CoffeeBar, Desk, LightStand, PendantLamp, Plant, ScreenAnimator, Sofa,
  WallScreen, Whiteboard, getScreenTextures, mat, screenFor,
} from "./Furniture";
import { FLOOR, MEETING_TABLE, deskDef } from "./layout";

const WALL_H = 3.0;
const ROOM_Z = -4; // front edge of the back rooms

const wallMat = new THREE.MeshStandardMaterial({ color: "#ede4d8", roughness: 0.9 });
const accentWall = new THREE.MeshStandardMaterial({ color: "#c46a4a", roughness: 0.85 });
const postWall = new THREE.MeshStandardMaterial({ color: "#2a2d3a", roughness: 0.9 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: "#cfe8ff", transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, transmission: 0.2,
});
const frameMat = new THREE.MeshStandardMaterial({ color: "#2b2d31", metalness: 0.6, roughness: 0.4 });

function Wall({ from, to, h = WALL_H, material = wallMat, t = 0.15 }: {
  from: [number, number]; to: [number, number]; h?: number; material?: THREE.Material; t?: number;
}) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  return (
    <mesh position={[(from[0] + to[0]) / 2, h / 2, (from[1] + to[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}
      material={material} castShadow receiveShadow>
      <boxGeometry args={[len, h, t]} />
    </mesh>
  );
}

/** Glass partition along x at z, with a door gap centred on doorX. */
function GlassFront({ x0, x1, z, doorX, doorW = 1.4 }: { x0: number; x1: number; z: number; doorX: number; doorW?: number }) {
  const segs: [number, number][] = [[x0, doorX - doorW / 2], [doorX + doorW / 2, x1]];
  return (
    <group>
      {segs.map(([a, b], i) => (
        <group key={i}>
          <mesh position={[(a + b) / 2, 1.3, z]} material={glassMat}>
            <boxGeometry args={[b - a, 2.6, 0.04]} />
          </mesh>
          <mesh position={[(a + b) / 2, 2.62, z]} material={frameMat}><boxGeometry args={[b - a, 0.05, 0.07]} /></mesh>
          <mesh position={[(a + b) / 2, 0.02, z]} material={frameMat}><boxGeometry args={[b - a, 0.04, 0.07]} /></mesh>
          {[a, b].map((x, j) => (
            <mesh key={j} position={[x, 1.32, z]} material={frameMat}><boxGeometry args={[0.06, 2.64, 0.07]} /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function FloorPatch({ x0, x1, z0, z1, color, y = 0.005 }: { x0: number; x1: number; z0: number; z1: number; color: string; y?: number }) {
  return (
    <mesh position={[(x0 + x1) / 2, y, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

function ZoneLabel({ position, text, sub }: { position: [number, number, number]; text: string; sub?: string }) {
  return (
    <Html position={position} center distanceFactor={18} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
      <div className="whitespace-nowrap text-center select-none">
        <div className="text-[13px] font-semibold tracking-[0.25em] uppercase text-amber-100/80 drop-shadow">{text}</div>
        {sub && <div className="text-[10px] tracking-widest uppercase text-amber-100/40">{sub}</div>}
      </div>
    </Html>
  );
}

function woodFloorTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  for (let row = 0; row < 16; row++) {
    let x = -Math.random() * 200;
    while (x < 512) {
      const w = 120 + Math.random() * 160;
      const l = 52 + Math.random() * 10;
      ctx.fillStyle = `hsl(28, 38%, ${l}%)`;
      ctx.fillRect(x, row * 32, w - 2, 30);
      ctx.fillStyle = "rgba(60,30,10,0.08)";
      for (let g = 0; g < 4; g++) ctx.fillRect(x, row * 32 + 4 + g * 7, w - 2, 1);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Office({ employees }: { employees: Employee[] }) {
  const floorTex = useMemo(() => woodFloorTexture(), []);
  const byDesk = useMemo(() => {
    const m = new Map<number, Employee>();
    employees.filter((e) => e.active).forEach((e) => m.set(e.desk, e));
    return m;
  }, [employees]);
  const deskIdx = useMemo(() => {
    const base = Array.from({ length: 16 }, (_, i) => i);
    const extra = employees.filter((e) => e.active && e.desk >= 16).map((e) => e.desk);
    return [...base, ...extra];
  }, [employees]);
  const post = employees.filter((e) => [4, 5, 6].includes(e.desk));
  const postActive = post.some((e) => ["WORKING", "REVIEWING"].includes(e.presence.status));
  const tex = getScreenTextures();

  return (
    <group>
      <ScreenAnimator />
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR.w, FLOOR.d]} />
        <meshStandardMaterial map={floorTex} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.26, 0]} receiveShadow>
        <boxGeometry args={[FLOOR.w + 0.4, 0.5, FLOOR.d + 0.4]} />
        <meshStandardMaterial color="#3a2a20" />
      </mesh>
      <FloorPatch x0={-15} x1={-6.5} z0={-10.5} z1={ROOM_Z} color="#6b4f3f" />
      <FloorPatch x0={-6.5} x1={1.2} z0={-10.5} z1={ROOM_Z} color="#8a8178" />
      <FloorPatch x0={1.2} x1={15} z0={-10.5} z1={ROOM_Z} color="#2f3340" />
      <FloorPatch x0={-14} x1={-6} z0={-0.4} z1={6.6} color="#c9a27e" y={0.006} />
      <FloorPatch x0={-3.2} x1={3.2} z0={-0.4} z1={2.6} color="#7d8c8a" y={0.006} />
      <FloorPatch x0={6} x1={15} z0={-0.4} z1={2.6} color="#9fb3a2" y={0.006} />
      <FloorPatch x0={4} x1={14.6} z0={6.8} z1={10.3} color="#d9b99b" y={0.006} />

      {/* outer walls (back + left) - the front and right are open for the isometric view */}
      <Wall from={[FLOOR.minX, FLOOR.minZ]} to={[-6.5, FLOOR.minZ]} material={accentWall} />
      <Wall from={[-6.5, FLOOR.minZ]} to={[1.2, FLOOR.minZ]} />
      <Wall from={[1.2, FLOOR.minZ]} to={[FLOOR.maxX, FLOOR.minZ]} material={postWall} />
      <Wall from={[FLOOR.minX, FLOOR.minZ]} to={[FLOOR.minX, FLOOR.maxZ]} />
      {/* windows on the left wall */}
      {[-1, 3, 7].map((z) => (
        <group key={z} position={[FLOOR.minX + 0.09, 1.6, z]}>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[2.6, 1.6]} />
            <meshStandardMaterial color="#ffd9a0" emissive="#ffb560" emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
          <mesh position={[0.02, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={frameMat}><boxGeometry args={[0.05, 1.6, 0.05]} /></mesh>
        </group>
      ))}
      <pointLight position={[FLOOR.minX + 1.2, 2, 3]} intensity={5} distance={9} color="#ffb870" />

      {/* room dividers */}
      <Wall from={[-6.5, FLOOR.minZ]} to={[-6.5, ROOM_Z]} h={WALL_H} t={0.12} />
      <Wall from={[1.2, FLOOR.minZ]} to={[1.2, ROOM_Z]} h={WALL_H} t={0.12} material={postWall} />
      <GlassFront x0={FLOOR.minX} x1={-6.5} z={ROOM_Z} doorX={-8} />
      <GlassFront x0={-6.5} x1={1.2} z={ROOM_Z} doorX={-0.6} />
      <GlassFront x0={1.2} x1={FLOOR.maxX} z={ROOM_Z} doorX={9.5} />

      {/* ---------- director's office ---------- */}
      <Bookshelf position={[-12.8, 0, -10.2]} width={2.2} />
      <Bookshelf position={[-9.4, 0, -10.2]} width={1.6} />
      <Sofa position={[-13.9, 0, -6.2]} rotationY={Math.PI / 2} seats={2} color="#4a3b33" />
      <Plant position={[-7.1, 0, -9.7]} scale={1.2} />
      <mesh position={[-11, 0.01, -7.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.0, 40]} />
        <meshStandardMaterial color="#7a2e2e" roughness={1} />
      </mesh>
      <PendantLamp position={[-11, 2.6, -7.4]} intensity={7} />

      {/* ---------- meeting room ---------- */}
      <group position={[MEETING_TABLE[0], 0, MEETING_TABLE[1]]}>
        <mesh position={[0, 0.74, 0]} material={mat.darkWood} castShadow receiveShadow><boxGeometry args={[5.0, 0.06, 1.3]} /></mesh>
        <mesh position={[-1.6, 0.37, 0]} material={mat.metal}><boxGeometry args={[0.1, 0.72, 0.8]} /></mesh>
        <mesh position={[1.6, 0.37, 0]} material={mat.metal}><boxGeometry args={[0.1, 0.72, 0.8]} /></mesh>
      </group>
      {Array.from({ length: 8 }, (_, k) => {
        const side = k < 4 ? -1 : 1;
        const x = MEETING_TABLE[0] - 2.1 + (k % 4) * 1.4;
        const z = MEETING_TABLE[1] + side * 1.15;
        return <Chair key={k} position={[x, 0, z]} rotationY={side < 0 ? 0 : Math.PI} color="#5b4636" />;
      })}
      <Whiteboard position={[-2.4, 1.6, -10.3]} />
      <Plant position={[0.6, 0, -9.8]} variant={1} />
      <PendantLamp position={[-3.4, 2.6, -7.2]} intensity={5} />
      <PendantLamp position={[-1.0, 2.6, -7.2]} intensity={5} />

      {/* ---------- editing / colour / sound suite ---------- */}
      <WallScreen position={[8.5, 1.75, -10.25]} texture={postActive ? tex.timeline : tex.idle} w={3.4} />
      {[2.0, 14.6].map((x) => (
        <mesh key={x} position={[x, 0.06, -7]} >
          <boxGeometry args={[0.05, 0.05, 6]} />
          <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[8.5, 2.95, -4.2]}>
        <boxGeometry args={[13.4, 0.04, 0.04]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight position={[8.5, 2.5, -7]} color="#a78bfa" intensity={4} distance={10} />
      {/* acoustic panels */}
      {[3, 4.2, 12.8, 14].map((x) => (
        <mesh key={x} position={[x, 1.7, -10.33]}><boxGeometry args={[1, 1.4, 0.08]} /><meshStandardMaterial color="#3b3f52" roughness={1} /></mesh>
      ))}
      <mesh position={[13.3, 0.5, -9.6]} material={mat.black} castShadow><boxGeometry args={[0.5, 1.0, 0.4]} /></mesh>
      <mesh position={[3.3, 0.5, -9.6]} material={mat.black} castShadow><boxGeometry args={[0.5, 1.0, 0.4]} /></mesh>

      {/* ---------- cinematography department ---------- */}
      <CameraRig position={[-2.8, 0, -1.6]} rotationY={0.6} />
      <LightStand position={[3.1, 0, -1.4]} rotationY={-0.7} />
      <LightStand position={[-3.0, 0, 3.4]} rotationY={0.9} color="#cfe2ff" />
      <mesh position={[0, 0.02, -1.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.26, 24]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>

      {/* ---------- lounge / break area ---------- */}
      <Sofa position={[10.2, 0, 9.75]} rotationY={Math.PI} seats={3} />
      <Sofa position={[13.95, 0, 7.7]} rotationY={-Math.PI / 2} seats={2} color="#6b705c" />
      <mesh position={[11.2, 0.22, 7.9]} material={mat.wood} castShadow receiveShadow><cylinderGeometry args={[0.7, 0.7, 0.06, 32]} /></mesh>
      <mesh position={[11.2, 0.1, 7.9]} material={mat.metal}><cylinderGeometry args={[0.05, 0.25, 0.2, 12]} /></mesh>
      <CoffeeBar position={[6.1, 0, 10.1]} />
      <Plant position={[14.4, 0, 9.9]} scale={1.3} />
      <Plant position={[4.3, 0, 10.0]} variant={1} />
      <PendantLamp position={[10.2, 2.6, 8.4]} intensity={6} />

      {/* plants around the floor */}
      <Plant position={[-14.3, 0, -3.3]} scale={1.1} variant={1} />
      <Plant position={[-5.4, 0, 9.6]} scale={1.2} />
      <Plant position={[4.5, 0, -0.2]} scale={0.9} variant={1} />
      <Plant position={[14.4, 0, -3.3]} scale={1.1} />
      <Bookshelf position={[-14.75, 0, 9.2]} rotationY={Math.PI / 2} width={1.6} />

      {/* ---------- workstations ---------- */}
      {deskIdx.map((i) => {
        const d = deskDef(i);
        const emp = byDesk.get(i);
        const atDesk = emp && !["IDLE", "IN_MEETING"].includes(emp.presence.status);
        const screen = screenFor(emp?.presence.status, Boolean(atDesk), d.zone);
        return (
          <group key={i}>
            <Desk position={[d.pos[0], 0, d.pos[1]]} monitors={d.monitors} screen={screen}
              accent={emp?.color ?? "#6b7280"} executive={d.zone === "director"} />
            <Chair position={[d.pos[0], 0, d.pos[1] + 0.95]} rotationY={Math.PI} color={emp ? "#2f3640" : "#4b5563"} />
          </group>
        );
      })}
      {[[-10, 1], [-10, 5], [3, 3], [9, 3]].map(([x, z], i) => (
        <PendantLamp key={i} position={[x, 2.8, z]} intensity={4} />
      ))}

      <ZoneLabel position={[-10.8, 3.4, -9.4]} text="Director's Office" />
      <ZoneLabel position={[-2.6, 3.4, -9.4]} text="Meeting Room" />
      <ZoneLabel position={[8.1, 3.4, -9.4]} text="Editing Suite" sub="Edit · Colour · Sound" />
      <ZoneLabel position={[-10, 0.1, 7.4]} text="Creative" />
      <ZoneLabel position={[0, 0.1, -0.3]} text="Cinematography" />
      <ZoneLabel position={[10.5, 0.1, -0.3]} text="Strategy" sub="Research · Marketing" />
      <ZoneLabel position={[9.5, 0.1, 6.5]} text="Break Area" />
    </group>
  );
}
