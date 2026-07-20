import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { X } from 'lucide-react';

const ConfettiParticle = ({ position, color }) => {
    const mesh = useRef();
    const [speed] = useState(() => Math.random() * 0.05 + 0.02);
    const [rotSpeed] = useState(() => new THREE.Vector3(Math.random() * 0.2 - 0.1, Math.random() * 0.2 - 0.1, Math.random() * 0.2 - 0.1));

    useFrame(() => {
        if (!mesh.current) return;
        mesh.current.position.y -= speed;
        mesh.current.rotation.x += rotSpeed.x;
        mesh.current.rotation.y += rotSpeed.y;
        mesh.current.rotation.z += rotSpeed.z;

        if (mesh.current.position.y < -10) {
            mesh.current.position.y = 10;
        }
    });

    return (
        <mesh ref={mesh} position={position}>
            <planeGeometry args={[0.2, 0.4]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
    );
};

const ConfettiSystem = () => {
    const colors = ['#facc15', '#f87171', '#60a5fa', '#34d399', '#a78bfa', '#fb923c'];
    const particles = Array.from({ length: 300 }).map((_, i) => ({
        id: i,
        position: [
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20 + 10,
            (Math.random() - 0.5) * 10 - 5
        ],
        color: colors[Math.floor(Math.random() * colors.length)]
    }));

    return (
        <>
            {particles.map(p => (
                <ConfettiParticle key={p.id} position={p.position} color={p.color} />
            ))}
        </>
    );
};

const playFanfare = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        
        // C-Major arpeggio fanfare
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        const times = [0, 0.2, 0.4, 0.6];
        
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.value = freq;
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const start = ctx.currentTime + times[i];
            
            // Envelope
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.3, start + 0.05);
            
            if (i === notes.length - 1) {
                // Last note holds longer
                gain.gain.exponentialRampToValueAtTime(0.01, start + 1.5);
                osc.start(start);
                osc.stop(start + 1.5);
            } else {
                gain.gain.exponentialRampToValueAtTime(0.01, start + 0.2);
                osc.start(start);
                osc.stop(start + 0.2);
            }
        });

        // Drum roll (noise)
        const bufferSize = ctx.sampleRate * 1.5; // 1.5 seconds
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 1000;
        
        const noiseGain = ctx.createGain();
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        
        noiseGain.gain.setValueAtTime(0, ctx.currentTime);
        noiseGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
        
        noise.start(ctx.currentTime);
        noise.stop(ctx.currentTime + 1.5);

    } catch (e) {
        console.error("Audio API not supported or blocked", e);
    }
};

export default function FrojoCelebration({ onClose }) {
    useEffect(() => {
        // Reproducir sonido al montar, con un ligero retraso para asegurar el render
        setTimeout(() => playFanfare(), 300);
    }, []);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
        }}>
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
                    <ambientLight intensity={1} />
                    <ConfettiSystem />
                </Canvas>
            </div>
            
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '800px', padding: '20px' }}>
                <h1 style={{ 
                    color: '#fbbf24', 
                    fontSize: '3rem', 
                    fontWeight: 900, 
                    textShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    marginBottom: '30px',
                    animation: 'bounce 2s infinite',
                    lineHeight: 1.2
                }}>
                    ¡Felicidades al flamante Coordinador de Administración!
                </h1>
                
                <div style={{
                    width: '320px',
                    height: '320px',
                    margin: '0 auto',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '8px solid #facc15',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 40px rgba(250, 204, 21, 0.4)',
                    animation: 'pulse 2s infinite'
                }}>
                    <video 
                        src="/Man_smiles_and_nods_directly_202606181046.mp4" 
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </div>
                
                <button
                    onClick={onClose}
                    style={{
                        marginTop: '40px',
                        padding: '16px 32px',
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        color: '#1e3a8a',
                        background: '#facc15',
                        border: 'none',
                        borderRadius: '50px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                        transition: 'transform 0.2s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    Continuar al sistema <X size={20} />
                </button>
            </div>
            <style>{`
                @keyframes bounce {
                    0%, 100% { transform: translateY(-5px); }
                    50% { transform: translateY(5px); }
                }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
