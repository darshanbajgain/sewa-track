'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useEffectEvent, useRef } from 'react';
import type { DistrictShapes } from '@/api/geo.api';

/**
 * The Leaflet part of the delay map, and nothing else: draw the 77 districts, colour them, report clicks.
 * It knows nothing about metrics or the API; DelayMap passes in a colour and a label per district.
 *
 * Leaflet works on the real DOM (window, document), so this file is loaded only in the browser
 * (`next/dynamic` with ssr: false in DelayMap). React owns the <div>; Leaflet owns what's inside it.
 *
 * No background tiles (OpenStreetMap etc.) on purpose: tiles would draw their OWN border lines, which
 * may not follow Nepal's 2020 map, and they'd send every visitor's requests to a third party.
 */
interface Props {
  shapes: DistrictShapes;
  colorOf: (districtId: number) => string;
  labelOf: (districtId: number) => string;
  selectedId: number | null;
  onSelect: (districtId: number) => void;
  credit: string;
}

export default function DistrictMap({ shapes, colorOf, labelOf, selectedId, onSelect, credit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  // Latest callbacks without re-creating the map on every render (same trick as Modal's onClose).
  const select = useEffectEvent((id: number) => onSelect(id));
  const label = useEffectEvent((id: number) => labelOf(id));

  // 1. Create the map and the district layer ONCE.
  useEffect(() => {
    const map = L.map(containerRef.current!, {
      zoomSnap: 0.25,
      scrollWheelZoom: false, // don't trap the page scroll; +/− buttons and pinch still zoom
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false).addAttribution(credit);

    const layer = L.geoJSON(shapes as never, {
      style: { weight: 0.8, color: '#ffffff', fillOpacity: 0.9 },
      onEachFeature: (feature, path) => {
        const id = (feature.properties as { districtId: number }).districtId;
        path.on('click', () => select(id));
        path.bindTooltip(() => label(id), { sticky: true });
      },
    }).addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [8, 8] });
    layerRef.current = layer;

    // Refit when the box changes size (phone rotation, side panel opening).
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      map.fitBounds(layer.getBounds(), { padding: [8, 8] });
    });
    observer.observe(containerRef.current!);

    return () => {
      observer.disconnect();
      map.remove();
      layerRef.current = null;
    };
  }, [shapes, credit]);

  // 2. Re-colour whenever the data or the selection changes (cheap: no map rebuild).
  useEffect(() => {
    layerRef.current?.setStyle((feature) => {
      const id = (feature?.properties as { districtId: number }).districtId;
      const selected = id === selectedId;
      return { fillColor: colorOf(id), weight: selected ? 3 : 0.8, color: selected ? '#003893' : '#ffffff' };
    });
    layerRef.current?.eachLayer((l) => {
      const id = ((l as L.Path & { feature: { properties: { districtId: number } } }).feature.properties).districtId;
      if (id === selectedId) (l as L.Path).bringToFront();
    });
  }, [colorOf, selectedId]);

  // Inline background: Leaflet's own CSS sets a grey one on this element, and inline style wins.
  return <div ref={containerRef} className="h-full w-full" style={{ background: 'var(--color-surface)' }} />;
}
