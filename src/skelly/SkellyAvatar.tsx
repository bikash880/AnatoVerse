/**
 * Skelly: a small, full-body animated 3D skeleton (own tiny canvas, ~160 px tall, floating).
 *
 * The body is a joint hierarchy so every limb can move independently:
 *   root ─ head (skull, glowing eyes, hinged jaw)
 *        ├ spine / ribs / pelvis
 *        ├ shoulder ─ elbow ─ wrist ─ fingers (×2 sides)
 *        └ hip ─ knee ─ ankle (×2 sides)
 * Bones are rounded cylinders (capsules) with ball joints at shoulders, elbows, hips and knees.
 *
 * Animation layers (blended every frame with exponential damping):
 *   idle   – gentle sway and float, dangling legs, relaxed arms, blinking eye glow
 *   wave   – the right arm raises and waves when the chat opens
 *   talk   – while speaking, both forearms gesture on a beat that pulses with each spoken word,
 *            hands open, the head nods; the jaw opens with the live speech level
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mouth, mouthLevel } from './speech';
import { useSkelly } from './skellyStore';

const BONE = '#EDE6D6';
const TEAL = '#2DD4BF';

type Mats = ReturnType<typeof makeMaterials>;
function makeMaterials() {
  return {
    bone: new THREE.MeshPhysicalMaterial({ color: BONE, roughness: 0.38, metalness: 0.02, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
    joint: new THREE.MeshPhysicalMaterial({ color: '#F6F1E6', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: '#05080c', roughness: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ color: TEAL, toneMapped: false }),
    halo: new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }),
  };
}

/** A bone hanging down from the current pivot: rounded cylinder of total length `len`. */
function Bone({ len, r, mat }: { len: number; r: number; mat: THREE.Material }) {
  return (
    <mesh material={mat} position={[0, -len / 2, 0]}>
      <capsuleGeometry args={[r, Math.max(0.001, len - 2 * r), 6, 12]} />
    </mesh>
  );
}

function Ball({ r, mat, pos = [0, 0, 0] as [number, number, number] }: { r: number; mat: THREE.Material; pos?: [number, number, number] }) {
  return (
    <mesh material={mat} position={pos}>
      <sphereGeometry args={[r, 16, 12]} />
    </mesh>
  );
}

/* ---------------------------------- limbs ---------------------------------- */

interface ArmRefs {
  shoulder: React.RefObject<THREE.Group>;
  elbow: React.RefObject<THREE.Group>;
  wrist: React.RefObject<THREE.Group>;
  fingers: React.MutableRefObject<THREE.Group[]>;
}

