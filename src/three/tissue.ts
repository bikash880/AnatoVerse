/**
 * Procedural PBR tissue materials.
 *
 * BodyParts3D meshes have no UV coordinates, so image textures cannot be mapped. Instead every
 * tissue material derives its colour, normal (bump) and roughness detail in the shader from 3-D
 * noise evaluated in object space (metres, via `unit`), which works on any mesh and costs no
 * texture downloads. On top of MeshPhysicalMaterial (clearcoat, sheen, transmission) each preset
 * can add:
 *   • surface vessels   – domain-warped ridged noise drawn as thin raised red/blue vessels
 *   • spongy alveolar   – cellular noise bump + mottling (lungs)
 *   • neural pulses     – glowing waves travelling across the surface (brain, "Live" mode)
 *   • subsurface glow   – a fresnel rim of the tissue's inner colour (cheap SSS approximation)
 *   • peristalsis       – vertex waves travelling along an axis (stomach, "Live" mode)
 *   • pupil             – radial vertex scaling around the eye axis (iris, "Live" mode)
 */
import * as THREE from 'three';

/** Uniforms shared by every tissue material (updated once per frame). */
export const tissueUniforms = {
  uTime: { value: 0 },
  uLive: { value: 1 },
  /** 1 = full procedural detail, 0 = fast path (plain PBR) for weak GPUs */
  uDetail: { value: 1 },
};

export interface TissueOptions {
  color: string;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: string;
  /** world units per metre (1 in the body, the organ scale in the organ viewer) */
  unit?: number;
  bump?: { freq: number; amp: number; kind?: 'fbm' | 'cells' | 'pores' };
  vessels?: { color: string; freq: number; width?: number; amount?: number };
  mottle?: { color: string; freq: number; amount: number };
  sss?: { color: string; amount: number };
  neural?: { color: string };
  peristalsis?: { axis: THREE.Vector3; center: THREE.Vector3; length: number; amp: number };
  pupil?: { axis: THREE.Vector3; center: THREE.Vector3; outer: number };
  iris?: { axis: THREE.Vector3; center: THREE.Vector3; colorA: string; colorB: string };
  transmission?: number;
  thickness?: number;
  ior?: number;
  attenuationColor?: string;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
}

/* 3-D simplex noise — Stefan Gustavson / Ashima Arts (MIT licence). */
const NOISE = /* glsl */ `
vec3 av_mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 av_mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 av_perm(vec4 x){return av_mod289(((x*34.0)+10.0)*x);}
vec4 av_tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float av_snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=av_mod289(i);
  vec4 p=av_perm(av_perm(av_perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw); vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=av_tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float av_fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*av_snoise(p); p*=2.03; a*=0.5; } return s; }
// cheap cellular look: sharp valleys of |noise|
float av_cells(vec3 p){ return 1.0 - abs(av_snoise(p)) * 1.6 - abs(av_snoise(p*2.1+7.3))*0.5; }
// thin branching vessel lines from domain-warped ridged noise
float av_vessels(vec3 p, float width){
  vec3 q = p + 0.7*vec3(av_snoise(p*0.6), av_snoise(p*0.6+11.0), av_snoise(p*0.6+23.0));
  float r1 = 1.0 - abs(av_snoise(q));
  float r2 = 1.0 - abs(av_snoise(q*2.3+5.0));
  float v = max(smoothstep(1.0-width, 1.0, r1), 0.6*smoothstep(1.0-width*0.6, 1.0, r2));
  return v * smoothstep(-0.2, 0.4, av_snoise(p*0.35+3.0)); // patchy, not everywhere
}
`;

/* Fragment-only (uses screen-space derivatives): bump-mapped normal from a procedural height. */
const PERTURB = /* glsl */ `
vec3 av_perturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir){
  vec3 sx=normalize(dFdx(surf_pos)); vec3 sy=normalize(dFdy(surf_pos)); vec3 n=surf_norm;
  vec3 r1=cross(sy,n); vec3 r2=cross(n,sx); float det=dot(sx,r1)*faceDir;
  vec3 grad=sign(det)*(dHdxy.x*r1+dHdxy.y*r2); return normalize(abs(det)*surf_norm-grad);
}
`;

const col = (c: string) => new THREE.Color(c);
const v3 = (v: THREE.Vector3) => ({ value: v.clone() });

