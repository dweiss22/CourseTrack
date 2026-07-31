"use client";

import { useEffect, useState } from "react";
import { Database, LoaderCircle } from "lucide-react";

type RuntimeStatus = "starting" | "ready" | "fallback";

export function RuntimeInitializer() {
  const [status, setStatus] = useState<RuntimeStatus>("starting");

  useEffect(() => {
    let active = true;
    fetch("/api/bootstrap")
      .then((response) => response.json())
      .then((result: { available?: boolean }) => {
        if (active) setStatus(result.available ? "ready" : "fallback");
      })
      .catch(() => {
        if (active) setStatus("fallback");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="runtime-status" aria-live="polite">
      {status === "starting" ? (
        <LoaderCircle size={14} className="spin" aria-hidden="true" />
      ) : (
        <Database size={14} aria-hidden="true" />
      )}
      <span>
        {status === "starting"
          ? "Preparing sample workspace"
          : status === "ready"
            ? "Supabase database ready"
            : "Sample data fallback active"}
      </span>
    </div>
  );
}
