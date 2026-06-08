/**
 * builtinGLSLCode — bundled ShaderToy `mainImage` presets for the GLSL renderer
 * (issue #281). Each is a v1-scope single-pass shader: `iResolution`, `iTime`,
 * and the `iChannel0` audio texture (row 0 = FFT, row 1 = waveform). They are the
 * GLSL analog of the built-in hydra/p5 sketches — the zero-library Tier-1
 * reference visuals + the perf floor.
 *
 * REF: glslShaderSource.ts (the wrapper), defaultDescriptors.ts (registration).
 */

/** Default GLSL preset — an audio-reactive plasma whose hue and warp ride the
 *  low/mid FFT bins, with a waveform line across the centre. */
export const GLSL_DEFAULT_CODE = `// Stave GLSL — audio-reactive plasma.
// iChannel0: row 0 (y≈0.0) = FFT, row 1 (y≈1.0) = waveform.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = (uv - 0.5) * vec2(iResolution.x / iResolution.y, 1.0);

  // Audio: bass from low FFT, treble from high FFT.
  float bass = texture(iChannel0, vec2(0.03, 0.0)).x;
  float treble = texture(iChannel0, vec2(0.7, 0.0)).x;

  float t = iTime * 0.3;
  float v = 0.0;
  v += sin(p.x * 6.0 + t + bass * 6.0);
  v += sin((p.y * 6.0 + t) + cos(p.x * 4.0));
  v += sin(length(p) * 10.0 - t * 2.0 - bass * 8.0);
  v *= 0.5;

  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + v * 3.1416 + iTime * 0.2);
  col *= 0.6 + 0.8 * bass;

  // Waveform line across the middle.
  float wave = texture(iChannel0, vec2(uv.x, 1.0)).x * 2.0 - 1.0;
  float d = abs((uv.y - 0.5) - wave * 0.25);
  col += smoothstep(0.02, 0.0, d) * vec3(1.0, 0.9, 0.7) * (0.5 + treble);

  fragColor = vec4(col, 1.0);
}
`

/** A minimal spectrum-bars shader — each column's height is its FFT bin. The
 *  clearest possible "is audio reaching the shader?" reference. */
export const GLSL_SPECTRUM_CODE = `// Stave GLSL — FFT spectrum bars.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float mag = texture(iChannel0, vec2(uv.x, 0.0)).x;
  float bar = step(uv.y, mag);
  vec3 col = mix(vec3(0.04, 0.05, 0.1), vec3(0.2 + uv.x, 0.8, 1.0 - uv.x), bar);
  fragColor = vec4(col, 1.0);
}
`
