import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Map, Layers, ZoomIn } from 'lucide-react';
import { getProviderCoords } from './zipCoords';
import ProviderMapPopup from './ProviderMapPopup';
import 'react-leaflet';

// Heatmap overlay as density circles
function HeatmapLayer({ points }) {
  // Cluster points into grid cells for density
  const clusters = useMemo(() => {
    const grid = {};
    const cellSize = 0.15; // ~10 mile grid cells
    points.forEach(p => {
      const key = `${Math.round(p.lat / cellSize)}_${Math.round(p.lng / cellSize)}`;
      if (!grid[key]) grid[key] = { lat: 0, lng: 0, count: 0, totalScore: 0 };
      grid[key].lat += p.lat;
      grid[key].lng += p.lng;
      grid[key].count++;
      grid[key].totalScore += p.score;
    });
    return Object.values(grid).map(c => ({
      lat: c.lat / c.count,
      lng: c.lng / c.count,
      count: c.count,
      avgScore: Math.round(c.totalScore / c.count),
    }));
  }, [points]);

  const maxCount = Math.max(...clusters.map(c => c.count), 1);

  return clusters.map((cluster, i) => {
    const intensity = cluster.count / maxCount;
    const radius = 8 + intensity * 40;
    const opacity = 0.15 + intensity * 0.35;
    return (
      <CircleMarker
        key={`heat-${i}`}
        center={[cluster.lat, cluster.lng]}
        radius={radius}
        fillColor="#0d9488"
        fillOpacity={opacity}
        stroke={false}
      >
        <Popup>
          <div className="text-xs">
            <div className="font-semibold">{cluster.count} providers</div>
            <div className="text-slate-500">Avg Score: {cluster.avgScore}</div>
          </div>
        </Popup>
      </CircleMarker>
    );
  });
}

// Component to reset map view
function ResetViewButton({ center, zoom }) {
  const map = useMap();
  return (
    <Button
      variant="outline"
      size="sm"
      className="absolute top-2 right-2 z-[1000] bg-white shadow-sm h-7 text-xs gap-1"
      onClick={() => map.setView(center, zoom)}
    >
      <ZoomIn className="w-3 h-3" /> Reset View
    </Button>
  );
}

function getScoreColor(score, colorByScore) {
  if (!colorByScore) return '#0d9488'; // teal
  if (score >= 80) return '#16a34a'; // green
  if (score >= 60) return '#0d9488'; // teal
  if (score >= 40) return '#eab308'; // yellow
  if (score >= 20) return '#f97316'; // orange
  return '#94a3b8'; // slate
}

function getScoreRadius(score) {
  if (score >= 80) return 7;
  if (score >= 60) return 6;
  if (score >= 40) return 5;
  return 4;
}

export default function InteractiveProviderMap({ filteredProviders, showHeatmap, colorByScore, actions }) {
  const [mapLayer, setMapLayer] = useState('street'); // street | satellite

  // Build map points
  const mapPoints = useMemo(() => {
    const pts = [];
    filteredProviders.forEach(item => {
      const coords = getProviderCoords(item.location);
      if (coords) {
        pts.push({
          lat: coords[0],
          lng: coords[1],
          score: item.score || 0,
          item,
        });
      }
    });
    return pts;
  }, [filteredProviders]);

  const center = [40.27, -77.19]; // PA center
  const defaultZoom = 7;

  // Map stats
  const stats = useMemo(() => {
    if (mapPoints.length === 0) return null;
    const scores = mapPoints.map(p => p.score);
    return {
      total: mapPoints.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      high: scores.filter(s => s >= 70).length,
    };
  }, [mapPoints]);

  const tileUrl = mapLayer === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const tileAttr = mapLayer === 'satellite'
    ? '&copy; Esri'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Map className="w-4 h-4 text-teal-600" />
            Provider Map
          </span>
          <div className="flex items-center gap-2">
            {stats && (
              <div className="flex gap-2">
                <Badge variant="outline" className="text-[10px]">{stats.total} mapped</Badge>
                <Badge className="bg-teal-100 text-teal-700 text-[10px]">Avg {stats.avgScore}</Badge>
                <Badge className="bg-green-100 text-green-700 text-[10px]">{stats.high} high</Badge>
              </div>
            )}
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => setMapLayer(mapLayer === 'street' ? 'satellite' : 'street')}
              title="Toggle map style"
            >
              <Layers className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative" style={{ height: '560px' }}>
          {mapPoints.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-sm text-slate-400">
              No providers with mappable locations match your filters.
            </div>
          ) : (
            <MapContainer
              center={center}
              zoom={defaultZoom}
              className="h-full w-full z-0"
              scrollWheelZoom={true}
            >
              <TileLayer url={tileUrl} attribution={tileAttr} />
              <ResetViewButton center={center} zoom={defaultZoom} />

              {showHeatmap && <HeatmapLayer points={mapPoints} />}

              {mapPoints.map((point, idx) => (
                <CircleMarker
                  key={idx}
                  center={[point.lat, point.lng]}
                  radius={getScoreRadius(point.score)}
                  fillColor={getScoreColor(point.score, colorByScore)}
                  fillOpacity={0.85}
                  color="#fff"
                  weight={1}
                  opacity={0.8}
                >
                  <Popup maxWidth={300} className="custom-popup">
                    <ProviderMapPopup item={point.item} />
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          )}

          {/* Legend */}
          {colorByScore && mapPoints.length > 0 && (
            <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-2.5 border">
              <div className="text-[10px] font-semibold text-slate-700 mb-1.5">Score Legend</div>
              <div className="space-y-1">
                {[
                  { color: '#16a34a', label: '80–100 (Excellent)' },
                  { color: '#0d9488', label: '60–79 (Good)' },
                  { color: '#eab308', label: '40–59 (Moderate)' },
                  { color: '#f97316', label: '20–39 (Low)' },
                  { color: '#94a3b8', label: '0–19 (Minimal)' },
                ].map(({ color, label }) => (
                  <div key={color} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[10px] text-slate-600">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}