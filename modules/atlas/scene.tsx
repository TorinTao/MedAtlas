"use client";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BufferGeometry,
  CanvasTexture,
  Group,
  Line as ThreeLine,
  LineBasicMaterial,
  Sprite,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Method, Paper } from "../../shared/models";
import { coreTimeline, relatedPapers } from "./relations";
const modalities = ["影像+文本", "影像", "病历文本", "多模态"];
const tasks = ["诊断决策", "报告生成", "医学问答", "风险预测", "基础模型"];
export const methodColors: Record<Method, string> = {
  视觉语言模型: "#34ebd1",
  "Agent 协作": "#ffb443",
  检索增强: "#ad77ff",
  表征学习: "#56a8ff",
  多模态融合: "#c9df68",
  生成式模型: "#ff74ae",
  预测与分类: "#ff816b",
  评测与资源: "#f4db62",
  综述与趋势: "#73c5e8",
  待核验: "#8294a0",
};
function paperPosition(paper: Paper): [number, number, number] {
  const monthNames = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const date = paper.publishedAt.toLowerCase();
  const numericMonth = date.match(/^\d{4}-(\d{2})/);
  const month = numericMonth
    ? Number(numericMonth[1])
    : monthNames.findIndex((name) => date.includes(name)) + 1;
  const fraction = month >= 1 && month <= 12 ? (month - 6.5) / 12 : 0;
  return [
    (Math.max(2014, Math.min(2026, paper.year)) - 2020 + fraction) * 0.76,
    (modalities.indexOf(paper.modality) - 1.5) * 1.28,
    (tasks.indexOf(paper.clinicalTask) - 2) * 1.05,
  ];
}
function layoutPapers(papers: Paper[]): Map<string, [number, number, number]> {
  const groups = new Map<string, Paper[]>();
  for (const paper of papers) {
    const key = `${paper.year}|${paper.modality}|${paper.clinicalTask}`;
    groups.set(key, [...(groups.get(key) || []), paper]);
  }
  const nodes = [...groups.values()].flatMap((group) =>
    group
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((paper, index) => {
        const base = paperPosition(paper);
        const angle = index * 2.399963 + (paper.id.length % 7) * 0.35;
        const spread = 0.12 + Math.sqrt(index) * 0.17;
        return {
          paper,
          base,
          position: [
            base[0] + Math.sin(angle * 0.73) * spread * 0.7,
            base[1] + Math.cos(angle) * spread,
            base[2] + Math.sin(angle) * spread,
          ],
        };
      }),
  );
  // Relax overlaps while keeping every point close to its semantic coordinates.
  for (let pass = 0; pass < 14; pass++) {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        if (
          Math.abs(a.base[0] - b.base[0]) > 1.2 ||
          Math.abs(a.base[1] - b.base[1]) > 1.4 ||
          Math.abs(a.base[2] - b.base[2]) > 1.2
        )
          continue;
        const dx = a.position[0] - b.position[0],
          dy = a.position[1] - b.position[1],
          dz = a.position[2] - b.position[2];
        const distance = Math.hypot(dx, dy, dz) || 0.001;
        if (distance >= 0.4) continue;
        const force = ((0.4 - distance) * 0.32) / distance;
        a.position[0] += dx * force;
        a.position[1] += dy * force;
        a.position[2] += dz * force;
        b.position[0] -= dx * force;
        b.position[1] -= dy * force;
        b.position[2] -= dz * force;
      }
    for (const node of nodes)
      for (let axis = 0; axis < 3; axis++) {
        const range = [0.52, 0.69, 0.62][axis];
        node.position[axis] = Math.max(
          node.base[axis] - range,
          Math.min(node.base[axis] + range, node.position[axis]),
        );
      }
  }
  return new Map(
    nodes.map((node) => [
      node.paper.id,
      node.position as [number, number, number],
    ]),
  );
}
function pointTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const glow = context.createRadialGradient(64, 64, 0, 64, 64, 48);
  glow.addColorStop(0, "#fff");
  glow.addColorStop(0.3, "#fff");
  glow.addColorStop(0.52, "#ffffffed");
  glow.addColorStop(0.78, "#ffffff24");
  glow.addColorStop(1, "#ffffff00");
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
function Connection({
  from,
  to,
  color,
  opacity,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  opacity: number;
}) {
  const line = useMemo(
    () =>
      new ThreeLine(
        new BufferGeometry().setFromPoints([
          new Vector3(...from),
          new Vector3(...to),
        ]),
        new LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          depthTest: false,
        }),
      ),
    [from[0], from[1], from[2], to[0], to[1], to[2], color, opacity],
  );
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
    },
    [line],
  );
  return <primitive object={line} />;
}
function AxisLabel({
  text,
  position,
  color,
  width = 1.55,
}: {
  text: string;
  position: [number, number, number];
  color: string;
  width?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(8, 27, 37, .69)";
    context.fillRect(3, 12, 506, 104);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(4, 13, 504, 102);
    context.fillStyle = color;
    context.font = "700 44px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 256, 65, 470);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[width, width / 4, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}
function Controls() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(0, -0.45, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 7;
    controls.maxDistance = 25;
    controls.maxPolarAngle = Math.PI * 0.87;
    const timer = setInterval(() => controls.update(), 16);
    return () => {
      clearInterval(timer);
      controls.dispose();
    };
  }, [camera, gl]);
  return null;
}
function Star({
  paper,
  position,
  texture,
  selected,
  core,
  onPick,
  onHover,
  motion,
}: {
  paper: Paper;
  position: [number, number, number];
  texture: CanvasTexture;
  selected: boolean;
  core: boolean;
  onPick: (p: Paper) => void;
  onHover: (p: Paper | null) => void;
  motion: boolean;
}) {
  const group = useRef<Group>(null);
  const dot = useRef<Sprite>(null);
  const initial = useRef(position);
  const target = useMemo(() => new Vector3(...position), [position]);
  const size =
    0.25 +
    Math.min(1, paper.citationPercentile / 100) * 0.12 +
    (core ? 0.025 : 0) +
    (selected ? 0.08 : 0);
  useFrame(({ clock }, dt) => {
    if (group.current)
      group.current.position.lerp(target, Math.min(1, dt * 3.2));
    if (dot.current) {
      const pulse =
        motion && paper.year >= 2025
          ? 1 + Math.sin(clock.elapsedTime * 2.1 + position[0]) * 0.055
          : 1;
      dot.current.scale.setScalar(size * pulse);
    }
  });
  const over = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "pointer";
    onHover(paper);
  };
  return (
    <group ref={group} position={initial.current}>
      <sprite
        ref={dot}
        scale={[size, size, 1]}
        onClick={(e) => {
          e.stopPropagation();
          onPick(paper);
        }}
        onPointerOver={over}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
          onHover(null);
        }}
      >
        <spriteMaterial
          map={texture}
          color={methodColors[paper.method]}
          transparent
          opacity={selected ? 1 : 0.75 + paper.relevance * 0.22}
          depthWrite={false}
          depthTest={false}
        />
      </sprite>
    </group>
  );
}
function Plot({
  papers,
  selectedId,
  onPick,
  onHover,
  motion,
}: {
  papers: Paper[];
  selectedId: string;
  onPick: (p: Paper) => void;
  onHover: (p: Paper | null) => void;
  motion: boolean;
}) {
  const group = useRef<Group>(null);
  const positions = useMemo(() => layoutPapers(papers), [papers]);
  const texture = useMemo(() => pointTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  const selected = papers.find((p) => p.id === selectedId);
  const related = selected ? relatedPapers(papers, selected, 8) : [];
  const core = coreTimeline(papers);
  const coreIds = new Set(core.map((paper) => paper.id));
  useFrame((_, dt) => {
    if (motion && group.current) group.current.rotation.y += dt * 0.018;
  });
  return (
    <group ref={group}>
      <gridHelper
        args={[12, 12, "#243d50", "#122b3a"]}
        position={[0, -3.1, 0]}
      />
      <mesh position={[0, -3.05, 0]}>
        <boxGeometry args={[10.3, 0.018, 5.3]} />
        <meshBasicMaterial
          color="#264656"
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>
      {[-4.56, -2.28, 0, 2.28, 4.56].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <boxGeometry args={[0.008, 6, 5.2]} />
          <meshBasicMaterial
            color="#244659"
            transparent
            opacity={i === 2 ? 0.24 : 0.1}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh position={[0, -2.63, 2.7]}>
        <boxGeometry args={[10.3, 0.028, 0.028]} />
        <meshBasicMaterial color="#70e1e1" />
      </mesh>
      <mesh position={[-5.15, 0, 2.7]}>
        <boxGeometry args={[0.028, 5.26, 0.028]} />
        <meshBasicMaterial color="#e8bd7f" />
      </mesh>
      <mesh position={[-5.15, -2.63, 0]}>
        <boxGeometry args={[0.028, 0.028, 5.4]} />
        <meshBasicMaterial color="#bcaaf9" />
      </mesh>
      <AxisLabel
        text="X · 发表时间"
        position={[4.15, -3.58, 2.7]}
        color="#70e1e1"
      />
      <AxisLabel
        text="Y · 医学模态"
        position={[-4.45, 3.05, 2.7]}
        color="#e8bd7f"
      />
      <AxisLabel
        text="Z · 临床任务"
        position={[-4.3, -2.6, -3.1]}
        color="#bcaaf9"
      />
      {[2014, 2017, 2020, 2023, 2026].map((year) => (
        <AxisLabel
          key={year}
          text={String(year)}
          position={[(year - 2020) * 0.76, -2.98, 2.7]}
          color="#9cc5c7"
          width={0.85}
        />
      ))}
      {core.slice(1).map((paper, index) => (
        <Connection
          key={`core-${paper.id}`}
          from={positions.get(core[index].id) || paperPosition(core[index])}
          to={positions.get(paper.id) || paperPosition(paper)}
          color="#f2d796"
          opacity={0.46}
        />
      ))}
      {selected &&
        related.map(({ paper }) => (
          <Connection
            key={`related-${selected.id}-${paper.id}`}
            from={positions.get(selected.id) || paperPosition(selected)}
            to={positions.get(paper.id) || paperPosition(paper)}
            color="#74e3db"
            opacity={0.62}
          />
        ))}
      {papers.map((p) => (
        <Star
          key={p.id}
          paper={p}
          position={positions.get(p.id) || paperPosition(p)}
          texture={texture}
          selected={p.id === selectedId}
          core={coreIds.has(p.id)}
          onPick={onPick}
          onHover={onHover}
          motion={motion}
        />
      ))}
    </group>
  );
}
export default function AtlasScene({
  papers,
  selectedId,
  onPick,
  motion,
}: {
  papers: Paper[];
  selectedId: string;
  onPick: (p: Paper) => void;
  motion: boolean;
}) {
  const [hovered, setHovered] = useState<Paper | null>(null);
  return (
    <div className="scene-wrap" aria-label="三维论文时间地图">
      <Canvas
        camera={{ position: [7, 6.4, 10], fov: 42, zoom: 1.05 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.45} />
        <Plot
          papers={papers}
          selectedId={selectedId}
          onPick={onPick}
          onHover={setHovered}
          motion={motion}
        />
        <Controls />
      </Canvas>
      {hovered && (
        <div className="scene-tooltip">
          <span>
            {hovered.year} · {hovered.paperType}
          </span>
          <strong>{hovered.title}</strong>
        </div>
      )}
    </div>
  );
}
