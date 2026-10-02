/**
 * A small, static WebGL renderer for our original glTF 2.0 airplane.
 * Flight movement belongs to airplane-hero.js. This module only draws on load,
 * container resize and context restoration; it has no animation loop or CDN.
 */
const MODEL_URL = new URL("../../assets/models/airplane.glb", import.meta.url);

/** Read the deliberately small, embedded-buffer subset used by our own GLB. */
export function parseAirplaneGLB(arrayBuffer) {
  const data = new DataView(arrayBuffer);
  if (
    data.byteLength < 20 ||
    data.getUint32(0, true) !== 0x46546c67 ||
    data.getUint32(4, true) !== 2 ||
    data.getUint32(8, true) !== data.byteLength
  ) throw new Error("Invalid airplane GLB");
  let document, binary;
  for (let offset = 12; offset + 8 <= data.byteLength;) {
    const length = data.getUint32(offset, true);
    const type = data.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > data.byteLength) throw new Error("Incomplete GLB chunk");
    if (type === 0x4e4f534a) {
      document = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, offset, length)));
    } else if (type === 0x004e4942) binary = arrayBuffer.slice(offset, offset + length);
    offset += length;
  }
  if (!document || !binary || document.buffers?.length !== 1 || document.buffers[0].uri) {
    throw new Error("Airplane must have one embedded buffer");
  }
  const read = (index, type, componentType) => {
    const accessor = document.accessors[index];
    const view = document.bufferViews[accessor?.bufferView];
    if (!view || accessor.type !== type || accessor.componentType !== componentType || view.byteStride || accessor.sparse) {
      throw new Error("Unsupported airplane accessor");
    }
    const Type = componentType === 5126 ? Float32Array : Uint16Array;
    const count = accessor.count * (type === "VEC3" ? 3 : 1);
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    if (offset + count * Type.BYTES_PER_ELEMENT > (view.byteOffset || 0) + view.byteLength) {
      throw new Error("Invalid airplane buffer range");
    }
    return new Type(binary, offset, count);
  };
  const primitives = document.meshes.flatMap((mesh) => mesh.primitives.map((primitive) => {
    if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error("Only triangle meshes supported");
    const material = document.materials[primitive.material]?.pbrMetallicRoughness || {};
    return {
      name: mesh.name,
      positions: read(primitive.attributes.POSITION, "VEC3", 5126),
      normals: read(primitive.attributes.NORMAL, "VEC3", 5126),
      indices: read(primitive.indices, "SCALAR", 5123),
      color: material.baseColorFactor || [1, 1, 1, 1],
      roughness: material.roughnessFactor ?? 1,
      metallic: material.metallicFactor ?? 0,
    };
  }));
  return { document, primitives };
}

