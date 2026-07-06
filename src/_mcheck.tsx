import { motion, type Variants } from "framer-motion";
import { DUR, EASE, RISE, STAGGER } from "@/lib/motion";

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.1 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: RISE },
  visible: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE.out } },
};

export default function MCheck() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible">
      <motion.div variants={fadeUp} />
    </motion.div>
  );
}
