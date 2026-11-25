"use client";
import { useEffect } from "react";
import { api, WS_URL } from "./api";
import { useOffice } from "./store";
import type { OfficeState } from "./types";

/** Loads the full office state, then keeps it live over the WebSocket (with reconnect + resync). */
export function useLiveOffice() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const { load, apply, setConnected } = useOffice.getState();

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = async () => {
        setConnected(true);
        try {
          load(await api.get<OfficeState>("/api/state"));
        } catch (e) {
          useOffice.getState().setToast(`Could not load state: ${(e as Error).message}`);
        }
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 20000);
      };
      ws.onmessage = (m) => {
        try {
          const { event, data } = JSON.parse(m.data);
          if (event !== "pong") apply(event, data);
        } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        if (ping) clearInterval(ping);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      if (ping) clearInterval(ping);
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);
}
