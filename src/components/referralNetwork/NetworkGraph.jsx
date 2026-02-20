import React, { useMemo, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const NODE_COLORS = {
  Individual: '#3b82f6',
  Organization: '#8b5cf6',
  hub: '#ef4444',
};

export default function NetworkGraph({ nodes = [], edges = [], onNodeClick }) {
  const svgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);

  const layout = useMemo(() => {
    if (nodes.length === 0) return { nodes: [], edges: [] };
    const sorted = [...nodes].sort((a, b) => b.totalVolume - a.totalVolume);
    const cx = 400, cy = 300;
    const laid = sorted.map((node, i) => {
      if (i === 0) return { ...node, x: cx, y: cy };
      const angle = (2 * Math.PI * i) / (sorted.length - 1 || 1);
      const radius = 120 + Math.min(i * 15, 220);
      return { ...node, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    });

    const nodeMap = {};
    laid.forEach(n => { nodeMap[n.npi] = n; });

    const laidEdges = edges.map(e => ({
      ...e,
      x1: nodeMap[e.source]?.x || 0, y1: nodeMap[e.source]?.y || 0,
      x2: nodeMap[e.target]?.x || 0, y2: nodeMap[e.target]?.y || 0,
    })).filter(e => e.x1 && e.x2);

    return { nodes: laid, edges: laidEdges };
  }, [nodes, edges]);

  const maxVol = Math.max(...layout.nodes.map(n => n.totalVolume), 1);
  const maxEdgeVol = Math.max(...layout.edges.map(e => e.volume), 1);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'circle' || e.target.tagName === 'text') return;
    setDrag({ startX: e.clientX - offset.x, startY: e.clientY - offset.y });
  };
  const handleMouseMove = (e) => { if (drag) setOffset({ x: e.clientX - drag.startX, y: e.clientY - drag.startY }); };
  const handleMouseUp = () => setDrag(null);

  return (
    <Card className="overflow-hidden bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300">Referral Network Graph</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-200" onClick={() => setZoom(z => Math.min(z + 0.2, 3))}><ZoomIn className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-200" onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))}><ZoomOut className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-200" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><Maximize2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
        <div className="flex gap-3 mt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Individual</div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Organization</div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> Hub</div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <svg
          ref={svgRef} width="100%" height="500" viewBox="0 0 800 600"
          className="bg-[#0d1520] cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        >
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`}>
            {layout.edges.map((e, i) => {
              const opacity = 0.1 + (e.volume / maxEdgeVol) * 0.5;
              const width = 1 + (e.volume / maxEdgeVol) * 4;
              return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#475569" strokeWidth={width} strokeOpacity={opacity} />;
            })}
            {layout.nodes.map(n => {
              const r = 8 + (n.totalVolume / maxVol) * 25;
              const color = n.isHub ? NODE_COLORS.hub : NODE_COLORS[n.entityType] || '#64748b';
              const isHovered = hoveredNode === n.npi;
              return (
                <g key={n.npi}
                  onMouseEnter={() => setHoveredNode(n.npi)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => onNodeClick?.(n)}
                  className="cursor-pointer"
                >
                  <circle cx={n.x} cy={n.y} r={r + (isHovered ? 3 : 0)}
                    fill={color} fillOpacity={isHovered ? 1 : 0.8}
                    stroke={isHovered ? '#22d3ee' : '#1e293b'} strokeWidth={isHovered ? 2.5 : 1.5}
                  />
                  {(r > 14 || isHovered) && (
                    <text x={n.x} y={n.y + r + 12} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight={isHovered ? '600' : '400'}>
                      {n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label}
                    </text>
                  )}
                  {isHovered && (
                    <text x={n.x} y={n.y + r + 22} textAnchor="middle" fontSize="8" fill="#64748b">
                      {n.totalVolume.toLocaleString()} referrals
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </CardContent>
    </Card>
  );
}