import type { V3 } from './geometry';

/**
 * Key skeletal landmarks of the (male) reference body, LEFT side (+X).
 * Units: metres; feet on y = 0; facing +Z. Female proportions are produced by `femaleWarp`.
 * Every builder positions its structures relative to these points so systems line up.
 */
export const LM = {
  // head & neck
  vertex: [0, 1.78, -0.01] as V3,
  craniumC: [0, 1.685, -0.01] as V3,
  orbit: [0.032, 1.665, 0.075] as V3,
  nasion: [0, 1.665, 0.088] as V3,
  chin: [0, 1.545, 0.075] as V3,
  mastoid: [0.055, 1.625, -0.03] as V3,
  // trunk
  jugularNotch: [0, 1.445, 0.06] as V3,
  sternalAngle: [0, 1.4, 0.085] as V3,
  xiphoid: [0, 1.245, 0.11] as V3,
  umbilicus: [0, 1.06, 0.115] as V3,
  pubicSymphysis: [0, 0.905, 0.085] as V3,
  // shoulder girdle & upper limb
  sternoclavicular: [0.025, 1.445, 0.06] as V3,
  acromion: [0.185, 1.465, -0.01] as V3,
  coracoid: [0.15, 1.435, 0.035] as V3,
  shoulder: [0.185, 1.43, -0.015] as V3,
  scapSuperior: [0.075, 1.445, -0.1] as V3,
  scapInferior: [0.1, 1.28, -0.11] as V3,
  elbow: [0.25, 1.12, -0.03] as V3,
  medEpicondyle: [0.225, 1.12, -0.04] as V3,
  latEpicondyle: [0.278, 1.125, -0.03] as V3,
  wrist: [0.31, 0.875, 0.0] as V3,
  wristRadial: [0.33, 0.875, 0.005] as V3,
  wristUlnar: [0.29, 0.875, -0.005] as V3,
  // pelvis & lower limb
  iliacCrest: [0.14, 1.08, -0.01] as V3,
  asis: [0.12, 1.0, 0.07] as V3,
  psis: [0.045, 1.02, -0.09] as V3,
  hip: [0.088, 0.92, 0.025] as V3,
  greaterTrochanter: [0.14, 0.92, 0.0] as V3,
  ischialTuberosity: [0.055, 0.85, -0.035] as V3,
  knee: [0.095, 0.5, 0.01] as V3,
  medCondyle: [0.07, 0.505, 0.005] as V3,
  latCondyle: [0.12, 0.505, 0.005] as V3,
  tibialTuberosity: [0.095, 0.45, 0.05] as V3,
  ankle: [0.1, 0.085, -0.01] as V3,
  medMalleolus: [0.075, 0.08, -0.01] as V3,
  latMalleolus: [0.125, 0.07, -0.02] as V3,
  heel: [0.1, 0.03, -0.065] as V3,
  toe: [0.12, 0.015, 0.17] as V3,
};

/** Spine curve: z (antero-posterior) and y of each vertebral body centre, top (C1) → bottom (L5). */
export const SPINE: { name: string; y: number; z: number; r: number }[] = (() => {
  const out: { name: string; y: number; z: number; r: number }[] = [];
  const names = [
    ...Array.from({ length: 7 }, (_, i) => `C${i + 1}`),
    ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `L${i + 1}`),
  ];
  // Explicit body-centre heights: cervical C1–C7, thoracic T1–T12, lumbar L1–L5.
  const ys = [
    1.6, 1.58, 1.562, 1.545, 1.528, 1.511, 1.493,
    ...Array.from({ length: 12 }, (_, i) => 1.472 - i * 0.0256),
    ...Array.from({ length: 5 }, (_, i) => 1.163 - i * 0.031),
  ];
  names.forEach((name, i) => {
    const y = ys[i];
    // cervical lordosis, thoracic kyphosis, lumbar lordosis
    const z =
      -0.035 -
      0.045 * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 1.17) / 0.33))) +
      (y < 1.17 ? 0.012 * Math.sin(((1.17 - y) / 0.14) * Math.PI) : 0) +
      (y > 1.5 ? 0.008 * Math.sin(((y - 1.5) / 0.1) * Math.PI) : 0);
    const r = i < 7 ? 0.012 + i * 0.0006 : i < 19 ? 0.015 + (i - 7) * 0.0007 : 0.023 + (i - 19) * 0.0008;
    out.push({ name, y, z, r });
  });
  return out;
})();

export const spineAt = (name: string) => SPINE.find((s) => s.name === name)!;