const VERTEX_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uViewProjection;
varying vec3 vPosition;
varying vec3 vNormal;
void main() {
  vPosition = aPosition;
  vNormal = aNormal;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}`;

const FRAGMENT_SOURCE = `
precision mediump float;
varying vec3 vPosition;
varying vec3 vNormal;
uniform vec4 uColor;
uniform vec3 uCamera;
uniform float uRoughness;
uniform float uMetallic;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(0.0, 0.85, 0.65));
  vec3 eye = normalize(uCamera - vPosition);
  float diffuse = max(dot(normal, light), 0.0);
  float hemisphere = 0.29 + 0.11 * (normal.y * 0.5 + 0.5);
  float specular = pow(max(dot(normal, normalize(light + eye)), 0.0), mix(88.0, 16.0, uRoughness));
  vec3 color = uColor.rgb * (hemisphere + diffuse * 0.69);
  color += mix(vec3(0.21), uColor.rgb * 0.5, uMetallic) * specular;
  gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), uColor.a);
}`;

const normalize = (v) => {
  const length = Math.hypot(...v);
  return v.map((n) => n / length);
};
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a.reduce((sum, value, i) => sum + value*b[i], 0);

/** An orthographic, rolled three-quarter camera keeps the nose aimed right. */
function projection(aspect) {
  const camera = [8, 8, 13];
  const forward = normalize(camera);
  const right = normalize(cross([0, 1, 0], forward));
  const up = cross(forward, right);
  const roll = -Math.atan2(up[0], right[0]);
  const r = right.map((v, i) => Math.cos(roll)*v - Math.sin(roll)*up[i]);
  const u = up.map((v, i) => Math.sin(roll)*right[i] + Math.cos(roll)*v);
  const halfHeight = Math.max(3.05, 4.15/aspect);
  const halfWidth = halfHeight*aspect;
  const center = [-.35, .15, 0];
  return {
    camera,
    matrix: new Float32Array([
      r[0]/halfWidth, u[0]/halfHeight, -forward[0]/16, 0,
      r[1]/halfWidth, u[1]/halfHeight, -forward[1]/16, 0,
      r[2]/halfWidth, u[2]/halfHeight, -forward[2]/16, 0,
      -dot(r, center)/halfWidth, -dot(u, center)/halfHeight, dot(forward, center)/16, 1,
    ]),
  };
}

/**
 * Enhance an existing, accessible SVG fallback. Returns null on unsupported
 * devices. Consumers may dispose resources when removing the Hero component.
 */
export async function initAirplaneModel(canvas) {
  if (!canvas?.parentElement) return null;
  const parent = canvas.parentElement;
  const state = (value) => { parent.dataset.modelState = value; canvas.dataset.modelState = value; };
  state("fallback");
  let gl;
  try {
    gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
  } catch { return null; }
  if (!gl) return null;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 8000);
  const buffers = [];
  const shaders = [];
  let program, observer, frame = 0, disposed = false, model, gpu;
  const release = () => {
    for (const buffer of buffers.splice(0)) gl.deleteBuffer(buffer);
    for (const shader of shaders.splice(0)) gl.deleteShader(shader);
    if (program) gl.deleteProgram(program);
    program = null;
  };
  const makeShader = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Shader allocation failed");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader unavailable");
    return shader;
  };
  const makeBuffer = (type, data) => {
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Buffer allocation failed");
    buffers.push(buffer);
    gl.bindBuffer(type, buffer);
    gl.bufferData(type, data, gl.STATIC_DRAW);
    return buffer;
  };
  let uniforms, attributes;
  const prepare = () => {
    release();
    program = gl.createProgram();
    if (!program) throw new Error("Program allocation failed");
    gl.attachShader(program, makeShader(gl.VERTEX_SHADER, VERTEX_SOURCE));
    gl.attachShader(program, makeShader(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Program unavailable");
    uniforms = Object.fromEntries(["uViewProjection", "uCamera", "uColor", "uRoughness", "uMetallic"].map((name) => [name, gl.getUniformLocation(program, name)]));
    attributes = { position: gl.getAttribLocation(program, "aPosition"), normal: gl.getAttribLocation(program, "aNormal") };
    gpu = model.primitives.map((part) => ({
      ...part,
      positionBuffer: makeBuffer(gl.ARRAY_BUFFER, part.positions),
      normalBuffer: makeBuffer(gl.ARRAY_BUFFER, part.normals),
      indexBuffer: makeBuffer(gl.ELEMENT_ARRAY_BUFFER, part.indices),
    }));
  };
  const render = () => {
    frame = 0;
    if (disposed || gl.isContextLost()) return;
    const width = parent.clientWidth || 360;
    const height = parent.clientHeight || width*3/4;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width*ratio));
    const pixelHeight = Math.max(1, Math.round(height*ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(program);
    const view = projection(width/height);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, view.matrix);
    gl.uniform3fv(uniforms.uCamera, view.camera);
    for (const part of gpu) {
      gl.bindBuffer(gl.ARRAY_BUFFER, part.positionBuffer);
      gl.enableVertexAttribArray(attributes.position);
      gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.normalBuffer);
      gl.enableVertexAttribArray(attributes.normal);
      gl.vertexAttribPointer(attributes.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.indexBuffer);
      gl.uniform4fv(uniforms.uColor, part.color);
      gl.uniform1f(uniforms.uRoughness, part.roughness);
      gl.uniform1f(uniforms.uMetallic, part.metallic);
      gl.drawElements(gl.TRIANGLES, part.indices.length, gl.UNSIGNED_SHORT, 0);
    }
    if (gl.getError() === gl.NO_ERROR) state("ready");
    else state("fallback");
  };
  const queueRender = () => { if (!frame && !disposed) frame = requestAnimationFrame(render); };
  const lost = (event) => {
    event.preventDefault();
    // Context loss already invalidates GPU handles. Deleting those handles
    // after restoration would raise INVALID_OPERATION in the new context.
    buffers.length = 0;
    shaders.length = 0;
    program = null;
    state("fallback");
  };
  const restored = () => {
    if (disposed) return;
    try { prepare(); render(); } catch { state("fallback"); }
  };
  const dispose = () => {
    disposed = true;
    abort.abort();
    observer?.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", queueRender);
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
    release();
    state("fallback");
  };
  try {
    const response = await fetch(MODEL_URL, { signal: abort.signal });
    if (!response.ok) throw new Error("Airplane model unavailable");
    model = parseAirplaneGLB(await response.arrayBuffer());
    prepare();
    render();
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(queueRender);
      observer.observe(parent);
    } else window.addEventListener("resize", queueRender);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return { dispose, render };
  } catch {
    dispose();
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
