"use client";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useOffice, type Handoff } from "@/lib/store";
import type { Employee } from "@/lib/types";
import { Employee3D } from "./Employee3D";
import { LOUNGE_CAPACITY, type Spot, deskSeat, deskTop, loungeSpot, meetingSeat } from "./layout";
import { Office } from "./Office";
import { lowQuality } from "@/lib/quality";

/** Where each employee should be, derived only from their real status. */
function assignSpots(employees: Employee[]): Map<number, Spot> {
  const out = new Map<number, Spot>();
  const active = employees.filter((e) => e.active).sort((a, b) => a.id - b.id);
  const meeting = active.filter((e) => e.presence.status === "IN_MEETING");
  const idle = active.filter((e) => e.presence.status === "IDLE");
  meeting.forEach((e, i) => out.set(e.id, meetingSeat(i)));
  idle.forEach((e, i) => out.set(e.id, i < LOUNGE_CAPACITY ? loungeSpot(i) : deskSeat(e.desk)));
  active.forEach((e) => { if (!out.has(e.id)) out.set(e.id, deskSeat(e.desk)); });
  return out;
}

function Courier({ h, from, to }: { h: Handoff; from: THREE.Vector3; to: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  const DURATION = 2.2;
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, (Date.now() - h.at) / 1000 / DURATION);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    g.position.lerpVectors(from, to, e);
    g.position.y += Math.sin(e * Math.PI) * 2.4;
    g.rotation.y = e * Math.PI * 4;
    g.visible = k < 1;
  });
  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[0.3, 0.02, 0.4]} />
        <meshStandardMaterial color="#fff7e0" emissive="#fbbf24" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      {!lowQuality() && <pointLight color="#fbbf24" intensity={3} distance={3} />}
    </group>
  );
}

function Couriers({ employees }: { employees: Record<number, Employee> }) {
  const handoffs = useOffice((s) => s.handoffs);
  const live = handoffs.filter((h) => Date.now() - h.at < 3000);
  return (
    <>
      {live.map((h) => {
        const a = h.from_id != null ? employees[h.from_id] : undefined;
        const b = h.to_id != null ? employees[h.to_id] : undefined;
        if (!a) return null;
        const from = new THREE.Vector3(...deskTop(a.desk));
        // Deliveries to the owner fly out towards the viewer.
        const to = b ? new THREE.Vector3(...deskTop(b.desk)) : new THREE.Vector3(14, 6, 14);
        return <Courier key={h.id} h={h} from={from} to={to} />;
      })}
    </>
  );
}

export default function OfficeScene() {
  const employeesMap = useOffice((s) => s.employees);
  const streams = useOffice((s) => s.streams);
  const selected = useOffice((s) => s.selectedEmployee);
  const select = useOffice((s) => s.select);
  const employees = useMemo(() => Object.values(employeesMap), [employeesMap]);
  const spots = useMemo(() => assignSpots(employees), [employees]);
  const low = useMemo(() => lowQuality(), []);

  return (
    <Canvas shadows={!low} dpr={low ? 1 : [1, 2]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => select(null)}>
      <color attach="background" args={["#17110d"]} />
      <fog attach="fog" args={["#17110d", 60, 110]} />
      <OrthographicCamera makeDefault position={[26, 24, 26]} zoom={34} near={-100} far={300} />
      <OrbitControls target={[0, 0, 0]} enableDamping maxPolarAngle={Math.PI / 2.6} minPolarAngle={Math.PI / 6}
        minZoom={18} maxZoom={110} />
      <ambientLight intensity={0.35} color="#ffe2c2" />
      <hemisphereLight args={["#ffe9cf", "#3a2a1e", 0.55]} />
      <directionalLight position={[14, 22, 10]} intensity={1.6} color="#ffd29e" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20}
        shadow-camera-top={20} shadow-camera-bottom={-20} shadow-bias={-0.0004} />
      <Office employees={employees} />
      {employees.filter((e) => e.active).map((e) => {
        const spot = spots.get(e.id);
        return spot ? (
          <Employee3D key={e.id} employee={e} spot={spot} selected={selected === e.id}
            stream={streams[e.id]} onSelect={select} />
        ) : null;
      })}
      <Couriers employees={employeesMap} />
    </Canvas>
  );
}
