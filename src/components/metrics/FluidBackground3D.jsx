import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const fragmentShader = `
uniform float u_time;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
varying vec2 vUv;
varying vec3 vPosition;

// Simple 3D noise function
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

void main() {
    float noise = snoise(vPosition * 1.5 + u_time * 0.2);
    vec3 color = mix(u_colorA, u_colorB, noise * 0.5 + 0.5);
    gl_FragColor = vec4(color, 1.0);
}
`;

const vertexShader = `
uniform float u_time;
uniform float u_speed;
uniform float u_intensity;
varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vec3 pos = position;
    // Efecto de latido / respiración
    pos.x += sin(pos.y * 3.0 + u_time * u_speed) * u_intensity;
    pos.y += cos(pos.z * 3.0 + u_time * u_speed) * u_intensity;
    pos.z += sin(pos.x * 3.0 + u_time * u_speed) * u_intensity;
    
    vPosition = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

function FluidSphere({ workloadScore }) {
    const mesh = useRef();
    
    // workloadScore de 0 a 1 (0 = tranquilo, 1 = saturado)
    const targetColorA = useMemo(() => new THREE.Color().lerpColors(new THREE.Color('#3b82f6'), new THREE.Color('#ef4444'), workloadScore), [workloadScore]);
    const targetColorB = useMemo(() => new THREE.Color().lerpColors(new THREE.Color('#0ea5e9'), new THREE.Color('#f59e0b'), workloadScore), [workloadScore]);

    const uniforms = useMemo(() => ({
        u_time: { value: 0 },
        u_speed: { value: 1.0 + (workloadScore * 4.0) },
        u_intensity: { value: 0.1 + (workloadScore * 0.15) },
        u_colorA: { value: targetColorA },
        u_colorB: { value: targetColorB },
    }), []);

    useEffect(() => {
        if (mesh.current) {
            mesh.current.material.uniforms.u_speed.value = 1.0 + (workloadScore * 4.0);
            mesh.current.material.uniforms.u_intensity.value = 0.1 + (workloadScore * 0.15);
            mesh.current.material.uniforms.u_colorA.value.copy(targetColorA);
            mesh.current.material.uniforms.u_colorB.value.copy(targetColorB);
        }
    }, [workloadScore, targetColorA, targetColorB]);

    useFrame((state) => {
        const { clock } = state;
        if (mesh.current) {
            mesh.current.material.uniforms.u_time.value = clock.getElapsedTime();
            mesh.current.rotation.x = clock.getElapsedTime() * 0.1;
            mesh.current.rotation.y = clock.getElapsedTime() * 0.15;
        }
    });

    return (
        <mesh ref={mesh} scale={2}>
            <sphereGeometry args={[1, 128, 128]} />
            <shaderMaterial 
                fragmentShader={fragmentShader}
                vertexShader={vertexShader}
                uniforms={uniforms}
                wireframe={false}
                transparent={true}
                opacity={0.8}
            />
        </mesh>
    );
}

export default function FluidBackground3D({ workloadScore = 0 }) {
    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <Canvas camera={{ position: [0, 0, 5] }} style={{ filter: 'blur(30px)', opacity: 0.5 }}>
                <ambientLight intensity={0.5} />
                <FluidSphere workloadScore={workloadScore} />
            </Canvas>
        </div>
    );
}
