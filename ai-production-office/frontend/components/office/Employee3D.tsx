"use client";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { STATUS_META } from "@/lib/status";
import type { Employee, Status } from "@/lib/types";
import { CORRIDOR_Z, type Spot, type V2, route } from "./layout";

const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#d1a17a"];
const HAIR = ["#2c1b10", "#4a2c1a", "#0f0f0f", "#a0522d", "#d9b38c", "#6b4423", "#3b3b3b"];
const WALK_SPEED = 2.4;

function hash(n: number) {
  return Math.abs(Math.sin(n * 91.7) * 43758.5453) % 1;
}

interface Props {
  employee: Employee;
  spot: Spot;
  selected: boolean;
  stream?: { text: string; at: number };
  onSelect: (id: number) => void;
}

/**
 * A procedurally animated employee. Its pose is a pure function of the agent's real status
 * (from the backend) and where it is walking; no animation runs that the status doesn't call for.
 */
export function Employee3D({ employee, spot, selected, stream, onSelect }: Props) {
  const status: Status = employee.presence.status;
  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const shinL = useRef<THREE.Group>(null);
  const shinR = useRef<THREE.Group>(null);
  const paper = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  const look = useMemo(() => ({
    skin: SKIN[Math.floor(hash(employee.id) * SKIN.length)],
    hair: HAIR[Math.floor(hash(employee.id + 7) * HAIR.length)],
    long: hash(employee.id + 3) > 0.5,
    pants: hash(employee.id + 11) > 0.5 ? "#2d3142" : "#4a4e69",
  }), [employee.id]);

  // movement state
  const current = useRef<Spot>(spot);
  const waypoints = useRef<V2[]>([]);
  const [walking, setWalking] = useState(false);
  const walkingRef = useRef(false);
  const statusSince = useRef(performance.now());

  useEffect(() => {
    statusSince.current = performance.now();
  }, [status]);

  useEffect(() => {
    const g = root.current;
    if (!g) return;
    if (current.current.id === spot.id && !walkingRef.current) return;
    const pts = walkingRef.current
      ? [[g.position.x, CORRIDOR_Z] as V2, ...[...spot.path].reverse()]
      : route(current.current, spot);
    waypoints.current = pts;
    current.current = spot;
    walkingRef.current = true;
    setWalking(true);
  }, [spot]);

  // initial placement
  useEffect(() => {
    const g = root.current;
    if (g) {
      g.position.set(spot.pos[0], 0, spot.pos[1]);
      g.rotation.y = spot.rot;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(({ clock }, dt) => {
    const g = root.current;
    if (!g || !hips.current) return;
    const t = clock.elapsedTime + employee.id * 1.7;
    const sinceStatus = (performance.now() - statusSince.current) / 1000;
    let moving = false;

    if (walkingRef.current) {
      const target = waypoints.current[0];
      if (!target) {
        walkingRef.current = false;
        setWalking(false);
      } else {
        const dx = target[0] - g.position.x;
        const dz = target[1] - g.position.z;
        const dist = Math.hypot(dx, dz);
        const step = WALK_SPEED * Math.min(dt, 0.05);
        if (dist <= step) {
          g.position.x = target[0];
          g.position.z = target[1];
          waypoints.current.shift();
        } else {
          g.position.x += (dx / dist) * step;
          g.position.z += (dz / dist) * step;
          const want = Math.atan2(dx, dz);
          g.rotation.y = lerpAngle(g.rotation.y, want, Math.min(1, dt * 10));
          moving = true;
        }
      }
    }
    if (!moving && !walkingRef.current) {
      g.rotation.y = lerpAngle(g.rotation.y, spot.rot, Math.min(1, dt * 6));
    }

    const sitting = !moving && !walkingRef.current && spot.pose === "sit";
    const seatH = spot.seatHeight ?? 0.48;
    const hipTarget = sitting ? seatH + 0.06 : 0.9;
    hips.current.position.y = THREE.MathUtils.lerp(hips.current.position.y, hipTarget, Math.min(1, dt * 8));
    // sit slightly back into the chair
    hips.current.position.z = THREE.MathUtils.lerp(hips.current.position.z, sitting ? -0.12 : 0, Math.min(1, dt * 8));

    // ----- legs
    let lL = 0, lR = 0, kL = 0, kR = 0;
    if (moving) {
      const s = Math.sin(t * 9);
      lL = s * 0.55; lR = -s * 0.55;
      kL = Math.max(0, -s) * 0.7; kR = Math.max(0, s) * 0.7;
      hips.current.position.y = 0.9 + Math.abs(Math.cos(t * 9)) * 0.04;
    } else if (sitting) {
      lL = lR = -Math.PI / 2;
      kL = kR = Math.PI / 2;
    }
    legL.current!.rotation.x = damp(legL.current!.rotation.x, lL, dt);
    legR.current!.rotation.x = damp(legR.current!.rotation.x, lR, dt);
    shinL.current!.rotation.x = damp(shinL.current!.rotation.x, kL, dt);
    shinR.current!.rotation.x = damp(shinR.current!.rotation.x, kR, dt);

    // ----- upper body by status
    let aL = 0, aR = 0, zL = 0.08, zR = -0.08, headX = 0, headY = 0, lean = 0;
    let showPaper = false;
    if (moving) {
      const s = Math.sin(t * 9);
      aL = -s * 0.5; aR = s * 0.5;
      if (status === "COMPLETED" || status === "REVIEWING") showPaper = true;
    } else {
      switch (status) {
        case "WORKING": // typing
          aL = -1.25 + Math.sin(t * 22) * 0.07;
          aR = -1.25 + Math.sin(t * 22 + 1.6) * 0.07;
          zL = 0.2; zR = -0.2;
          headX = 0.12 + Math.sin(t * 1.3) * 0.03;
          lean = 0.12;
          break;
        case "THINKING": // hand on chin, gaze drifting
          aL = -1.15; zL = 0.25;
          aR = -2.3; zR = 0.55;
          headX = -0.15 + Math.sin(t * 0.8) * 0.05;
          headY = Math.sin(t * 0.6) * 0.35;
          break;
        case "REVIEWING": // reading a document
          aL = -1.0; aR = -1.0; zL = 0.35; zR = -0.35;
          headX = 0.35 + Math.sin(t * 0.7) * 0.05;
          headY = Math.sin(t * 0.9) * 0.15;
          showPaper = true;
          break;
        case "IN_MEETING": // talking with gestures
          aL = -0.7 + Math.sin(t * 2.2) * 0.35;
          aR = -0.9 + Math.sin(t * 2.6 + 1) * 0.4;
          headY = Math.sin(t * 0.9) * 0.4;
          headX = Math.sin(t * 3.1) * 0.06;
          break;
        case "WAITING": // arms crossed, glancing around
          aL = -1.35; aR = -1.35; zL = 0.75; zR = -0.75;
          headY = Math.sin(t * 0.5) * 0.6;
          lean = -0.1;
          break;
        case "COMPLETED":
          if (sinceStatus < 2.5) {
            aR = -3.0 + Math.sin(t * 10) * 0.15; zR = -0.2;
          } else {
            aL = -0.4; aR = -0.4; lean = -0.12; headX = -0.1;
          }
          break;
        case "ERROR":
          aL = -0.8; aR = -0.8; zL = 0.4; zR = -0.4;
          headX = 0.55; lean = 0.2;
          break;
        case "PAUSED":
          aL = -0.5; aR = -0.5;
          break;
        case "IDLE":
        default:
          if (spot.pose === "stand") { // coffee in hand
            aR = -1.3; zR = -0.1;
            headY = Math.sin(t * 0.4) * 0.3;
          } else {
            aL = -0.35; aR = -0.35; lean = -0.15;
            headY = Math.sin(t * 0.3) * 0.25;
          }
      }
    }
    armL.current!.rotation.x = damp(armL.current!.rotation.x, aL, dt);
    armR.current!.rotation.x = damp(armR.current!.rotation.x, aR, dt);
    armL.current!.rotation.z = damp(armL.current!.rotation.z, zL, dt);
    armR.current!.rotation.z = damp(armR.current!.rotation.z, zR, dt);
    head.current!.rotation.x = damp(head.current!.rotation.x, headX, dt);
    head.current!.rotation.y = damp(head.current!.rotation.y, headY, dt);
    torso.current!.rotation.x = damp(torso.current!.rotation.x, lean, dt);
    if (paper.current) paper.current.visible = showPaper;

    if (halo.current) {
      const m = halo.current.material as THREE.MeshBasicMaterial;
      m.opacity = selected ? 0.55 + Math.sin(t * 4) * 0.15 : status === "ERROR" ? 0.35 + Math.sin(t * 6) * 0.25 : 0.22;
    }
  });

  const meta = STATUS_META[status];
  const showStream = stream && Date.now() - stream.at < 5000 && ["WORKING", "REVIEWING", "IN_MEETING"].includes(status);

  return (
    <group
      ref={root}
      onClick={(e) => { e.stopPropagation(); onSelect(employee.id); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = "auto"; }}
    >
      {/* status halo on the floor */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.38, 0.5, 32]} />
        <meshBasicMaterial color={selected ? "#fde68a" : meta.color} transparent opacity={0.3} />
      </mesh>
      <group ref={hips} position={[0, 0.9, 0]}>
        {/* legs */}
        {([[-0.11, legL, shinL], [0.11, legR, shinR]] as const).map(([x, leg, shin], i) => (
          <group key={i} ref={leg} position={[x, 0, 0]}>
            <mesh position={[0, -0.22, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.3, 4, 8]} />
              <meshStandardMaterial color={look.pants} />
            </mesh>
            <group ref={shin} position={[0, -0.44, 0]}>
              <mesh position={[0, -0.2, 0]} castShadow>
                <capsuleGeometry args={[0.065, 0.3, 4, 8]} />
                <meshStandardMaterial color={look.pants} />
              </mesh>
              <mesh position={[0, -0.42, 0.05]} castShadow>
                <boxGeometry args={[0.12, 0.07, 0.24]} />
                <meshStandardMaterial color="#1b1b1b" />
              </mesh>
            </group>
          </group>
        ))}
        {/* torso + head + arms */}
        <group ref={torso}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <capsuleGeometry args={[0.19, 0.36, 6, 12]} />
            <meshStandardMaterial color={employee.color} roughness={0.7} />
          </mesh>
          {employee.is_director && (
            <mesh position={[0, 0.38, 0.17]} castShadow>
              <boxGeometry args={[0.06, 0.3, 0.04]} />
              <meshStandardMaterial color="#7f1d1d" />
            </mesh>
          )}
          <group ref={head} position={[0, 0.74, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.15, 20, 16]} />
              <meshStandardMaterial color={look.skin} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.04, -0.02]} scale={[1.05, look.long ? 1.05 : 0.9, 1.05]} castShadow>
              <sphereGeometry args={[0.155, 20, 16, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
              <meshStandardMaterial color={look.hair} roughness={0.9} />
            </mesh>
            {look.long && (
              <mesh position={[0, -0.08, -0.09]} castShadow>
                <boxGeometry args={[0.27, 0.26, 0.1]} />
                <meshStandardMaterial color={look.hair} roughness={0.9} />
              </mesh>
            )}
            {[-0.05, 0.05].map((x) => (
              <mesh key={x} position={[x, 0.01, 0.135]}>
                <sphereGeometry args={[0.018, 8, 8]} />
                <meshBasicMaterial color="#1a1a1a" />
              </mesh>
            ))}
          </group>
          {([[-0.25, armL], [0.25, armR]] as const).map(([x, arm], i) => (
            <group key={i} ref={arm} position={[x, 0.52, 0]}>
              <mesh position={[0, -0.24, 0]} castShadow>
                <capsuleGeometry args={[0.06, 0.36, 4, 8]} />
                <meshStandardMaterial color={employee.color} roughness={0.7} />
              </mesh>
              <mesh position={[0, -0.47, 0]} castShadow>
                <sphereGeometry args={[0.055, 10, 8]} />
                <meshStandardMaterial color={look.skin} />
              </mesh>
            </group>
          ))}
          <mesh ref={paper} position={[0, 0.25, 0.42]} rotation={[-0.9, 0, 0]} visible={false}>
            <planeGeometry args={[0.26, 0.34]} />
            <meshStandardMaterial color="#fafafa" side={THREE.DoubleSide} emissive="#ffffff" emissiveIntensity={0.15} />
          </mesh>
        </group>
      </group>

      <Html position={[0, 2.25, 0]} center distanceFactor={14} zIndexRange={[20, 10]}>
        <div
          onClick={() => onSelect(employee.id)}
          className={`flex flex-col items-center gap-1 cursor-pointer select-none transition-transform ${selected ? "scale-110" : ""}`}
        >
          {showStream && (
            <div className="max-w-[220px] rounded-lg bg-black/75 px-2 py-1 text-[10px] leading-snug text-gray-100 shadow-lg backdrop-blur line-clamp-3 font-mono">
              {stream!.text.slice(-140)}
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 shadow-lg ring-1 ring-white/10 backdrop-blur whitespace-nowrap">
            <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
            <span className="text-[11px] font-semibold text-white">{employee.name.split(" ")[0]}</span>
            <span className="text-[9px] font-bold tracking-wider" style={{ color: meta.color }}>
              {walking ? `↗ ${meta.label}` : meta.label}
            </span>
          </div>
          <div className="text-[9px] text-white/60 whitespace-nowrap drop-shadow">{employee.title}</div>
        </div>
      </Html>
    </group>
  );
}

function damp(cur: number, target: number, dt: number) {
  return THREE.MathUtils.lerp(cur, target, Math.min(1, dt * 7));
}

function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
