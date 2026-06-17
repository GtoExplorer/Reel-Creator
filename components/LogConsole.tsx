"use client";
import { useEffect, useRef } from "react";

export function LogConsole({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  if (!text) return null;
  return (
    <pre ref={ref} className={`logbox mt-3 max-h-56 ${className}`}>
      {text}
    </pre>
  );
}