export function makeTissue(o: TissueOptions) {
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color,
    roughness: o.roughness ?? 0.4,
    metalness: 0,
    clearcoat: o.clearcoat ?? 0.6,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.2,
    sheen: o.sheen ?? 0.3,
    sheenRoughness: 0.45,
    sheenColor: col(o.sheenColor ?? o.color).lerp(col('#ffffff'), 0.35),
    transmission: o.transmission ?? 0,
    thickness: o.thickness ?? 0,
    ior: o.ior ?? 1.4,
    attenuationColor: col(o.attenuationColor ?? '#ffffff'),
    attenuationDistance: o.attenuationColor ? 0.6 : Infinity,
    side: o.side ?? THREE.DoubleSide,
    transparent: o.opacity !== undefined && o.opacity < 1,
    opacity: o.opacity ?? 1,
    depthWrite: o.depthWrite ?? !(o.opacity !== undefined && o.opacity < 1),
  });
  const U = {
    uUnit: { value: o.unit ?? 1 },
    uBumpFreq: { value: o.bump?.freq ?? 0 },
    uBumpAmp: { value: o.bump?.amp ?? 0 },
    uVesselColor: { value: col(o.vessels?.color ?? '#000000') },
    uVesselFreq: { value: o.vessels?.freq ?? 0 },
    uVesselWidth: { value: o.vessels?.width ?? 0.06 },
    uVesselAmt: { value: o.vessels?.amount ?? 0 },
    uMottleColor: { value: col(o.mottle?.color ?? '#000000') },
    uMottleFreq: { value: o.mottle?.freq ?? 0 },
    uMottleAmt: { value: o.mottle?.amount ?? 0 },
    uSssColor: { value: col(o.sss?.color ?? '#000000') },
    uSssAmt: { value: o.sss?.amount ?? 0 },
    uNeuralColor: { value: col(o.neural?.color ?? '#000000') },
    uNeural: { value: o.neural ? 1 : 0 },
    uPeriAxis: v3(o.peristalsis?.axis ?? new THREE.Vector3(0, 1, 0)),
    uPeriCenter: v3(o.peristalsis?.center ?? new THREE.Vector3()),
    uPeriLen: { value: o.peristalsis?.length ?? 1 },
    uPeriAmp: { value: o.peristalsis?.amp ?? 0 },
    uPupilAxis: v3(o.pupil?.axis ?? o.iris?.axis ?? new THREE.Vector3(0, 0, 1)),
    uPupilCenter: v3(o.pupil?.center ?? o.iris?.center ?? new THREE.Vector3()),
    uPupil: { value: 0 },
    uIrisOuter: { value: o.pupil?.outer ?? 1 },
    uIris: { value: o.iris ? 1 : 0 },
    uIrisA: { value: col(o.iris?.colorA ?? '#000000') },
    uIrisB: { value: col(o.iris?.colorB ?? '#000000') },
  };
  m.userData.uniforms = U;
  const bumpKind = o.bump?.kind === 'cells' ? 1 : o.bump?.kind === 'pores' ? 2 : 0;
  const defines = [
    o.peristalsis ? '#define AV_PERI' : '',
    o.pupil ? '#define AV_PUPIL' : '',
    o.neural ? '#define AV_NEURAL' : '',
    o.iris ? '#define AV_IRIS' : '',
    o.vessels ? '#define AV_VESSELS' : '',
    o.bump ? `#define AV_BUMP ${bumpKind}` : '',
  ].join('\n');
  const key = `tissue|${defines.replace(/\n/g, ',')}`;

  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, tissueUniforms);
    const decl = `
${defines}
uniform float uIrisOuter;
uniform float uTime, uLive, uDetail, uUnit, uBumpFreq, uBumpAmp, uVesselFreq, uVesselWidth, uVesselAmt, uMottleFreq, uMottleAmt, uSssAmt, uNeural, uPeriLen, uPeriAmp, uPupil, uIris;
uniform vec3 uVesselColor, uMottleColor, uSssColor, uNeuralColor, uPeriAxis, uPeriCenter, uPupilAxis, uPupilCenter, uIrisA, uIrisB;
varying vec3 vAvPos;
${NOISE}`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${decl}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vAvPos = position / uUnit;
#ifdef AV_PERI
  // peristaltic constriction rings travelling from the cardia to the pylorus
  float s = dot(position - uPeriCenter, uPeriAxis) / uPeriLen;
  float ring = pow(max(0.0, sin(s * 9.0 - uTime * 2.2)), 6.0);
  transformed -= objectNormal * ring * uPeriAmp * uLive;
