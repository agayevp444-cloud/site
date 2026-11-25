"use client";
import { ContactShadows, Html, RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Employee } from "@/lib/types";
import {
  CameraRig, Chair, CoffeeBar, GlowLogo, HoloWall, LedStrip, LightStand, Palm, PendantLamp, RoundTable,
  ScreenAnimator, Sofa, WaveDesk, Whiteboard, WoodPanel, concreteTexture, mats, ribbonGeometry, screenFor,
} from "./Furniture";
import { FLOOR, MEETING_TABLE, deskDef } from "./layout";

const WALL_H = 3.4;
const WALL_T = 0.4;
const ROOM_Z = -4; // front edge of the back rooms

const glassMat = new THREE.MeshPhysicalMaterial({ color: "#eaf4ff", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0 });
const frameMat = new THREE.MeshStandardMaterial({ color: "#e7e6e2", metalness: 0.4, roughness: 0.35 });

function Wall({ from, to, h = WALL_H, t = WALL_T, material }: {
  from: [number, number]; to: [number, number]; h?: number; t?: number; material: THREE.Material;
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

/** Frameless glass partition along x at z, with a door gap centred on doorX. */
function GlassFront({ x0, x1, z, doorX, doorW = 1.4 }: { x0: number; x1: number; z: number; doorX: number; doorW?: number }) {
  const segs: [number, number][] = [[x0, doorX - doorW / 2], [doorX + doorW / 2, x1]];
  return (
    <group>
      {segs.map(([a, b], i) => (
        <group key={i}>
          <mesh position={[(a + b) / 2, 1.3, z]} material={glassMat}><boxGeometry args={[b - a, 2.6, 0.03]} /></mesh>
          <mesh position={[(a + b) / 2, 0.03, z]} material={frameMat}><boxGeometry args={[b - a, 0.06, 0.06]} /></mesh>
          <mesh position={[(a + b) / 2, 2.6, z]} material={frameMat}><boxGeometry args={[b - a, 0.04, 0.05]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Rug({ x, z, w, d, color }: { x: number; z: number; w: number; d: number; color: string }) {
  return (
    <RoundedBox args={[w, 0.012, d]} radius={0.005} position={[x, 0.006, z]} receiveShadow>
      <meshStandardMaterial color={color} roughness={1} />
    </RoundedBox>
  );
}

function ZoneLabel({ position, text, sub }: { position: [number, number, number]; text: string; sub?: string }) {
  return (
    <Html position={position} center distanceFactor={18} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
      <div className="whitespace-nowrap text-center select-none">
        <div className="text-[12px] font-bold tracking-[0.28em] uppercase text-stone-700/70">{text}</div>
        {sub && <div className="text-[9px] tracking-[0.2em] uppercase text-stone-600/50">{sub}</div>}
      </div>
    </Html>
  );
}

/** The long flowing meeting table: a ribbon that dips to the floor at both ends. */
function MeetingTable() {
  const m = mats();
  const geo = useMemo(() => ribbonGeometry([
    [-3.0, 0.02], [-2.8, 0.1], [-2.55, 0.5], [-2.3, 0.74], [-1.6, 0.76], [1.6, 0.76], [2.25, 0.74], [2.5, 0.45], [2.7, 0.08], [2.95, 0.02],
  ], 0.07, 1.3), []);
  return (
    <group position={[MEETING_TABLE[0], 0, MEETING_TABLE[1]]}>
      <mesh geometry={geo} material={m.wood} castShadow receiveShadow />
      {[[-1.4, 0.1], [0.2, -0.15], [1.3, 0.12]].map(([x, z], i) => (
        <RoundedBox key={i} args={[0.32, 0.015, 0.22]} radius={0.006} position={[x, 0.8, z]} rotation={[0, i * 0.4 - 0.4, 0]} material={m.graphite} />
      ))}
    </group>
  );
}

export function Office({ employees }: { employees: Employee[] }) {
  const m = mats();
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ map: concreteTexture(212, 21, [3, 2], 0.35), roughness: 0.45, metalness: 0.05 }), []);
  const slabMat = useMemo(() => new THREE.MeshStandardMaterial({ map: concreteTexture(150, 4, [6, 1]), roughness: 0.95 }), []);
  const wallMat = m.concrete;

  const byDesk = useMemo(() => {
    const map = new Map<number, Employee>();
    employees.filter((e) => e.active).forEach((e) => map.set(e.desk, e));
    return map;
  }, [employees]);
  const deskIdx = useMemo(() => {
    const extra = employees.filter((e) => e.active && e.desk >= 16).map((e) => e.desk);
    return [...Array.from({ length: 16 }, (_, i) => i), ...extra];
  }, [employees]);
  // Hologram wall energy: share of the team that is really working right now.
  const active = employees.filter((e) => e.active);
  const energy = active.length ? active.filter((e) => ["WORKING", "THINKING", "REVIEWING", "IN_MEETING"].includes(e.presence.status)).length / active.length : 0;

  const W = FLOOR;
  return (
    <group>
      <ScreenAnimator />

      {/* ---------- floating concrete diorama ---------- */}
      <mesh position={[0, -0.45, 0]} material={slabMat} receiveShadow castShadow>
        <boxGeometry args={[W.w + WALL_T * 2, 0.9, W.d + WALL_T * 2]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} material={floorMat} receiveShadow>
        <planeGeometry args={[W.w, W.d]} />
      </mesh>
      <ContactShadows position={[0, -0.95, 0]} scale={60} blur={3.2} opacity={0.35} far={6} frames={1} resolution={512} color="#4a453f" />

      {/* outer walls: back and left, cut away at the front like a model */}
      <Wall from={[W.minX - WALL_T, W.minZ - WALL_T / 2]} to={[W.maxX + WALL_T, W.minZ - WALL_T / 2]} material={wallMat} />
      <Wall from={[W.minX - WALL_T / 2, W.minZ - WALL_T]} to={[W.minX - WALL_T / 2, W.maxZ + WALL_T]} material={wallMat} />

      {/* LED line tracing the wall tops, curving round the corner */}
      <LedStrip points={[[W.maxX, WALL_H - 0.25, W.minZ + 0.02], [-8, WALL_H - 0.25, W.minZ + 0.02], [W.minX + 0.6, WALL_H - 0.25, W.minZ + 0.15],
        [W.minX + 0.02, WALL_H - 0.25, W.minZ + 1.2], [W.minX + 0.02, WALL_H - 0.25, W.maxZ]]} />

      {/* room dividers */}
      <Wall from={[-6.5, W.minZ]} to={[-6.5, ROOM_Z]} t={0.24} material={wallMat} />
      <Wall from={[1.2, W.minZ]} to={[1.2, ROOM_Z]} t={0.24} material={wallMat} />
      <RoundedBox args={[0.34, WALL_H, 0.34]} radius={0.15} position={[-6.5, WALL_H / 2, ROOM_Z]} material={m.wood} castShadow />
      <RoundedBox args={[0.34, WALL_H, 0.34]} radius={0.15} position={[1.2, WALL_H / 2, ROOM_Z]} material={m.wood} castShadow />
      <GlassFront x0={W.minX} x1={-6.65} z={ROOM_Z} doorX={-8} />
      <GlassFront x0={-6.35} x1={1.05} z={ROOM_Z} doorX={-0.6} />
      <GlassFront x0={1.35} x1={W.maxX} z={ROOM_Z} doorX={9.5} />

      {/* ---------- Director's office ---------- */}
      <WoodPanel position={[-11, 0, W.minZ + 0.02]} w={5.4} h={2.9} r={0.9} />
      <GlowLogo position={[-11, 2.1, W.minZ + 0.16]} width={2.2} />
      <Sofa position={[-14.25, 0, -6.6]} rotationY={Math.PI / 2} seats={2} />
      <Palm position={[-7.2, 0, -9.8]} scale={1.15} planter="round" seed={2} />
      <Rug x={-11} z={-7.1} w={4.2} d={3.2} color="#d2cabd" />
      <PendantLamp position={[-11, 2.7, -7.2]} intensity={5} />

      {/* ---------- Meeting room: the glowing wordmark wall ---------- */}
      <GlowLogo position={[-2.7, 2.05, W.minZ + 0.02]} width={4.2} />
      <MeetingTable />
      {Array.from({ length: 8 }, (_, k) => {
        const side = k < 4 ? -1 : 1;
        const x = MEETING_TABLE[0] - 2.1 + (k % 4) * 1.4;
        const z = MEETING_TABLE[1] + side * 1.15;
        return <Chair key={k} position={[x, 0, z]} rotationY={side < 0 ? 0 : Math.PI} />;
      })}
      <Whiteboard position={[-6.25, 1.5, -7.2]} rotationY={Math.PI / 2} />
      <Palm position={[0.55, 0, -9.85]} scale={1.05} planter="box" seed={5} />

      {/* ---------- Editing suite: hologram projection wall ---------- */}
      <HoloWall position={[8.1, 1.75, W.minZ + 0.01]} size={[12.6, 2.9]} energy={energy} />
      <Palm position={[14.5, 0, -4.7]} scale={1.1} planter="round" seed={9} />

      {/* ---------- workstation wall panels (creative wall) ---------- */}
      <WoodPanel position={[W.minX + 0.02, 0, -0.2]} rotationY={Math.PI / 2} w={4.4} h={2.5} r={0.8} />
      <WoodPanel position={[W.minX + 0.02, 0, 5.4]} rotationY={Math.PI / 2} w={4.4} h={2.5} r={0.8} />

      {/* ---------- Cinematography ---------- */}
      <CameraRig position={[-2.8, 0, -1.6]} rotationY={0.6} />
      <LightStand position={[3.1, 0, -1.4]} rotationY={-0.7} />
      <LightStand position={[-3.0, 0, 3.4]} rotationY={0.9} color="#dbe8ff" />
      <Rug x={0} z={1.1} w={6.4} d={3.0} color="#d9d1c4" />
      <Rug x={10.5} z={1.1} w={8.6} d={3.0} color="#d9d1c4" />
      <Rug x={-10} z={3.1} w={7.6} d={7.0} color="#dcd4c7" />

      {/* ---------- Break area ---------- */}
      <Sofa position={[10.2, 0, 9.75]} rotationY={Math.PI} seats={3} />
      <Sofa position={[13.95, 0, 7.7]} rotationY={-Math.PI / 2} seats={2} color="#a7a29a" />
      <RoundTable position={[11.2, 0, 7.9]} />
      <CoffeeBar position={[6.1, 0, 10.1]} />
      <Palm position={[14.4, 0, 9.85]} scale={1.3} planter="box" seed={11} />
      <Palm position={[4.1, 0, 9.9]} scale={0.95} planter="round" seed={4} />
      <PendantLamp position={[10.2, 2.7, 8.4]} intensity={4} />
      {/* floor LED lines sweeping round the break area and along the corridor */}
      <LedStrip radius={0.03} points={[[3.7, 0.02, 10.4], [3.9, 0.02, 7.2], [5.2, 0.02, 6.45], [9, 0.02, 6.4], [14.7, 0.02, 6.35]]} />
      <LedStrip radius={0.03} points={[[W.minX + 0.1, 0.02, -3.55], [-9, 0.02, -3.55], [-6.8, 0.02, -3.45], [-6.2, 0.02, -3.2]]} />

      {/* greenery across the floor */}
      <Palm position={[-14.3, 0, -3.3]} scale={1.15} planter="box" seed={3} />
      <Palm position={[-5.2, 0, 9.7]} scale={1.25} planter="box" seed={6} fronds={13} />
      <Palm position={[4.6, 0, -0.1]} scale={0.95} planter="round" seed={8} />
      <Palm position={[14.4, 0, -3.3]} scale={1.1} planter="box" seed={12} />
      <Palm position={[-14.2, 0, 9.7]} scale={1.2} planter="round" seed={14} />

      {/* ---------- workstations ---------- */}
      {deskIdx.map((i) => {
        const d = deskDef(i);
        const emp = byDesk.get(i);
        const atDesk = emp && !["IDLE", "IN_MEETING"].includes(emp.presence.status);
        const screen = screenFor(emp?.presence.status, Boolean(atDesk), d.zone);
        return (
          <group key={i}>
            <WaveDesk position={[d.pos[0], 0, d.pos[1]]} monitors={d.monitors} screen={screen}
              accent={emp?.color ?? "#bdbab4"} executive={d.zone === "director"} />
            <Chair position={[d.pos[0], 0, d.pos[1] + 0.95]} rotationY={Math.PI} color={emp?.color} />
          </group>
        );
      })}
      {[[-10, 1], [-10, 5], [0, 3], [10.5, 3]].map(([x, z], i) => (
        <PendantLamp key={i} position={[x, 2.9, z]} intensity={3.5} />
      ))}

      <ZoneLabel position={[-11, 3.75, -9.6]} text="Direktor kabineti" />
      <ZoneLabel position={[-2.7, 3.75, -9.6]} text="İclas otağı" />
      <ZoneLabel position={[8.1, 3.75, -9.6]} text="Montaj studiyası" sub="Montaj · Rəng · Səs" />
      <ZoneLabel position={[-10, 0.1, 7.3]} text="Kreativ" />
      <ZoneLabel position={[0, 0.1, -0.5]} text="Kinematoqrafiya" />
      <ZoneLabel position={[10.5, 0.1, -0.5]} text="Strategiya" sub="Tədqiqat · Marketinq" />
      <ZoneLabel position={[9.5, 0.1, 6.0]} text="İstirahət zonası" />
    </group>
  );
}
