"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const vertexShaderGLSL = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShaderGLSL = `
precision highp float;
varying vec2 vUv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_grain;
uniform vec3 u_colors[4];
uniform vec3 u_bg;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373495314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x*x0.x + h.x*x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0 * dot(m,g);
}

void main() {
  float ratio = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = vUv - 0.5;
  p.x *= ratio;

  float t = u_time * 0.42;
  vec2 f1 = vec2(t * 0.55, -t * 0.34);
  vec2 f2 = vec2(-t * 0.42, t * 0.50);
  float n1 = snoise(p * 0.75 + f1);
  float n2 = snoise(p * 1.10 + f2 + n1 * 0.45);
  float n3 = snoise(p * 1.75 + vec2(t * 0.24, -t * 0.31) + n2 * 0.30);
  vec2 warp = vec2(
    snoise(p * 0.48 + vec2(-t * 0.18, t * 0.22)),
    snoise(p * 0.48 + vec2(t * 0.21, -t * 0.17))
  );
  float n4 = snoise((p + warp * 0.30) * 0.95 + f1 * 0.72);

  float a = smoothstep(-0.48, 0.38, n1);
  float b = smoothstep(-0.38, 0.58, n2);
  float c = smoothstep(-0.30, 0.60, n3);
  float d = smoothstep(-0.05, 0.70, n4);

  vec3 col = u_bg;
  col = mix(col, u_colors[3], a * 0.78);
  col = mix(col, u_colors[2], b * 0.78);
  col = mix(col, u_colors[1], c * 0.70);
  col = mix(col, u_colors[0], d * 0.58);

  float movingGlow = 0.5 + 0.5 * sin(t * 1.5 + n1 * 3.0);
  col += u_colors[1] * movingGlow * 0.08;

  float vignette = smoothstep(1.35, 0.10, length(p));
  col *= mix(0.52, 1.0, vignette);

  float grain = fract(sin(dot(vUv + u_time * 0.0001, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * u_grain * 0.04;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface VelarisProps {
  bg?: string;
  colors?: string[];
  speed?: number;
  grain?: number;
  height?: string;
  className?: string;
  children?: ReactNode;
}

const DEFAULT_COLORS = ["#60a5fa", "#a855f7", "#ec4899", "#06b6d4"];

const Velaris = ({
  bg = "#030305",
  colors = DEFAULT_COLORS,
  speed = 1.0,
  grain = 0.08,
  height = "100vh",
  className,
  children,
}: VelarisProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL shader creation failed");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "WebGL shader compilation failed";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };

    const program = gl.createProgram();
    if (!program) return;
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderGLSL);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderGLSL);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "WebGL program link failed";
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(message);
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const locs = {
      res: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      grain: gl.getUniformLocation(program, "u_grain"),
      colors: gl.getUniformLocation(program, "u_colors"),
      bg: gl.getUniformLocation(program, "u_bg"),
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(container.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(container.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    let raf = 0;
    const render = (timestamp: number) => {
      gl.useProgram(program);
      gl.uniform2f(locs.res, canvas.width, canvas.height);
      gl.uniform1f(locs.time, timestamp * 0.001 * speed);
      gl.uniform1f(locs.grain, grain);
      gl.uniform3f(locs.bg, ...hexToRgb(bg));
      const palette = colors.slice(0, 4);
      while (palette.length < 4) palette.push(DEFAULT_COLORS[palette.length]);
      gl.uniform3fv(locs.colors, new Float32Array(palette.flatMap(hexToRgb)));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [bg, colors, speed, grain]);

  return (
    <div ref={containerRef} style={{ height }} className={cn("relative w-full overflow-hidden", className)}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
};

export default Velaris;
