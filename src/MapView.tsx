import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Ad, money } from './core';

export default function MapView({ ads }: { ads: Ad[] }) {
  const el = useRef<HTMLDivElement>(null); const nav = useNavigate();
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current).setView([56.88, 24.6], 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
    const pts: [number, number][] = [];
    ads.forEach((a) => {
      if (a.lat == null || a.lng == null) return;
      pts.push([a.lat, a.lng]);
      const label = document.createElement('span'); label.textContent = money(a.price, '…');
      const m = L.marker([a.lat, a.lng], { title: a.title, icon: L.divIcon({ className: 'pin', html: label.outerHTML, iconSize: undefined }) }).addTo(map);
      m.on('click', () => nav(`/ad/${a.id}`));
    });
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
    return () => { map.remove(); };
  }, [ads, nav]);
  return <div ref={el} className="map" />;
}