/** Arm with ball joints; `s` = side sign (−1 = Skelly's right, on screen left). */
function Arm({ s, refs, mats }: { s: number; refs: ArmRefs; mats: Mats }) {
  const finger = (i: number, x: number, len: number, spread: number) => (
    <group key={i} position={[x, -0.085, 0]} rotation={[0, 0, spread]}>
      <group ref={(g) => { if (g) refs.fingers.current[i] = g; }}>
        <Bone len={len * 0.55} r={0.013} mat={mats.bone} />
        <group position={[0, -len * 0.55, 0]}>
          <Ball r={0.015} mat={mats.joint} />
          <Bone len={len * 0.45} r={0.012} mat={mats.bone} />
        </group>
      </group>
    </group>
  );
  return (
    <group ref={refs.shoulder} position={[s * 0.36, 0.44, 0]}>
      <Ball r={0.07} mat={mats.joint} />
      <Bone len={0.42} r={0.04} mat={mats.bone} />
      <group ref={refs.elbow} position={[0, -0.44, 0]}>
        <Ball r={0.055} mat={mats.joint} />
        <Bone len={0.36} r={0.032} mat={mats.bone} />
        {/* hand: wrist, palm, four fingers, thumb */}
        <group ref={refs.wrist} position={[0, -0.38, 0]}>
          <Ball r={0.035} mat={mats.joint} />
          <mesh material={mats.bone} position={[0, -0.05, 0]} scale={[1, 1.1, 0.45]}>
            <sphereGeometry args={[0.055, 14, 10]} />
          </mesh>
          {finger(0, -0.036 * -s, 0.11, 0.12 * s)}
          {finger(1, -0.012 * -s, 0.125, 0.04 * s)}
          {finger(2, 0.012 * -s, 0.12, -0.04 * s)}
          {finger(3, 0.034 * -s, 0.1, -0.12 * s)}
          {/* thumb on the lateral side (away from the body), angled outwards */}
          <group position={[s * 0.05, -0.03, 0.02]} rotation={[0.3, 0, s * 0.9]}>
            <group ref={(g) => { if (g) refs.fingers.current[4] = g; }}>
              <Bone len={0.07} r={0.014} mat={mats.bone} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

interface LegRefs {
  hip: React.RefObject<THREE.Group>;
  knee: React.RefObject<THREE.Group>;
  ankle: React.RefObject<THREE.Group>;
}

function Leg({ s, refs, mats }: { s: number; refs: LegRefs; mats: Mats }) {
  return (
    <group ref={refs.hip} position={[s * 0.16, -0.5, 0]}>
      <Ball r={0.075} mat={mats.joint} />
      <Bone len={0.55} r={0.048} mat={mats.bone} />
      <group ref={refs.knee} position={[0, -0.57, 0]}>
        <Ball r={0.065} mat={mats.joint} />
        <Bone len={0.52} r={0.04} mat={mats.bone} />
        {/* foot: ankle, tarsal block pointing forward, five toes */}
        <group ref={refs.ankle} position={[0, -0.54, 0]}>
          <Ball r={0.042} mat={mats.joint} />
          <mesh material={mats.bone} position={[0, -0.035, 0.07]} rotation={[Math.PI / 2, 0, 0]} scale={[1.25, 1, 0.75]}>
            <capsuleGeometry args={[0.042, 0.1, 6, 12]} />
          </mesh>
          {[-2, -1, 0, 1, 2].map((k) => (
            <Ball key={k} r={k === -2 * s ? 0.022 : 0.016} mat={mats.bone} pos={[k * 0.024, -0.045, 0.17 - Math.abs(k) * 0.008]} />
          ))}
        </group>
      </group>
    </group>
  );
}

/* --------------------------------- the body -------------------------------- */

const useArmRefs = (): ArmRefs => ({ shoulder: useRef<THREE.Group>(null), elbow: useRef<THREE.Group>(null), wrist: useRef<THREE.Group>(null), fingers: useRef<THREE.Group[]>([]) });
const useLegRefs = (): LegRefs => ({ hip: useRef<THREE.Group>(null), knee: useRef<THREE.Group>(null), ankle: useRef<THREE.Group>(null) });

/** Exponential damping of one rotation axis towards a target. */
function to(obj: THREE.Object3D | null, axis: 'x' | 'y' | 'z', target: number, lambda: number, dt: number) {
  if (obj) obj.rotation[axis] = THREE.MathUtils.damp(obj.rotation[axis], target, lambda, dt);
}

/** `?debug` only: hold a pose ('wave' | 'talk') for visual checks — window.__skellyPose = 'wave'. */
const DEBUG_POSE: { current: string | null } = { current: null };
if (typeof window !== 'undefined' && location.search.includes('debug'))
  Object.defineProperty(window, '__skellyPose', { set: (v: string | null) => (DEBUG_POSE.current = v), get: () => DEBUG_POSE.current });

function SkeletonFigure() {
  const mats = useMemo(makeMaterials, []);
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const jaw = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const armR = useArmRefs(); // Skelly's right arm (screen left) — the waving arm
  const armL = useArmRefs();
  const legR = useLegRefs();
  const legL = useLegRefs();
  const st = useRef({ blinkNext: 2, blinkUntil: 0, waveUntil: 0, prevOpen: false, talk: 0, wave: 0 });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1); // keep pace on slow devices without big jumps after a stall
    const t = state.clock.elapsedTime;
    const s = st.current;
    const open = useSkelly.getState().open;
    if (open && !s.prevOpen) s.waveUntil = t + 2.2; // wave hello when the chat opens
    s.prevOpen = open;

    // layer weights (smoothed so poses blend instead of snapping)
    const force = DEBUG_POSE.current;
    const m = force === 'talk' ? 0.5 + 0.5 * Math.sin(t * 15) : mouthLevel(t);
    const waving = force === 'wave' || t < s.waveUntil;
    const talking = force === 'talk' || mouth.speaking;
    s.wave = THREE.MathUtils.damp(s.wave, waving ? 1 : 0, 6, dt);
    s.talk = THREE.MathUtils.damp(s.talk, talking ? 1 : 0, 4, dt);
    const sinceWord = (performance.now() - mouth.lastBoundary) / 1000;
    const wordPulse = mouth.speaking ? Math.exp(-sinceWord * 6) : 0; // emphasis on each spoken word

    // ---- root: float + sway; turn towards the viewer while talking or waving ----
    if (root.current) {
      const face = Math.max(s.talk, s.wave);
      root.current.position.y = Math.sin(t * 1.8) * 0.06;
      root.current.rotation.z = Math.sin(t * 1.1) * 0.05 * (1 - 0.5 * face);
      root.current.rotation.y = Math.sin(t * 0.6) * 0.28 * (1 - 0.75 * face);
    }
    if (torso.current) torso.current.rotation.y = Math.sin(t * 2.6) * 0.06 * s.talk;

    // ---- head: idle bob, nod with speech, tilt while waving ----
    to(head.current, 'x', Math.sin(t * 0.9) * 0.05 - 0.05 + m * 0.06 + wordPulse * 0.05, 10, dt);
    to(head.current, 'z', s.wave * 0.18 * Math.sin(t * 3), 6, dt);
    to(jaw.current, 'x', 0.05 + m * 0.42, 22, dt);

    // ---- eyes: blink by squashing the glow; brighter while talking ----
    if (t > s.blinkNext) {
      s.blinkUntil = t + 0.13;
      s.blinkNext = t + 2.5 + Math.random() * 3;
    }
    if (eyes.current) {
      eyes.current.scale.y = THREE.MathUtils.lerp(eyes.current.scale.y, t < s.blinkUntil ? 0.1 : 1, 0.5);
      mats.glow.color.set(TEAL).multiplyScalar(0.85 + 0.25 * Math.sin(t * 3) + (m > 0 ? 0.3 : 0));
    }

    // ---- arms ----
    const beat = Math.sin(t * 2.6);
    const beat2 = Math.sin(t * 2.6 + 1.9);
    const arm = (a: ArmRefs, side: number, phase: number, isWaver: boolean) => {
      // side: −1 = Skelly's right (screen left). Outward = −z for side −1, +z for side +1.
      const idleSwing = Math.sin(t * 1.3 + phase) * 0.06;
      const g = side < 0 ? beat : beat2;
      // idle → talk pose (forearm raised forward, explaining)
      let shZ = side * (0.14 + idleSwing); // slight abduction, arms relaxed
      let shX = -0.05;
      let elX = -0.15 + Math.sin(t * 1.3 + phase) * 0.05;
      let elZ = 0;
      let wrZ = 0;
      let curl = 0.45;
      if (s.talk > 0.001) {
        shZ = THREE.MathUtils.lerp(shZ, side * (0.32 + 0.1 * g), s.talk);
        shX = THREE.MathUtils.lerp(shX, -0.35 - 0.15 * g, s.talk);
        elX = THREE.MathUtils.lerp(elX, -1.25 + 0.35 * g - wordPulse * 0.25, s.talk);
        wrZ = THREE.MathUtils.lerp(0, side * (0.35 + 0.25 * g), s.talk);
        curl = THREE.MathUtils.lerp(curl, 0.08, s.talk);
      }
      if (isWaver && s.wave > 0.001) {
        // raise the arm out and up, forearm waving side to side, open hand
        shZ = THREE.MathUtils.lerp(shZ, side * 2.55, s.wave);
        shX = THREE.MathUtils.lerp(shX, -0.25, s.wave);
        elX = THREE.MathUtils.lerp(elX, 0, s.wave);
        elZ = THREE.MathUtils.lerp(0, side * (0.25 + 0.45 * Math.sin(t * 11)), s.wave);
        wrZ = THREE.MathUtils.lerp(wrZ, side * 0.25 * Math.sin(t * 11 + 0.6), s.wave);
        curl = THREE.MathUtils.lerp(curl, 0, s.wave);
      }
      to(a.shoulder.current, 'z', shZ, 9, dt);
      to(a.shoulder.current, 'x', shX, 9, dt);
      to(a.elbow.current, 'x', elX, 10, dt);
      to(a.elbow.current, 'z', elZ, 14, dt);
      to(a.wrist.current, 'z', wrZ, 10, dt);
      to(a.wrist.current, 'x', -0.15 * s.talk, 10, dt);
      a.fingers.current.forEach((f, i) => to(f, 'x', -(curl + (i === 4 ? 0 : 0.05 * Math.sin(t * 2 + i))), 10, dt));
    };
    arm(armR, -1, 0, true);
    arm(armL, 1, 1.4, false);

    // ---- legs: dangling while floating ----
    const leg = (l: LegRefs, phase: number) => {
      const k = Math.sin(t * 1.4 + phase);
      to(l.hip.current, 'x', -0.22 + 0.08 * k, 6, dt);
      to(l.hip.current, 'z', 0, 6, dt);
      to(l.knee.current, 'x', 0.42 + 0.12 * Math.sin(t * 1.4 + phase + 0.9), 6, dt);
      to(l.ankle.current, 'x', 0.35 + 0.08 * k, 6, dt); // toes point down, as when floating
    };
    leg(legR, 0);
    leg(legL, Math.PI * 0.8);
  });

  const rib = (y: number, r: number): ReactNode => (
    <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.75, 1]} material={mats.bone}>
      <torusGeometry args={[r, 0.03, 8, 24, Math.PI * 1.7]} />
    </mesh>
  );

  return (
    <group ref={root}>
      {/* ---------- skull (cute, oversized) ---------- */}
      <group ref={head} position={[0, 0.98, 0]} scale={0.82}>
        <mesh material={mats.bone} scale={[1, 1.02, 1.05]}>
          <sphereGeometry args={[0.5, 32, 24]} />
        </mesh>
        <mesh material={mats.bone} position={[0, -0.2, 0.18]} scale={[1, 0.6, 0.8]}>
          <sphereGeometry args={[0.38, 24, 16]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`sock${s}`} material={mats.dark} position={[s * 0.18, 0.0, 0.4]} scale={[1, 1.1, 0.6]}>
            <sphereGeometry args={[0.14, 20, 16]} />
          </mesh>
        ))}
        <group ref={eyes} position={[0, 0.0, 0.47]}>
          {[-1, 1].map((s) => (
            <group key={`eye${s}`} position={[s * 0.18, 0, 0]}>
              <mesh material={mats.glow}>
                <sphereGeometry args={[0.055, 16, 12]} />
              </mesh>
              <mesh material={mats.halo}>
                <sphereGeometry args={[0.1, 16, 12]} />
              </mesh>
            </group>
          ))}
        </group>
        <mesh material={mats.dark} position={[0, -0.17, 0.48]} rotation={[0.3, 0, Math.PI]}>
          <coneGeometry args={[0.055, 0.12, 3]} />
        </mesh>
        <mesh material={mats.bone} position={[0, -0.32, 0.39]}>
          <boxGeometry args={[0.3, 0.07, 0.1]} />
        </mesh>
        {[-0.11, -0.04, 0.04, 0.11].map((x) => (
          <mesh key={x} material={mats.dark} position={[x, -0.32, 0.445]}>
            <boxGeometry args={[0.012, 0.07, 0.01]} />
          </mesh>
        ))}
        <group ref={jaw} position={[0, -0.28, 0.02]}>
          <mesh material={mats.bone} position={[0, -0.12, 0.2]} scale={[1, 0.5, 1]}>
            <sphereGeometry args={[0.3, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          </mesh>
          <mesh material={mats.bone} position={[0, -0.1, 0.38]}>
            <boxGeometry args={[0.28, 0.06, 0.09]} />
          </mesh>
          {[-0.1, -0.035, 0.035, 0.1].map((x) => (
            <mesh key={x} material={mats.dark} position={[x, -0.1, 0.43]}>
              <boxGeometry args={[0.012, 0.06, 0.01]} />
            </mesh>
          ))}
        </group>
      </group>

      {/* ---------- trunk ---------- */}
      <group ref={torso}>
        {[0, 1, 2].map((i) => (
          <Ball key={i} r={0.045} mat={mats.bone} pos={[0, 0.62 - i * 0.065, -0.04]} />
        ))}
        {/* spine */}
        <mesh material={mats.bone} position={[0, 0.05, -0.12]}>
          <capsuleGeometry args={[0.035, 0.9, 6, 10]} />
        </mesh>
        {/* collarbones */}
        <mesh material={mats.bone} position={[0, 0.47, 0.03]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.028, 0.6, 6, 10]} />
        </mesh>
        {/* sternum + rib cage */}
        <mesh material={mats.bone} position={[0, 0.27, 0.19]} scale={[1, 1, 0.5]}>
          <capsuleGeometry args={[0.035, 0.22, 6, 10]} />
        </mesh>
        <group position={[0, 0, -0.04]}>{[0.38, 0.27, 0.16, 0.05, -0.06].map((y, i) => rib(y, 0.25 - i * 0.012))}</group>
        {/* pelvis: iliac wings + pubic arch + sacrum */}
        <group position={[0, -0.4, -0.02]}>
          {[-1, 1].map((s) => (
            // iliac wing: a thin flared plate, rim tilted outwards
            <mesh key={s} material={mats.bone} position={[s * 0.13, 0.03, -0.03]} rotation={[0.15, s * 0.55, s * -0.45]} scale={[1, 0.8, 0.16]}>
              <sphereGeometry args={[0.14, 24, 16]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            // iliac crest rim
            <mesh key={`crest${s}`} material={mats.bone} position={[s * 0.15, 0.1, -0.03]} rotation={[Math.PI / 2, s * 0.55, s * -0.45]}>
              <torusGeometry args={[0.1, 0.018, 6, 16, Math.PI]} />
            </mesh>
          ))}
          <mesh material={mats.bone} position={[0, -0.08, 0.06]} rotation={[Math.PI / 2 + 0.25, 0, 0]} scale={[1, 1, 0.8]}>
            <torusGeometry args={[0.11, 0.028, 8, 20, Math.PI]} />
          </mesh>
          <mesh material={mats.bone} position={[0, -0.02, -0.1]} scale={[0.8, 1, 0.5]}>
            <sphereGeometry args={[0.08, 14, 10]} />
          </mesh>
        </group>
      </group>

      {/* ---------- limbs ---------- */}
      <Arm s={-1} refs={armR} mats={mats} />
      <Arm s={1} refs={armL} mats={mats} />
      <Leg s={-1} refs={legR} mats={mats} />
      <Leg s={1} refs={legL} mats={mats} />
    </group>
  );
}

