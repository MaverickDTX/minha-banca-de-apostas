import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

export function StatusBadgePop({ status, children }: { status: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const scale = useMotionValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce) return;
    const c = animate(scale, [1, 1.04, 1], { duration: 0.18, ease: EASE.inOut });
    return () => c.stop();
  }, [status, reduce, scale]);
  return <motion.span style={{ scale, display: "inline-block" }}>{children}</motion.span>;
}
