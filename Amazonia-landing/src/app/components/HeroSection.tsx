import React, { useState, useEffect } from 'react';
import { Loader2, X, Eye } from 'lucide-react';
import api from '../services/api';

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

export function HeroSection() {
  const [config, setConfig] = useState({
    hero_title: 'La información que conecta nuestra región',
    hero_subtitle: 'Noticias locales, nacionales e internacionales con el enfoque que importa a nuestra comunidad.',
    hero_background_url: 'https://images.unsplash.com/photo-1599582964755-971498d2b4a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhbWF6b24lMjByYWluZm9yZXN0JTIwc3Vuc2V0JTIwcml2ZXJ8ZW58MXx8fHwxNzgyNDkxNzM0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    hero_background_position: 'center'
  });

  const [latestEdition, setLatestEdition] = useState<any>(null);
  const [loadingEdition, setLoadingEdition] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchHeroConfig = async () => {
      try {
        const response = await api.get('/configuration/landing/');
        if (response.data) {
          setConfig(response.data);
        }
      } catch (err) {
        console.warn("Could not fetch hero landing configuration, using defaults:", err);
      }
    };

    const fetchLatestEdition = async () => {
      try {
        const response = await api.get('/public/editions/');
        const editions = response.data?.results || (Array.isArray(response.data) ? response.data : null);
        if (editions && editions.length > 0) {
          // The API returns public editions ordered by -fecha_publicacion, so index 0 is the latest one
          setLatestEdition(editions[0]);
        }
      } catch (err) {
        console.warn("Could not fetch latest edition:", err);
      } finally {
        setLoadingEdition(false);
      }
    };

    fetchHeroConfig();
    fetchLatestEdition();
  }, []);

  // Split title into parts to colorize "conecta nuestra región" or automatically colorize second half of long phrases
  const renderTitle = (title: string) => {
    const targetPhrase = "conecta nuestra región";
    const index = title.toLowerCase().indexOf(targetPhrase.toLowerCase());
    
    if (index !== -1) {
      const before = title.substring(0, index);
      const matched = title.substring(index, index + targetPhrase.length);
      const after = title.substring(index + targetPhrase.length);
      return (
        <>
          {before}
          <span className="text-[#ea580c]">{matched}</span>
          {after}
        </>
      );
    }

    // Auto-colorize second half if the phrase is long
    const words = title.split(/\s+/);
    if (words.length > 3) {
      const mid = Math.ceil(words.length / 2);
      const firstPart = words.slice(0, mid).join(' ');
      const secondPart = words.slice(mid).join(' ');
      return (
        <>
          {firstPart}{' '}
          <span className="text-[#ea580c]">{secondPart}</span>
        </>
      );
    }
    
    return title;
  };

  const getPositionClass = (pos: string) => {
    if (pos === 'top') return 'object-top';
    if (pos === 'bottom') return 'object-bottom';
    return 'object-center';
  };

  const bgImgUrl = getFullImageUrl(config.hero_background_url);

  return (
    <section className="relative min-h-[600px] flex items-center overflow-hidden">
      {/* Background Image Container */}
      <div className="absolute inset-0 z-0 bg-slate-950 overflow-hidden">
        {/* Background image covering 100% of the section without empty gaps, positioned vertically based on config */}
        <img 
          src={bgImgUrl}
          alt="Amazonía landscape"
          className={`w-full h-full object-cover ${getPositionClass(config.hero_background_position)} select-none pointer-events-none`}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-8 items-center">
        {/* Left Content */}
        <div className="text-white text-center md:text-left select-none">
          <h1 className="text-3xl sm:text-4xl md:text-5xl mb-4 font-black leading-[1.15] drop-shadow-md">
            {renderTitle(config.hero_title)}
          </h1>
          <p className="text-base sm:text-lg mb-8 text-gray-200 font-semibold max-w-xl leading-relaxed whitespace-pre-line drop-shadow-sm">
            {config.hero_subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
            <button 
              onClick={() => {
                if (latestEdition?.portada_url) {
                  setSelectedImage(getFullImageUrl(latestEdition.portada_url));
                } else {
                  document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="px-6 py-3 text-white rounded flex items-center justify-center gap-2 font-bold cursor-pointer transition-colors hover:bg-[#153e25] shadow-sm active:scale-[0.98]" 
              style={{ backgroundColor: '#1a4d2e' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              Leer edición digital
            </button>
            <button 
              onClick={() => {
                document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3 bg-white text-gray-800 rounded hover:bg-gray-100 font-bold transition-all cursor-pointer shadow-sm active:scale-[0.98]"
            >
              Conoce nuestros planes
            </button>
          </div>
        </div>

        {/* Right Content - Dynamic cover or Newspaper Preview */}
        {loadingEdition ? (
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm mx-auto md:ml-auto w-full z-10 flex flex-col items-center justify-center min-h-[350px] border border-slate-100">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <span className="text-slate-400 font-bold text-xs mt-2 select-none">Cargando última edición...</span>
          </div>
        ) : latestEdition && latestEdition.portada_url ? (
          <div 
            onClick={() => setSelectedImage(getFullImageUrl(latestEdition.portada_url))}
            className="bg-white rounded-2xl shadow-2xl p-4 max-w-sm mx-auto md:ml-auto w-full z-10 flex flex-col group transition-all duration-300 hover:-translate-y-1 hover:shadow-orange-500/10 border border-slate-100 cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center justify-between mb-3 px-1 select-none">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-wide" style={{ color: '#ff6600', fontFamily: 'cursive' }}>Amazonía</span>
                <svg width="16" height="16" viewBox="0 0 50 50" fill="none">
                  <circle cx="25" cy="25" r="15" fill="#ff6600"/>
                  <path d="M25 13 L28 20 L25 19 L22 20 Z" fill="#ffcc00"/>
                </svg>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-600">
                  Última Edición
                </span>
              </div>
            </div>
            
            <div className="relative flex-1 aspect-[3/4] w-full overflow-hidden rounded-xl bg-slate-900 shadow-inner">
              <img 
                src={getFullImageUrl(latestEdition.portada_url)}
                alt={latestEdition.titulo || "Última edición"}
                className="w-full h-full object-fill select-none pointer-events-none group-hover:scale-[1.03] transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="bg-white/90 backdrop-blur-sm text-slate-800 rounded-full px-4 py-2 text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                  <Eye className="w-3.5 h-3.5 text-[#ff6600]" />
                  <span>Ver Portada</span>
                </div>
              </div>
            </div>
            
            <div className="mt-3 px-1 text-left select-none">
              <p className="text-[10px] text-gray-400 font-bold mb-0.5">
                {(() => {
                  const parts = (latestEdition.fecha_edicion || '').split('-');
                  if (parts.length === 3) {
                    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    return dateObj.toLocaleDateString('es-PE', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    }).toUpperCase();
                  }
                  return new Date(latestEdition.fecha_edicion).toLocaleDateString('es-PE', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  }).toUpperCase();
                })()}
              </p>
              <h3 className="text-sm font-extrabold text-slate-800 line-clamp-1 group-hover:text-[#ff6600] transition-colors leading-tight">
                {latestEdition.titulo}
              </h3>
              {latestEdition.descripcion_corta && (
                <p className="text-[11px] text-slate-500 font-medium line-clamp-2 mt-1 leading-snug">
                  {latestEdition.descripcion_corta}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Fallback static newspaper preview if no latest edition found */
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md mx-auto md:ml-auto w-full z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center">
                <h3 className="text-2xl" style={{ color: '#ff6600', fontFamily: 'cursive' }}>
                  Amazonía
                </h3>
                <div className="ml-2">
                  <svg width="40" height="40" viewBox="0 0 50 50" fill="none">
                    <circle cx="25" cy="25" r="20" fill="#ff6600"/>
                    <path d="M25 10 L30 20 L25 18 L20 20 Z" fill="#ffcc00"/>
                    <path d="M25 18 L28 25 L25 23 L22 25 Z" fill="#ffcc00"/>
                  </svg>
                </div>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-500 font-medium">Edición N° 1258</p>
                <p className="text-xs text-gray-500 font-medium">Viernes, 15 de mayo, 2026</p>
              </div>
            </div>
            <div className="border-t-4 border-orange-500 pt-4">
              <h2 className="text-xl mb-3 text-left font-black" style={{ color: '#1a4d2e' }}>
                Impulsan desarrollo sostenible en la región amazónica
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-left">
                  <h4 className="text-xs mb-2 font-bold truncate">Comunidades nativas impulsan ecoturismo</h4>
                  <img 
                    src="https://images.unsplash.com/photo-1612729875065-1385f02852ef?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJ1dmlhbiUyMGxhbmRzY2FwZSUyMG5hdHVyZXxlbnwxfHx8fDE3ODI0OTE3MzV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                    alt="Comunidades"
                    className="w-full h-20 object-cover rounded"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 leading-tight font-semibold">Familias participan en proyectos de turismo rural</p>
                </div>
                <div className="text-left">
                  <h4 className="text-xs mb-2 font-bold truncate">Turismo en la Amazonía crece y beneficia a miles</h4>
                  <img 
                    src="https://images.unsplash.com/photo-1564750576234-75de3cc54053?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhbWF6b24lMjByaXZlciUyMGxhbmRzY2FwZXxlbnwxfHx8fDE3ODI0OTE3MzV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                    alt="Turismo"
                    className="w-full h-20 object-cover rounded"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 leading-tight font-semibold">Millones de turistas visitan zonas rurales</p>
                </div>
              </div>
            </div>
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
    </section>
  );
}

export default HeroSection;
