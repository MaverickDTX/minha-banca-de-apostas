// src/lib/motion.ts
// Fonte única da verdade da linguagem de movimento do app (MOTION-SPEC §1).
// Importar destes tokens em todo lugar — nada de durações/easings soltos por componente.

export const EASE = {
  out: [0.16, 1, 0.3, 1], // reveal / entrada (expo-out)
  inOut: [0.65, 0, 0.35, 1], // transição de estado
} as const;

export const DUR = {
  micro: 0.16, // hover, active, toggle  (140–200ms)
  state: 0.24, // troca de estado / filtro (200–260ms)
  reveal: 0.38, // entrada de conteúdo    (320–420ms)
} as const;

export const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const; // feedback tátil

export const RISE = 10; // translateY de entrada, em px (8–12 máx)
export const STAGGER = 0.05; // 50ms entre irmãos — só grupos pequenos
