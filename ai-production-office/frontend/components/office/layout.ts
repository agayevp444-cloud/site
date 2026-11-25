/**
 * Office floor plan (metres, x/z on the floor). Every place a person can be is a Spot with a
 * walkable path to the main corridor, so movement between any two spots is
 * spot -> corridor -> spot without walking through furniture.
 */
export type V2 = [number, number];

export interface Spot {
  id: string;
  pos: V2;
  /** Y rotation the person faces when settled. */
  rot: number;
  pose: "sit" | "stand";
  seatHeight?: number;
  /** Waypoints from the spot out to the corridor (last point lies on the corridor). */
  path: V2[];
}

export interface DeskDef {
  index: number;
  pos: V2;
  rot: number;
  zone: "director" | "creative" | "camera" | "strategy" | "post" | "qc" | "open";
  monitors: number;
}

export const CORRIDOR_Z = -2.8;
export const FLOOR = { w: 30, d: 21, minX: -15, maxX: 15, minZ: -10.5, maxZ: 10.5 };

const D: [number, V2, DeskDef["zone"], number][] = [
  [0, [-11, -7.4], "director", 2],
  [1, [-11.5, 1], "creative", 1],
  [2, [-8.5, 1], "creative", 1],
  [3, [-1.5, 1], "camera", 2],
  [4, [5, -7.4], "post", 3],
  [5, [8.5, -7.4], "post", 3],
  [6, [12, -7.4], "post", 2],
  [7, [7.5, 1], "strategy", 2],
  [8, [10.5, 1], "strategy", 1],
  [9, [-1.5, 5], "qc", 2],
  [10, [-11.5, 5], "open", 1],
  [11, [-8.5, 5], "open", 1],
  [12, [1.5, 1], "camera", 1],
  [13, [1.5, 5], "open", 1],
  [14, [13.5, 1], "strategy", 1],
  [15, [7.5, 5], "open", 1],
];

const ROOM_DOORS: Record<string, number> = { director: -8, post: 9.5 };

export function deskDef(index: number): DeskDef {
  const found = D.find((d) => d[0] === index);
  if (found) return { index, pos: found[1], rot: 0, zone: found[2], monitors: found[3] };
  // Overflow desks for newly hired employees: back row of the open floor.
  const k = index - 16;
  const xs = [-11.5, -8.5, -1.5, 1.5];
  return { index, pos: [xs[k % xs.length], 8.6], rot: 0, zone: "open", monitors: 1 };
}

export function deskSeat(index: number): Spot {
  const d = deskDef(index);
  const [x, z] = d.pos;
  const seat: V2 = [x, z + 0.95];
  let path: V2[];
  if (d.zone === "director" || d.zone === "post") {
    const door = ROOM_DOORS[d.zone];
    path = [seat, [x, -5.3], [door, -5.3], [door, -4.2], [door, CORRIDOR_Z]];
  } else {
    const lane = x + 1.5;
    path = [seat, [lane, seat[1]], [lane, CORRIDOR_Z]];
  }
  return { id: `desk-${index}`, pos: seat, rot: Math.PI, pose: "sit", seatHeight: 0.48, path };
}

export const MEETING_TABLE: V2 = [-2.2, -7.2];
const MEETING_DOOR = -0.6;

export function meetingSeat(i: number): Spot {
  const n = 8;
  const k = i % n;
  const side = k < 4 ? -1 : 1; // north / south side of the long table
  const x = MEETING_TABLE[0] - 2.1 + (k % 4) * 1.4;
  const z = MEETING_TABLE[1] + side * 1.05;
  return {
    id: `meeting-${k}`, pos: [x, z], rot: side < 0 ? 0 : Math.PI, pose: "sit", seatHeight: 0.48,
    // North-side seats walk round the table end before heading for the door.
    path: side < 0
      ? [[x, z], [-5.6, z], [-5.6, -5.2], [MEETING_DOOR, -5.2], [MEETING_DOOR, -4.2], [MEETING_DOOR, CORRIDOR_Z]]
      : [[x, z], [x, -5.2], [MEETING_DOOR, -5.2], [MEETING_DOOR, -4.2], [MEETING_DOOR, CORRIDOR_Z]],
  };
}

/** Break area (front-right): sofa seats and the coffee bar. */
const LOUNGE: { pos: V2; rot: number; pose: "sit" | "stand" }[] = [
  { pos: [9.2, 9.2], rot: Math.PI, pose: "sit" },
  { pos: [10.2, 9.2], rot: Math.PI, pose: "sit" },
  { pos: [11.2, 9.2], rot: Math.PI, pose: "sit" },
  { pos: [13.4, 8.2], rot: -Math.PI / 2, pose: "sit" },
  { pos: [13.4, 7.2], rot: -Math.PI / 2, pose: "sit" },
  { pos: [5.6, 9.4], rot: 0, pose: "stand" },
  { pos: [6.6, 9.4], rot: 0, pose: "stand" },
  { pos: [4.6, 8.7], rot: Math.PI / 4, pose: "stand" },
  { pos: [7.4, 8.4], rot: -Math.PI / 3, pose: "stand" },
];

export const LOUNGE_CAPACITY = LOUNGE.length;

export function loungeSpot(i: number): Spot {
  const l = LOUNGE[i % LOUNGE.length];
  return {
    id: `lounge-${i}`, pos: l.pos, rot: l.rot, pose: l.pose, seatHeight: 0.42,
    path: [l.pos, [l.pos[0], 7.6], [4.5, 7.6], [4.5, CORRIDOR_Z]],
  };
}

/** Route between two spots: out of A to the corridor, along it, then into B. */
export function route(a: Spot, b: Spot): V2[] {
  if (a.id === b.id) return [b.pos];
  return [...a.path, ...[...b.path].reverse()];
}

export function deskTop(index: number): [number, number, number] {
  const d = deskDef(index);
  return [d.pos[0], 1.05, d.pos[1]];
}
