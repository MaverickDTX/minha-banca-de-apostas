import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { EASE } from "@/lib/motion";

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (n) => format(n));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const controls = animate(mv, value, { duration: 0.7, ease: EASE.out });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span>{text}</motion.span>;
}
