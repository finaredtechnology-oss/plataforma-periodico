import React, { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

export const getFullImageUrl = (path: string | null) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  let cleanPath = path;
  if (!cleanPath.startsWith('/')) {
    cleanPath = '/' + cleanPath;
  }
  if (!cleanPath.startsWith('/media/')) {
    cleanPath = '/media' + cleanPath;
  }
  let backendHost = '';
  if (import.meta.env.VITE_API_URL) {
    if (import.meta.env.VITE_API_URL.startsWith('http://') || import.meta.env.VITE_API_URL.startsWith('https://')) {
      backendHost = import.meta.env.VITE_API_URL.replace('/api/v1', '');
    }
  }
  return `${backendHost}${encodeURI(cleanPath)}`;
};

export interface Ad {
  image: string;
  link: string;
  alt: string;
}

export const ADS_LIST: Ad[] = [
  {
    image: '/media/ad_passgo_events.jpg',
    link: 'https://passandgo.com.pe',
    alt: 'Pass & Go - Ticketing inteligente para eventos',
  },
  {
    image: '/media/ad_fincontrol_supervision.jpg',
    link: 'https://fincontrol.finatech.com.pe',
    alt: 'FinControl - Supervisión inteligente del personal operativo',
  },
  {
    image: '/media/ad_passgo_tickets.jpg',
    link: 'https://passandgo.com.pe',
    alt: 'Pass & Go - Vende entradas y controla accesos',
  },
  {
    image: '/media/ad_fincontrol_smart.jpg',
    link: 'https://fincontrol.finatech.com.pe',
    alt: 'FinControl - Hoy, el control es inteligente',
  },
];


interface AdBannerProps {
  positionId: string;
  initialIndex?: number;
  autoRotate?: boolean;
}

export function AdBanner({
  positionId,
  initialIndex = 0,
  autoRotate = true,
}: AdBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(
    initialIndex % ADS_LIST.length
  );
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!autoRotate) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ADS_LIST.length);
    }, 8000); // rota cada 8 segundos

    return () => clearInterval(interval);
  }, [autoRotate, positionId]);

  if (!isVisible) return null;

  const currentAd = ADS_LIST[currentIndex];

  return (
    <section className="w-full bg-white py-4 select-none px-4 sm:px-6">
      <div className="max-w-4xl mx-auto w-fit relative group overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-md hover:shadow-lg transition-all duration-300">

        {/* Close Button */}
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white transition-colors backdrop-blur-sm active:scale-95"
          title="Ocultar anuncio"
          aria-label="Ocultar anuncio"
        >
          <X className="w-3 h-3" />
        </button>

        {/* Link Wrapper */}
        <a
          href={currentAd.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block h-[105px] sm:h-[130px] md:h-[145px] overflow-hidden relative cursor-pointer bg-white"
        >
          <img
            src={getFullImageUrl(currentAd.image)}
            alt={currentAd.alt}
            className="h-full w-auto max-w-full block mx-auto transition-transform duration-500 group-hover:scale-[1.01]"
          />

          {/* Hover Overlay with CTA */}
          <div className="absolute inset-0 z-10 bg-slate-950/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-end pr-8 pointer-events-none">
            <div className="bg-white/95 backdrop-blur-sm text-slate-800 rounded-full px-3.5 py-1.5 text-[9px] font-black tracking-widest uppercase flex items-center gap-1 shadow-lg transform translate-x-2 group-hover:translate-x-0 transition-transform duration-300 border border-slate-200/60">
              <span>Visitar Sitio</span>
              <ExternalLink className="w-3 h-3 text-orange-500" />
            </div>
          </div>
        </a>
      </div>
    </section>
  );
}