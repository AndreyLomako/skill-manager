export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Стеклянная капля: волнистый край (шум по углу), выпуклость к курсору,
// перелив кромки синий → фиолетовый → розовый, блики и пульсация.
export const fragmentShader = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uPulse;
  uniform vec3 uPulseColor;
  uniform float uMotion;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 frag = vUv * uResolution;
    vec2 p = (frag - uCenter) / uRadius;
    float ang = atan(p.y, p.x);
    float r = length(p);
    float t = uTime * 0.35 * uMotion;
    vec2 dir = vec2(cos(ang), sin(ang));

    float wave = (noise(dir * 1.8 + t) - 0.5) * 0.10 + (noise(dir * 3.5 - t * 1.3) - 0.5) * 0.05;

    vec2 m = (uMouse - uCenter) / uRadius;
    float mAng = atan(m.y, m.x);
    float dAng = abs(atan(sin(ang - mAng), cos(ang - mAng)));
    float prox = smoothstep(2.2, 0.8, length(m)) * uMotion;
    float bump = exp(-dAng * dAng * 6.0) * 0.06 * prox;

    float edge = 1.0 + wave + bump + uPulse * 0.04 * sin(ang * 6.0 + uTime * 8.0);
    float d = r - edge;
    float aa = 1.5 / uRadius;
    float inside = 1.0 - smoothstep(-aa, aa, d);

    float k = 0.5 + 0.5 * sin(ang + 0.6 + t * 0.5);
    vec3 blue = vec3(0.20, 0.30, 1.00);
    vec3 violet = vec3(0.62, 0.25, 0.95);
    vec3 pink = vec3(0.95, 0.40, 0.90);
    vec3 rimCol = mix(blue, mix(violet, pink, smoothstep(0.5, 1.0, k)), smoothstep(0.0, 0.6, k));
    rimCol = mix(rimCol, uPulseColor, clamp(uPulse, 0.0, 1.0) * 0.6);

    float rim = exp(-abs(d) * 28.0);
    float innerGlow = exp(-max(-d, 0.0) * 6.0) * inside;
    float spec = pow(max(0.0, sin(ang * 3.0 + t * 1.7)), 24.0) * rim;

    vec3 body = mix(vec3(0.08, 0.12, 0.38), vec3(0.11, 0.20, 0.48), clamp(p.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 col = body * inside * 0.9 + rimCol * innerGlow * (0.55 + uPulse * 0.3) + rimCol * rim * 1.1 + vec3(1.0) * spec * 0.6;
    float alpha = clamp(inside * 0.85 + rim, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;
