import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X, Download } from 'lucide-react';
import api from '../services/api';
import { usePWA } from '../contexts/PWAContext';
import { useAuth } from '../contexts/auth';

const getFullImageUrl = (path: string | null) => {
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

const defaultEditions = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1564750576234-75de3cc54053?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhbWF6b24lMjByaXZlciUyMGxhbmRzY2FwZXxlbnwxfHx8fDE3ODI0OTE3MzV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1599582964755-971498d2b4a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhbWF6b24lMjByYWluZm9yZXN0JTIwc3Vuc2V0JTIwcml2ZXJ8ZW58MXx8fHwxNzgyNDkxNzM0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1612729875065-1385f02852ef?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJ1dmlhbiUyMGxhbmRzY2FwZSUyMG5hdHVyZXxlbnwxfHx8fDE3ODI0OTE3MzV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
  },
  {
    id: 4,
    image: 'https://images.unsplash.com/photo-1683476656066-c48bfc06621e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cm9waWNhbCUyMGZydWl0cyUyMG1hcmtldHxlbnwxfHx8fDE3ODI0OTE3MzZ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
  },
  {
    id: 5,
    image: 'https://images.unsplash.com/photo-1622659097509-4d56de14539e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2NjZXIlMjB0ZWFtJTIwY2hpbGRyZW58ZW58MXx8fHwxNzgyNDkxNzM7fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
  }
];

export function LatestEditions() {
  const { isAuthenticated } = useAuth();
  const { isInstallable, installPWA } = usePWA();
  const [landingEditions, setLandingEditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollAmount = clientWidth * 0.8;
      scrollContainerRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const fetchLandingEditions = async () => {
      try {
        const response = await api.get('/public/editions-landing/');
        setLandingEditions(response.data || []);
      } catch (err) {
        console.warn("Could not fetch landing editions, using defaults:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLandingEditions();
  }, []);

  const itemsToDisplay = landingEditions.length > 0 ? landingEditions : defaultEditions;

  return (
    <div>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-8 select-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6600" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-800">Últimas ediciones</h2>
          </div>
          <a 
            href="https://www.facebook.com/profile.php?id=61590243585425" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-bold text-sm transition-colors cursor-pointer"
          >
            Ver todas
            <ChevronRight size={20} />
          </a>
        </div>

        <style dangerouslySetInnerHTML={{__html: `
          .no-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}} />

        {/* Navigation */}
        <div className="flex justify-end gap-2 mb-4 select-none">
          <button 
            onClick={() => scroll('left')}
            className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={() => scroll('right')}
            className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Editions Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-10 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            <span className="text-xs text-slate-500 font-bold">Cargando ediciones...</span>
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            className="flex overflow-x-auto no-scrollbar scroll-smooth gap-3 pb-3"
          >
            {itemsToDisplay.map((item, idx) => (
              <div 
                key={item.id || idx} 
                onClick={() => setSelectedImage(getFullImageUrl(item.imagen || item.image))}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-all duration-300 h-[216px] w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(20%-9.6px)] flex-shrink-0 flex flex-col group cursor-pointer"
              >
                {/* Logo Header */}
                <div className="px-3 py-2.5 border-b flex items-center gap-1.5 flex-shrink-0 select-none bg-slate-50">
                  <span className="text-xs font-black tracking-wide" style={{ color: '#ff6600', fontFamily: 'cursive' }}>Amazonía</span>
                  <svg width="15" height="15" viewBox="0 0 50 50" fill="none">
                    <circle cx="25" cy="25" r="15" fill="#ff6600"/>
                    <path d="M25 13 L28 20 L25 19 L22 20 Z" fill="#ffcc00"/>
                  </svg>
                </div>

                {/* Image filling 100% of the remaining area */}
                <div className="flex-1 w-full overflow-hidden bg-slate-950">
                  <img
                    src={getFullImageUrl(item.imagen || item.image)}
                    alt="Edición de portada"
                    className="w-full h-full object-fill select-none pointer-events-none group-hover:scale-102 transition-transform duration-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {isAuthenticated && isInstallable && (
          <div className="flex justify-center mt-6">
            <button
              onClick={installPWA}
              className="flex items-center gap-2 px-6 py-3 bg-[#1a4d2e] hover:bg-[#153e25] text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer uppercase tracking-wider hover:scale-102 duration-300 animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <Download size={14} />
              Descargar app
            </button>
          </div>
        )}
      </div>

      {/* Modal for viewing the selected edition image in full detail */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div 
            className="relative bg-white rounded-2xl overflow-hidden shadow-2xl max-w-xl w-full border border-slate-100 flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between bg-slate-50 select-none">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-wide" style={{ color: '#ff6600', fontFamily: 'cursive' }}>Amazonía</span>
                <svg width="16" height="16" viewBox="0 0 50 50" fill="none">
                  <circle cx="25" cy="25" r="15" fill="#ff6600"/>
                  <path d="M25 13 L28 20 L25 19 L22 20 Z" fill="#ffcc00"/>
                </svg>
              </div>
              <button 
                onClick={() => setSelectedImage(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            {/* Image display */}
            <div className="bg-slate-900 p-2 flex items-center justify-center max-h-[80vh] overflow-y-auto">
              <img
                src={selectedImage}
                alt="Edición Amazonía completa"
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LatestEditions;
