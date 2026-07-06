import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/auth';
import { Header } from './Header';
import { Footer } from './Footer';
import api from '../services/api';
import { 
  Search, Calendar, Loader2, Sparkles, Lock, 
  ArrowLeft, BookOpen, Eye, Clock, X 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

const formatCreationTime = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutesStr} ${ampm}`;
  } catch (e) {
    return 'Reciente';
  }
};

const formatCreationDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (e) {
    return 'Reciente';
  }
};

export default function NoticiasPage() {
  const { isAuthenticated, user, openAuthModal } = useAuth();
  const navigate = useNavigate();

  const [news, setNews] = useState<any[]>([]);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // News state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);

  useEffect(() => {
    const verifyAccessAndFetchNews = async () => {
      setLoading(true);
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        // 1. Verify user subscription status
        const subRes = await api.get('/user/subscriptions/');
        const activeSub = !!subRes.data?.active_subscription;
        setHasSubscription(activeSub);

        if (activeSub) {
          // 2. Fetch all landing news
          const newsRes = await api.get('/public/news-landing/');
          setNews(newsRes.data || []);
        }
      } catch (err) {
        console.error('Error fetching subscription/news:', err);
      } finally {
        setLoading(false);
      }
    };

    verifyAccessAndFetchNews();
  }, [isAuthenticated]);

  // Real-time search filter
  const filteredNews = news.filter((item) => {
    const title = (item.titulo || item.title || '').toLowerCase();
    const desc = (item.descripcion || item.description || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return title.includes(query) || desc.includes(query);
  });

  const featuredArticle = filteredNews.length > 0 && searchQuery === '' ? filteredNews[0] : null;
  const gridArticles = featuredArticle ? filteredNews.slice(1) : filteredNews;

  // Render Paywall Gate if not subscribed or not logged in
  const renderPaywall = () => {
    const isLoginReq = !isAuthenticated;
    return (
      <div className="flex-1 bg-slate-50 py-16 px-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-2xl bg-white border border-slate-200/80 rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row items-stretch">
          {/* Left panel gradient */}
          <div className="md:w-5/12 bg-gradient-to-br from-[#1a4d2e] via-[#153d24] to-[#0b1f13] text-white p-8 flex flex-col justify-between select-none relative min-h-[250px] md:min-h-auto">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(234,88,12,0.15),transparent)] pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2">
              <span className="text-[#ea580c] font-black tracking-tighter text-lg">Amazonia</span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none">PREMIUM</span>
            </div>
            
            <div className="relative z-10 space-y-3 my-auto">
              <h4 className="text-xl font-black leading-tight text-emerald-100">
                Periodismo con independencia y rigor regional
              </h4>
              <p className="text-[10px] text-slate-350 leading-relaxed font-semibold">
                Accede a investigaciones locales, ediciones impresas diarias, reportajes especiales e históricos desde cualquier dispositivo.
              </p>
            </div>

            <div className="relative z-10 text-[9px] text-slate-400 font-bold flex items-center gap-1.5 pt-4 border-t border-white/10">
              <Clock size={10} className="text-orange-500" /> Actualizado al instante
            </div>
          </div>

          {/* Right panel CTA */}
          <div className="md:w-7/12 p-8 flex flex-col justify-center text-left">
            {isLoginReq ? (
              <>
                <div className="w-12 h-12 bg-orange-50 border border-orange-100 rounded-2xl flex items-center justify-center mb-5 animate-pulse">
                  <Lock size={22} className="text-[#ea580c]" />
                </div>
                <h3 className="text-xl font-black text-slate-900 leading-tight">
                  Acceso Restringido
                </h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed mt-1.5 mb-6">
                  El archivo completo de noticias exclusivas y reportes locales está reservado para nuestros suscriptores premium. Inicia sesión en tu cuenta para validar tu acceso.
                </p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => openAuthModal('login')}
                    className="w-full py-3 px-4 rounded-xl text-white font-black bg-[#1a4d2e] hover:bg-[#133e24] shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer text-center text-xs animate-pulse"
                  >
                    Iniciar Sesión
                  </button>
                  <button
                    onClick={() => {
                      const planesEl = document.getElementById('planes');
                      if (planesEl) {
                        planesEl.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        navigate('/');
                        setTimeout(() => {
                          document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' });
                        }, 300);
                      }
                    }}
                    className="w-full py-3 px-4 rounded-xl text-[#ea580c] font-black border border-orange-200 hover:bg-orange-50/50 active:scale-[0.98] transition-all cursor-pointer text-center text-xs"
                  >
                    Registrarme y Ver Planes
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mb-5 animate-bounce">
                  <Sparkles size={22} className="text-[#1a4d2e]" />
                </div>
                <h3 className="text-xl font-black text-slate-900 leading-tight">
                  Suscripción Requerida
                </h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed mt-1.5 mb-6">
                  Hola <strong className="text-slate-800">{user?.nombres?.split(' ')[0]}</strong>. Aún no cuentas con un plan activo contratado. Elige uno de nuestros planes accesibles y desbloquea el archivo completo hoy mismo.
                </p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => {
                      navigate('/');
                      setTimeout(() => {
                        document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' });
                      }, 200);
                    }}
                    className="w-full py-3 px-4 rounded-xl text-white font-black bg-[#ea580c] hover:bg-[#d44f0a] shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer text-center text-xs"
                  >
                    Ver Planes de Suscripción
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="w-full py-3 px-4 rounded-xl text-slate-550 hover:text-slate-850 font-black border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer text-center text-xs"
                  >
                    Volver a la Portada
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Header />

      {/* Hero header */}
      <div className="bg-[#1a4d2e] text-white py-12 px-6 text-center select-none relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(234,88,12,0.15),transparent)] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <span className="bg-[#ea580c] text-white text-[9px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider">
            Archivo de Noticias
          </span>
          <h1 className="text-3xl md:text-5xl font-black mt-3 leading-tight tracking-tight">
            Lo que está pasando en la Región
          </h1>
          <p className="text-emerald-100 text-xs md:text-sm max-w-xl mx-auto mt-2 font-medium">
            Mantente al día con los acontecimientos locales y reportes exclusivos de nuestros periodistas.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col justify-center items-center py-24 gap-3 bg-white">
          <Loader2 className="w-10 h-10 animate-spin text-[#1a4d2e]" />
          <span className="text-xs text-slate-450 font-bold uppercase tracking-wider">Cargando archivo de noticias...</span>
        </div>
      ) : !hasSubscription || !isAuthenticated ? (
        renderPaywall()
      ) : (
        /* News List Container */
        <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 bg-slate-50">
          
          {/* Search bar and count */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm">
            <div className="relative w-full md:max-w-md">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Buscar noticias por palabra clave..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#1a4d2e] bg-slate-50/50"
              />
            </div>
            
            <button 
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-650 hover:text-slate-900 border border-slate-200 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 cursor-pointer shadow-sm transition-colors animate-in fade-in"
            >
              <ArrowLeft size={13} /> Volver a Portada
            </button>
          </div>

          {filteredNews.length === 0 ? (
            <div className="text-center bg-white border border-slate-200 rounded-3xl py-20 text-slate-400 text-sm font-bold shadow-sm">
              No se encontraron noticias registradas en el archivo con los criterios de búsqueda.
            </div>
          ) : (
            <div className="space-y-10">
              
              {/* Featured article layout */}
              {featuredArticle && (
                <div 
                  onClick={() => setSelectedArticle(featuredArticle)}
                  className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-md hover:shadow-lg hover:border-slate-350 transition-all cursor-pointer flex flex-col lg:flex-row text-left group"
                >
                  <div className="lg:w-7/12 relative overflow-hidden min-h-[240px] lg:min-h-auto">
                    <img 
                      src={getFullImageUrl(featuredArticle.imagen)} 
                      alt={featuredArticle.titulo} 
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    />
                    <span className="absolute top-4 left-4 bg-orange-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wide shadow-md">
                      RECIENTE DESTACADA
                    </span>
                  </div>

                  <div className="lg:w-5/12 p-8 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-[10px] font-black text-[#1a4d2e] uppercase tracking-wider">
                        <span>{formatCreationDate(featuredArticle.fecha_creacion)}</span>
                        <span>•</span>
                        <span>{formatCreationTime(featuredArticle.fecha_creacion)}</span>
                      </div>
                      
                      <h2 className="text-xl md:text-2xl font-black text-slate-900 group-hover:text-[#1a4d2e] transition-colors leading-tight">
                        {featuredArticle.titulo}
                      </h2>
                      
                      <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-4">
                        {featuredArticle.descripcion}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-slate-100 text-[10px] text-slate-400 font-bold mt-6 select-none">
                      <span className="flex items-center gap-1 text-[#ea580c]">
                        <BookOpen size={12} /> Leer artículo completo
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> ~2 min lectura
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Responsive news grid */}
              {gridArticles.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left animate-in fade-in slide-in-from-bottom-4 duration-300">
                  {gridArticles.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      onClick={() => setSelectedArticle(item)}
                      className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md hover:border-slate-350 transition-all cursor-pointer flex flex-col justify-between group"
                    >
                      <div>
                        {/* Image */}
                        <div className="h-44 w-full relative overflow-hidden bg-slate-100">
                          <img
                            src={getFullImageUrl(item.imagen)}
                            alt={item.titulo}
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                          />
                        </div>

                        {/* Text details */}
                        <div className="p-5 space-y-3">
                          <div className="flex items-center gap-2 text-[9px] font-black text-[#1a4d2e] uppercase tracking-wider">
                            <span>{formatCreationDate(item.fecha_creacion)}</span>
                            <span>•</span>
                            <span>{formatCreationTime(item.fecha_creacion)}</span>
                          </div>
                          
                          <h3 className="text-sm font-black text-slate-800 line-clamp-2 leading-snug group-hover:text-[#1a4d2e] transition-colors">
                            {item.titulo}
                          </h3>
                          
                          <p className="text-xs text-slate-500 font-semibold leading-relaxed line-clamp-3">
                            {item.descripcion}
                          </p>
                        </div>
                      </div>

                      {/* Footer info */}
                      <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-bold select-none">
                        <span className="text-[#ea580c] flex items-center gap-1">
                          <Eye size={12} /> Ver noticia
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> 1 min lectura
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Article Detail Modal Viewer */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-[#0b1f13]/70 backdrop-blur-md transition-opacity duration-300"
            onClick={() => setSelectedArticle(null)}
          />

          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-emerald-50 overflow-hidden z-10 transform transition-all duration-300 scale-100 flex flex-col max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            {/* Top brand accent bar */}
            <div className="h-2 w-full bg-gradient-to-r from-[#1a4d2e] via-[#ea580c] to-[#1a4d2e]" />
            
            {/* Close button */}
            <button 
              onClick={() => setSelectedArticle(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition-colors p-1.5 rounded-full hover:bg-slate-100 bg-white/80 backdrop-blur z-20 cursor-pointer shadow"
            >
              <X size={18} />
            </button>

            {/* Modal Body */}
            <div className="text-left">
              {/* Featured news image header */}
              <div className="relative h-64 md:h-80 w-full overflow-hidden bg-slate-100">
                <img 
                  src={getFullImageUrl(selectedArticle.imagen)} 
                  alt={selectedArticle.titulo} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-6 right-6 text-white space-y-2">
                  <div className="flex items-center gap-2 text-[9px] font-black text-emerald-300 uppercase tracking-widest leading-none">
                    <span>{formatCreationDate(selectedArticle.fecha_creacion)}</span>
                    <span>•</span>
                    <span>{formatCreationTime(selectedArticle.fecha_creacion)}</span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-black leading-tight drop-shadow-sm">
                    {selectedArticle.titulo}
                  </h2>
                </div>
              </div>

              {/* Text content details */}
              <div className="p-6 md:p-8 space-y-6">
                {/* Meta details */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold border-b border-slate-100 pb-4">
                  <span className="flex items-center gap-1 text-[#1a4d2e]">
                    <BookOpen size={13} className="text-[#ea580c]" /> Sección: Actualidad
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} /> Tiempo estimado: ~2 minutos
                  </span>
                </div>

                {/* News Description Content (Simulating news text body) */}
                <div className="text-slate-700 leading-relaxed font-semibold text-sm whitespace-pre-line space-y-4">
                  <p>{selectedArticle.descripcion}</p>
                </div>

                {/* Closing signature footer */}
                <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1a4d2e] to-[#ea580c]/80 flex items-center justify-center text-white text-[10px] font-black shadow-inner animate-pulse">
                      AD
                    </div>
                    <div className="flex flex-col text-[10px] font-bold leading-none">
                      <span className="text-slate-800">Redacción Amazonia</span>
                      <span className="text-slate-450 mt-1">Amazonia Diario Oficial</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedArticle(null)}
                    className="py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-[10px] font-black text-slate-655 transition-all cursor-pointer"
                  >
                    Regresar al archivo
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
