// Film finish: soft bloom, then a grade pass for grain, vignette, warmth and
// the fades/flashes that carry every transition. Nothing here is a UI effect.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uVignette: { value: 0.85 },
    uGrain: { value: 0.045 },
    uDesat: { value: 0 },
    uFlash: { value: 0 },
    uAberr: { value: 0.0 },
    uCool: { value: 0 },
    uFreezeGrain: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFade, uVignette, uGrain, uDesat, uFlash, uAberr, uCool, uFreezeGrain;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uAberr * r2;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, vec3(l) * vec3(1.04, 1.0, 0.93), uDesat);
      // split-tone: warm umber shadows, ivory highlights
      vec3 shadowTint = vec3(1.06, 0.99, 0.90);
      vec3 hiTint = vec3(1.02, 1.0, 0.96);
      c *= mix(shadowTint, hiTint, smoothstep(0.0, 0.7, l));
      c = mix(c, c * vec3(0.92, 0.98, 1.06), uCool);
      c += uFlash * vec3(1.0, 0.97, 0.92);
      float v = smoothstep(0.95, 0.18, length(d * vec2(1.0, 1.15)));
      c *= mix(1.0, v, uVignette);
      float g = hash(vUv * uRes + mix(fract(uTime * 7.13), 0.37, uFreezeGrain) * 100.0) - 0.5;
      c += g * uGrain * (1.0 - l * 0.5);
      c *= 1.0 - uFade;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.5, 2.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const u = grade.uniforms;
  return {
    composer,
    renderPass,
    bloom,
    u,
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      u.uRes.value.set(w * dpr, h * dpr);
    },
    use(scene, camera) {
      renderPass.scene = scene;
      renderPass.camera = camera;
    },
    render(time) {
      u.uTime.value = time;
      composer.render();
    },
  };
}
