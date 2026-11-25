"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { EmployeePanel } from "@/components/ui/EmployeePanel";
import { Roster } from "@/components/ui/Roster";
import { TaskBoard } from "@/components/ui/TaskBoard";
import { TaskModal } from "@/components/ui/TaskModal";
import { TopBar } from "@/components/ui/TopBar";
import { API_URL } from "@/lib/api";
import { useOffice } from "@/lib/store";
import { useLiveOffice } from "@/lib/useLiveOffice";

const OfficeScene = dynamic(() => import("@/components/office/OfficeScene"), { ssr: false });

export default function Page() {
  useLiveOffice();
  const loaded = useOffice((s) => s.loaded);
  const connected = useOffice((s) => s.connected);
  const selected = useOffice((s) => s.selectedEmployee);
  const toast = useOffice((s) => s.toast);
  const setToast = useOffice((s) => s.setToast);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">{loaded && <OfficeScene />}</div>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <div className="text-sm">{connected ? "Loading the office…" : `Connecting to the backend at ${API_URL}…`}</div>
          {!connected && <div className="text-xs text-white/40">Start it with ./start.sh (see README)</div>}
        </div>
      )}
      <TopBar />
      {loaded && (
        <>
          <div className={`absolute left-3 top-16 bottom-20 z-20 w-[320px] transition-transform ${left ? "" : "-translate-x-[340px]"}`}>
            <TaskBoard />
          </div>
          <button onClick={() => setLeft(!left)} className="panel absolute bottom-20 z-20 px-2 py-1 text-[10px] text-white/60 transition-all"
            style={{ left: left ? 340 : 12 }}>{left ? "◀ Tasks" : "▶ Tasks"}</button>
          {!selected && (
            <div className={`absolute right-3 top-16 bottom-20 z-20 w-[340px] transition-transform ${right ? "" : "translate-x-[360px]"}`}>
              <ActivityFeed />
            </div>
          )}
          {!selected && (
            <button onClick={() => setRight(!right)} className="panel absolute bottom-20 z-20 px-2 py-1 text-[10px] text-white/60"
              style={{ right: right ? 360 : 12 }}>{right ? "Feed ▶" : "◀ Feed"}</button>
          )}
          <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-center pointer-events-none"><Roster /></div>
          <EmployeePanel />
          <TaskModal />
        </>
      )}
      {toast && (
        <div className="panel absolute bottom-24 left-1/2 z-[60] -translate-x-1/2 px-4 py-2 text-xs text-white">{toast}</div>
      )}
    </main>
  );
}