/** The avatar button: canvas + floating shadow + "speaking" sound-wave + listening ring. */
export function SkellyAvatar({ height = 160 }: { height?: number }) {
  const width = Math.round(height * 0.75);
  const open = useSkelly((s) => s.open);
  const speaking = useSkelly((s) => s.speaking);
  const listening = useSkelly((s) => s.listening);
  const pending = useSkelly((s) => s.pending);
  return (
    <div className="pointer-events-auto relative flex flex-col items-center" style={{ width }}>
      <button
        onClick={() => useSkelly.getState().setOpen(!open)}
        className={`group relative rounded-[40%] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${open ? '' : 'hover:scale-105'}`}
        style={{ width, height }}
        aria-label={open ? 'Close Skelly chat' : 'Ask Skelly, the AI anatomy tutor'}
        aria-expanded={open}
        title="Ask Skelly"
      >
        <span className={`absolute inset-x-[10%] top-[4%] h-[45%] rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.22),transparent_70%)] ${listening ? 'animate-pulse' : ''}`} />
        {/* soft shadow on the "floor" — Skelly floats above it */}
        <span className="skelly-shadow absolute bottom-[1%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(20,184,166,0.35),transparent_70%)]" />
        {listening && <span className="absolute inset-[4%] animate-ping rounded-[40%] border-2 border-accent/60" />}
        <Canvas camera={{ position: [0, 0.05, 6.6], fov: 30 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} style={{ width, height, cursor: 'pointer' }}>
          <ambientLight intensity={0.65} />
          <directionalLight position={[2, 3, 4]} intensity={1.7} />
          <directionalLight position={[-3, 1, -2]} intensity={0.5} color="#9fd8ff" />
          <pointLight position={[0, 1.1, 1.4]} intensity={0.7} color={TEAL} />
          <SkeletonFigure />
        </Canvas>
        {!open && !speaking && (
          <span className="absolute -top-1 right-0 rounded-full border border-white/10 bg-ink/80 px-2 py-0.5 text-[10.5px] font-semibold text-accent-soft opacity-0 shadow transition group-hover:opacity-100">
            Ask Skelly
          </span>
        )}
        {pending && (
          <span className="absolute -top-1 right-1 flex gap-0.5 rounded-full bg-ink/80 px-2 py-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-soft" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </span>
        )}
      </button>
      {/* sound wave while speaking */}
      <div className={`flex h-4 items-end gap-[3px] transition-opacity ${speaking ? 'opacity-100' : 'opacity-0'}`} aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="skelly-wave w-[3px] rounded-full bg-accent-soft" style={{ animationDelay: `${(i % 4) * 0.11}s`, animationPlayState: speaking ? 'running' : 'paused' }} />
        ))}
      </div>
    </div>
  );
}
