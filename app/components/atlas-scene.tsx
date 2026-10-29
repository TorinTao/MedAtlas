"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CanvasTexture, Group, Mesh, SRGBColorSpace } from "three";
import type { Paper } from "../../lib/types";

const modalities = ["影像+文本", "影像", "病历文本", "多模态"];
const tasks = ["诊断决策", "报告生成", "医学问答", "风险预测", "基础模型"];
export const methodColors: Record<string, string> = { "视觉语言模型": "#7de7e5", "Agent 协作": "#dfb779", "检索增强": "#b7a1fa", "表征学习": "#8ab7ed", "其他方法": "#91a8bc" };

function AxisLabel({ text, position, color, width = 2.15 }: { text: string; position: [number, number, number]; color: string; width?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(8, 27, 37, .86)"; context.fillRect(3, 12, 506, 104);
    context.strokeStyle = color; context.lineWidth = 3; context.strokeRect(4, 13, 504, 102);
    context.fillStyle = color; context.font = "700 44px system-ui, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(text, 256, 65, 470);
    const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace; return result;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={position} scale={[width, width / 4, 1]}><spriteMaterial map={texture} transparent depthTest={false} /></sprite>;
}

function Controls() {
  const { camera, gl } = useThree();
  useEffect(() => { const controls = new OrbitControls(camera, gl.domElement); controls.target.set(0, -0.45, 0); controls.enableDamping = true; controls.dampingFactor = 0.06; controls.minDistance = 7; controls.maxDistance = 25; controls.maxPolarAngle = Math.PI * 0.87; const timer = setInterval(() => controls.update(), 16); return () => { clearInterval(timer); controls.dispose(); }; }, [camera, gl]);
  return null;
}

function Star({ paper, selected, onPick, onHover, motion }: { paper: Paper; selected: boolean; onPick: (p: Paper) => void; onHover: (p: Paper | null) => void; motion: boolean }) {
  const mesh = useRef<Mesh>(null); const aura = useRef<Mesh>(null);
  const position = useMemo(() => {
    const hash = paper.id.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 0) >>> 0;
    const jitter = (shift: number) => ((hash >> shift) % 100) / 100 - 0.5;
    return [(Math.max(2018, Math.min(2026, paper.year)) - 2022) * 1.14, (modalities.indexOf(paper.modality) - 1.5) * 1.28 + jitter(3) * 0.22, (tasks.indexOf(paper.clinicalTask) - 2) * 1.05 + jitter(8) * 0.28] as [number, number, number];
  }, [paper]);
  const radius = 0.115 + Math.min(1, paper.citationPercentile / 100) * 0.16 + (selected ? 0.075 : 0);
  useFrame(({ clock }) => { if (!mesh.current || !aura.current) return; const pulse = motion && paper.year >= 2025 ? 1 + Math.sin(clock.elapsedTime * 2.1 + position[0]) * 0.08 : 1; mesh.current.scale.setScalar(pulse); aura.current.scale.setScalar(pulse * (selected ? 1.6 : 1.25)); });
  const over = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); document.body.style.cursor = "pointer"; onHover(paper); };
  return <group position={position}>
    <mesh ref={aura}><sphereGeometry args={[radius * 1.85, 16, 16]} /><meshBasicMaterial color={methodColors[paper.method]} transparent opacity={selected ? 0.19 : 0.045} depthWrite={false} /></mesh>
    <mesh ref={mesh} onClick={e => { e.stopPropagation(); onPick(paper); }} onPointerOver={over} onPointerOut={() => { document.body.style.cursor = "auto"; onHover(null); }}>
      <sphereGeometry args={[radius, 20, 20]} /><meshStandardMaterial color={methodColors[paper.method]} emissive={methodColors[paper.method]} emissiveIntensity={selected ? 0.7 : 0.12 + paper.relevance * 0.26} roughness={0.32} metalness={0.05} />
    </mesh>
  </group>;
}

function Plot({ papers, selectedId, onPick, onHover, motion }: { papers: Paper[]; selectedId: string; onPick: (p: Paper) => void; onHover: (p: Paper | null) => void; motion: boolean }) {
  const group = useRef<Group>(null);
  useFrame((_, dt) => { if (motion && group.current) group.current.rotation.y += dt * 0.018; });
  return <group ref={group}>
    <gridHelper args={[12, 12, "#355365", "#193342"]} position={[0, -3.1, 0]} />
    <mesh position={[0, -3.05, 0]}><boxGeometry args={[10.3, 0.018, 5.3]} /><meshBasicMaterial color="#365167" transparent opacity={0.28} /></mesh>
    {[-4.56, -2.28, 0, 2.28, 4.56].map((x, i) => <mesh key={i} position={[x, 0, 0]}><boxGeometry args={[0.008, 6, 5.2]} /><meshBasicMaterial color="#31536a" transparent opacity={i === 2 ? 0.34 : 0.16} /></mesh>)}
    <mesh position={[0, -2.63, 2.7]}><boxGeometry args={[10.3, 0.028, 0.028]} /><meshBasicMaterial color="#70e1e1" /></mesh>
    <mesh position={[-5.15, 0, 2.7]}><boxGeometry args={[0.028, 5.26, 0.028]} /><meshBasicMaterial color="#e8bd7f" /></mesh>
    <mesh position={[-5.15, -2.63, 0]}><boxGeometry args={[0.028, 0.028, 5.4]} /><meshBasicMaterial color="#bcaaf9" /></mesh>
    <AxisLabel text="X · 发表时间" position={[4.15, -3.58, 2.7]} color="#70e1e1" />
    <AxisLabel text="Y · 医学模态" position={[-4.45, 3.05, 2.7]} color="#e8bd7f" />
    <AxisLabel text="Z · 临床任务" position={[-4.3, -2.6, -3.1]} color="#bcaaf9" />
    {[2018, 2020, 2022, 2024, 2026].map(year => <AxisLabel key={year} text={String(year)} position={[(year - 2022) * 1.14, -2.98, 2.7]} color="#9cc5c7" width={0.85} />)}
    {papers.map(p => <Star key={p.id} paper={p} selected={p.id === selectedId} onPick={onPick} onHover={onHover} motion={motion} />)}
  </group>;
}

export default function AtlasScene({ papers, selectedId, onPick, motion }: { papers: Paper[]; selectedId: string; onPick: (p: Paper) => void; motion: boolean }) {
  const [hovered, setHovered] = useState<Paper | null>(null);
  return <div className="scene-wrap" aria-label="三维论文时间地图">
    <Canvas camera={{ position: [7, 6.4, 10], fov: 42, zoom: 1.05 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.82} /><pointLight position={[0, 6, 3]} intensity={4.5} color="#87e7ed" /><pointLight position={[-5, 3, -4]} intensity={2.5} color="#adb5fd" />
      <Plot papers={papers} selectedId={selectedId} onPick={onPick} onHover={setHovered} motion={motion} /><Controls />
    </Canvas>
    {hovered && <div className="scene-tooltip"><span>{hovered.year} · {hovered.paperType}</span><strong>{hovered.title}</strong></div>}
    <div className="scene-instruction">拖动旋转 <span>·</span> 滚轮缩放 <span>·</span> 点击论文节点</div>
    <div className="scene-coordinates" aria-label="三维坐标轴说明"><div><b className="coord-x">X</b><strong>发表时间</strong><small>2018—2026</small></div><div><b className="coord-y">Y</b><strong>医学模态</strong><small>影像 · 文本 · 融合</small></div><div><b className="coord-z">Z</b><strong>临床任务</strong><small>诊断 · 报告 · 问答等</small></div></div>
  </div>;
}