#endif
#ifdef AV_PUPIL
  // iris = ring around the eye axis with a fixed outer rim (radius uIrisOuter).
  // Scaling the ring width moves the pupillary margin: uPupil > 0 constricts, < 0 dilates.
  vec3 rel = position - uPupilCenter;
  vec3 axial = dot(rel, uPupilAxis) * uPupilAxis;
  vec3 radial = rel - axial;
  float r = length(radial);
  float f = 1.0 + 0.45 * uPupil * uLive;
  float r2 = max(uIrisOuter - (uIrisOuter - r) * f, 0.05 * uIrisOuter);
  transformed = uPupilCenter + axial + (r > 1e-6 ? radial / r : vec3(0.0)) * r2;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${decl}\n${PERTURB}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float avN = 0.0;
if (uDetail > 0.5) {
vec3 avCp = vAvPos * max(uBumpFreq, 1.0) * 0.25;
avN = av_fbm(avCp) * (1.0 - smoothstep(0.4, 1.4, length(fwidth(avCp))));
diffuseColor.rgb *= 0.9 + 0.18 * avN;
#ifdef AV_VESSELS
  vec3 avVp = vAvPos * uVesselFreq;
  float avV = av_vessels(avVp, uVesselWidth) * uVesselAmt * (1.0 - smoothstep(0.08, 0.35, length(fwidth(avVp))));
  diffuseColor.rgb = mix(diffuseColor.rgb, uVesselColor, clamp(avV, 0.0, 1.0));
#endif
}
if (uDetail > 0.5 && uMottleAmt > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, uMottleColor, uMottleAmt * smoothstep(0.25, 0.9, av_fbm(vAvPos * uMottleFreq)));
#ifdef AV_IRIS
  vec3 ir = vAvPos * uUnit - uPupilCenter;
  vec3 irr = ir - dot(ir, uPupilAxis) * uPupilAxis;
  float ang = atan(irr.y, irr.x);
  float rad = length(irr);
  float fib = 0.5 + 0.5 * sin(ang * 70.0 + av_snoise(vec3(ang * 6.0, rad * 30.0, 0.0)) * 3.0);
  diffuseColor.rgb = mix(uIrisA, uIrisB, fib * 0.7 + 0.3 * av_snoise(vAvPos * 900.0));
#endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.85 + 0.3 * avN), 0.02, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#ifdef AV_BUMP
if (uDetail > 0.5) {
  vec3 bp = vAvPos * uBumpFreq;
  #if AV_BUMP == 1
    float h = av_cells(bp);
  #elif AV_BUMP == 2
    float h = av_snoise(bp) * 0.6 + av_snoise(bp * 3.1) * 0.4;
  #else
    float h = av_fbm(bp);
  #endif
  #ifdef AV_VESSELS
    h += 1.6 * av_vessels(vAvPos * uVesselFreq, uVesselWidth) * uVesselAmt;
  #endif
  // level of detail: fade the bump out where its frequency exceeds the pixel density (no sparkle)
  float lod = 1.0 - smoothstep(0.35, 1.2, length(fwidth(bp)));
  normal = av_perturb(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)) * uBumpAmp * lod, faceDirection);
}
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 vdir = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(abs(dot(normal, vdir)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += uSssColor * fres * uSssAmt;
#ifdef AV_NEURAL
  // action-potential-like waves: sparse bright fronts travelling across the cortex
  vec3 np = vAvPos * 18.0;
  float front = sin(dot(np, vec3(0.8, 0.5, 0.3)) * 2.0 - uTime * 3.0 + av_snoise(np * 0.5) * 4.0);
  float spark = smoothstep(0.93, 1.0, front) * smoothstep(0.1, 0.7, av_snoise(np * 0.7 + uTime * 0.35));
  float front2 = sin(dot(np, vec3(-0.4, 0.7, -0.6)) * 1.6 - uTime * 2.3 + av_snoise(np * 0.4 + 9.0) * 4.0);
  spark += 0.7 * smoothstep(0.95, 1.0, front2) * smoothstep(0.2, 0.8, av_snoise(np * 0.9 - uTime * 0.3));
  totalEmissiveRadiance += uNeuralColor * spark * 2.2 * uLive;
#endif
}`,
      );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/* ----------------------------- presets ----------------------------- */
export type TissuePreset =
  | 'bone' | 'cartilage' | 'muscle' | 'artery' | 'vein' | 'nerve' | 'lymph' | 'skin' | 'organ'
  | 'myocardium' | 'cavity' | 'valve' | 'coronary' | 'cardiacVein' | 'airway' | 'lung' | 'diaphragm'
  | 'cortex' | 'cerebellum' | 'brainstem' | 'kidney' | 'adrenal' | 'ureter' | 'liver' | 'bile'
  | 'stomach' | 'esophagus' | 'duodenum' | 'cornea' | 'lens' | 'iris' | 'sclera' | 'choroid' | 'vitreous' | 'tissue';

export function tissuePreset(p: TissuePreset, unit = 1, extra: Partial<TissueOptions> = {}): THREE.MeshPhysicalMaterial {
  const wet = { roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.5 };
  const base: Record<TissuePreset, TissueOptions> = {
    bone: { color: '#E8DFC9', roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.1, bump: { freq: 260, amp: 0.25, kind: 'pores' }, mottle: { color: '#CDBB98', freq: 40, amount: 0.35 } },
    cartilage: { color: '#C9DCE2', roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15, sheen: 0.3, bump: { freq: 150, amp: 0.08 }, sss: { color: '#6E8FA0', amount: 0.15 } },
    muscle: { color: '#A8323C', ...wet, roughness: 0.42, sheenColor: '#FF8A94', bump: { freq: 320, amp: 0.3 }, mottle: { color: '#7E1F28', freq: 30, amount: 0.35 }, sss: { color: '#7A0F18', amount: 0.25 } },
    artery: { color: '#C8202B', ...wet, roughness: 0.25, bump: { freq: 200, amp: 0.08 }, sss: { color: '#80101A', amount: 0.3 } },
    vein: { color: '#2F56C2', ...wet, roughness: 0.25, bump: { freq: 200, amp: 0.08 }, sss: { color: '#142E7A', amount: 0.3 } },
    nerve: { color: '#EBC64A', roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.4, bump: { freq: 400, amp: 0.15 }, sss: { color: '#7A5A10', amount: 0.2 } },
    lymph: { color: '#47B36E', ...wet, roughness: 0.35, bump: { freq: 300, amp: 0.15 }, sss: { color: '#1B5E33', amount: 0.25 } },
    skin: { color: '#D8A88A', roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.7, sheenColor: '#FFD9C4', bump: { freq: 500, amp: 0.12, kind: 'pores' }, opacity: 0.38, depthWrite: false, sss: { color: '#B5523A', amount: 0.25 } },
    organ: { color: '#DD8C95', ...wet, bump: { freq: 160, amp: 0.25 }, vessels: { color: '#8E1A2A', freq: 18, width: 0.05, amount: 0.45 }, sss: { color: '#9C2A3A', amount: 0.3 } },
    tissue: { color: '#D9A0A0', ...wet, bump: { freq: 160, amp: 0.2 } },
    myocardium: { color: '#9E2733', ...wet, roughness: 0.3, sheenColor: '#FF9AA4', bump: { freq: 140, amp: 0.35 }, vessels: { color: '#5C0C16', freq: 32, width: 0.05, amount: 0.6 }, mottle: { color: '#E2C26A', freq: 9, amount: 0.25 }, sss: { color: '#7A0812', amount: 0.4 } },
    cavity: { color: '#5E0E16', roughness: 0.4, clearcoat: 0.6, sheen: 0.2 },
    valve: { color: '#EFE2C8', roughness: 0.3, clearcoat: 0.8, sheen: 0.4, sss: { color: '#A08060', amount: 0.2 } },
    coronary: { color: '#D41E28', ...wet, roughness: 0.22, sss: { color: '#80101A', amount: 0.35 } },
    cardiacVein: { color: '#2E50B8', ...wet, roughness: 0.22, sss: { color: '#142E7A', amount: 0.35 } },
    airway: { color: '#E9C9C6', roughness: 0.35, clearcoat: 0.8, sheen: 0.4, bump: { freq: 200, amp: 0.15 }, sss: { color: '#9C6A6A', amount: 0.2 } },
    lung: { color: '#E6A0A8', roughness: 0.55, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.8, sheenColor: '#FFD6DC', bump: { freq: 340, amp: 0.55, kind: 'cells' }, mottle: { color: '#8C5A64', freq: 22, amount: 0.3 }, vessels: { color: '#7A2E52', freq: 14, width: 0.035, amount: 0.3 }, sss: { color: '#B04A5E', amount: 0.35 } },
    diaphragm: { color: '#A8323C', ...wet, roughness: 0.4, bump: { freq: 300, amp: 0.25 }, mottle: { color: '#E8D8C8', freq: 6, amount: 0.25 }, opacity: 0.85 },
    cortex: { color: '#D7B2AE', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.7, sheenColor: '#F5DCDC', bump: { freq: 420, amp: 0.18 }, vessels: { color: '#9A3040', freq: 9, width: 0.03, amount: 0.35 }, mottle: { color: '#B3A3A6', freq: 14, amount: 0.4 }, sss: { color: '#A05A60', amount: 0.25 } },
    cerebellum: { color: '#CFA6A4', roughness: 0.45, clearcoat: 0.6, sheen: 0.6, bump: { freq: 600, amp: 0.2 }, mottle: { color: '#A8979A', freq: 14, amount: 0.35 }, sss: { color: '#A05A60', amount: 0.2 } },
    brainstem: { color: '#E3C7B6', roughness: 0.42, clearcoat: 0.5, sheen: 0.5, bump: { freq: 300, amp: 0.12 } },
    kidney: { color: '#8E3A33', ...wet, roughness: 0.3, bump: { freq: 220, amp: 0.2 }, vessels: { color: '#4E0F12', freq: 20, width: 0.04, amount: 0.3 }, sss: { color: '#5A1410', amount: 0.35 } },
    adrenal: { color: '#D9A441', ...wet, roughness: 0.4, bump: { freq: 300, amp: 0.35, kind: 'cells' } },
    ureter: { color: '#E8C9A0', ...wet, roughness: 0.35 },
    liver: { color: '#7E2F27', ...wet, roughness: 0.26, bump: { freq: 380, amp: 0.25, kind: 'cells' }, vessels: { color: '#3E0E10', freq: 16, width: 0.05, amount: 0.4 }, mottle: { color: '#5A1E1A', freq: 24, amount: 0.35 }, sss: { color: '#5A1410', amount: 0.4 } },
    bile: { color: '#5E8F3E', ...wet, roughness: 0.25, sss: { color: '#2D4A1C', amount: 0.3 } },
    stomach: { color: '#E09A8C', ...wet, roughness: 0.3, bump: { freq: 160, amp: 0.3 }, vessels: { color: '#9A1E2C', freq: 14, width: 0.06, amount: 0.65 }, sss: { color: '#A83A3A', amount: 0.35 } },
    esophagus: { color: '#D98880', ...wet, bump: { freq: 200, amp: 0.25 }, vessels: { color: '#9A1E2C', freq: 16, width: 0.04, amount: 0.35 } },
    duodenum: { color: '#E7B08F', ...wet, bump: { freq: 200, amp: 0.25 }, vessels: { color: '#A02A30', freq: 16, width: 0.05, amount: 0.4 } },
    cornea: { color: '#FFFFFF', roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, sheen: 0, transmission: 1, thickness: 0.05, ior: 1.376, opacity: 1 },
    lens: { color: '#FFF6DC', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0, transmission: 0.92, thickness: 0.4, ior: 1.42, attenuationColor: '#F5E3A8' },
    iris: { color: '#6A8CA8', roughness: 0.45, clearcoat: 0.5, sheen: 0.3, bump: { freq: 1500, amp: 0.15 } },
    sclera: { color: '#F3EFE8', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.3, bump: { freq: 400, amp: 0.05 }, vessels: { color: '#C0303A', freq: 60, width: 0.022, amount: 0.75 }, sss: { color: '#C07070', amount: 0.15 } },
    choroid: { color: '#4A1A14', roughness: 0.6, clearcoat: 0.2, sheen: 0.2, mottle: { color: '#C2582E', freq: 50, amount: 0.4 } },
    vitreous: { color: '#FFFFFF', roughness: 0.05, transmission: 1, thickness: 0.6, ior: 1.336, clearcoat: 0, sheen: 0 },
  };
  return makeTissue({ ...base[p], unit, ...extra });
}

/** Advance shared animation time (call once per frame). */
export function tickTissue(t: number, live: boolean) {
  tissueUniforms.uTime.value = t;
  tissueUniforms.uLive.value = THREE.MathUtils.lerp(tissueUniforms.uLive.value, live ? 1 : 0, 0.08);
}
