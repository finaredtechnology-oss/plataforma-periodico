import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BookOpen, Eye, Search, Filter, Calendar, 
  ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, 
  Maximize2, Minimize2, X, ChevronDown, FileText, 
  LayoutGrid, RefreshCw, Sparkles, Award
} from 'lucide-react';
import { useAuth } from '../../contexts/auth';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

interface Edition {
  id: number;
  codigo: string;
  titulo: string;
  slug: string;
  estado: string;
  fecha_edicion: string;
  fecha_publicacion: string | null;
  precio: string;
  moneda: string;
  es_destacada: boolean;
  portada_url: string | null;
  numero_paginas?: number;
}

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

const parseCollectionType = (codigo: string): string => {
  if (codigo.startsWith('PER-')) return 'Periódico';
  if (codigo.startsWith('REV-')) return 'Revista';
  if (codigo.startsWith('COM-')) return 'Cómic';
  return 'Periódico'; // Default fallback
};

export const Viewer: React.FC = () => {
  const { user, companies, activeCompanyId } = useAuth();
  const navigate = useNavigate();
  
  // States for filters & listings
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(() => {
    return activeCompanyId || (companies.length > 0 ? companies[0].id : 1);
  });
  const [editions, setEditions] = useState<Edition[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [collectionFilter, setCollectionFilter] = useState<string>('TODAS');
  const [statusFilter, setStatusFilter] = useState<string>('TODAS');
  
  // Reader Interactive States
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null);
  const [isReaderOpen, setIsReaderOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  // Expanded & Touch Zoom States
  const [isExpandedView, setIsExpandedView] = useState<boolean>(false);
  const [touchZoom, setTouchZoom] = useState<number>(100);
  const [startDist, setStartDist] = useState<number>(0);
  const [startZoom, setStartZoom] = useState<number>(100);
  const lastTapRef = useRef<number>(0);

  // Touch Gesture Handlers for Pinch & Double-tap Zoom
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double-tap: Toggle zoom
        setTouchZoom(prev => prev > 100 ? 100 : 220);
      }
      lastTapRef.current = now;
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      setStartDist(dist);
      setStartZoom(touchZoom);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && startDist > 0) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const factor = dist / startDist;
      // Limit scale factor
      const newZoom = Math.min(300, Math.max(100, startZoom * factor));
      setTouchZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    setStartDist(0);
  };
  
  // Loaded images map (pageNumber -> Blob Object URL)
  const [loadedPages, setLoadedPages] = useState<{ [page: number]: string }>({});
  const [loadingPagesState, setLoadingPagesState] = useState<{ [page: number]: 'idle' | 'loading' | 'loaded' | 'error' }>({});
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [flipDirection, setFlipDirection] = useState<'left' | 'right'>('right');
  const [isMobile, setIsMobile] = useState<boolean>(false);

  const readerRef = useRef<HTMLDivElement>(null);

  // Synchronize company select with active company on load
  useEffect(() => {
    if (activeCompanyId && !selectedCompanyId) {
      setSelectedCompanyId(activeCompanyId);
    }
  }, [activeCompanyId, selectedCompanyId]);

  // Handle window resizing for responsive layouts (single-page on mobile vs double-page on desktop)
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch editions list from API
  const fetchEditions = useCallback(async () => {
    setIsLoading(true);
    try {
      const isPublisher = companies.length > 0 || user?.email === 'admin';
      let results: Edition[] = [];

      if (isPublisher) {
        if (!selectedCompanyId) {
          setIsLoading(false);
          return;
        }
        let url = `/companies/${selectedCompanyId}/editions/?page=1&page_size=100`;
        
        if (statusFilter !== 'TODAS') {
          url += `&estado=${statusFilter}`;
        }
        if (search) {
          url += `&titulo=${search}`;
        }
        
        const res = await api.get(url);
        if (res.data && Array.isArray(res.data.results)) {
          results = res.data.results;
        } else if (Array.isArray(res.data)) {
          results = res.data;
        }
      } else {
        if (!user?.id) {
          setIsLoading(false);
          return;
        }
        const res = await api.get(`/users/${user.id}/editions/`);
        const rawList = res.data || [];
        results = rawList.map((ed: any) => ({
          id: ed.edition_id,
          codigo: ed.codigo || `ED-${ed.edition_id}`,
          titulo: ed.title,
          slug: ed.slug || '',
          estado: ed.status || 'PUBLICADA',
          fecha_edicion: ed.publication_date || '',
          fecha_publicacion: ed.publication_date || null,
          precio: '0.00',
          moneda: 'PEN',
          es_destacada: false,
          portada_url: ed.portada_url,
          numero_paginas: ed.numero_paginas || 0,
          company_id: ed.company_id
        }));

        if (search) {
          results = results.filter(ed => ed.titulo.toLowerCase().includes(search.toLowerCase()));
        }
      }
      
      // Perform local filtering for collection type based on code prefix
      if (collectionFilter !== 'TODAS') {
        results = results.filter(ed => {
          const type = parseCollectionType(ed.codigo).toUpperCase();
          const mappedFilter = collectionFilter === 'PERIÓDICO' ? 'PERIÓDICO' : (collectionFilter === 'REVISTA' ? 'REVISTA' : 'CÓMIC');
          return type === mappedFilter;
        });
      }
      
      setEditions(results);
    } catch (err) {
      console.error("Error fetching editions for visor:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, companies, selectedCompanyId, statusFilter, collectionFilter, search]);

  useEffect(() => {
    fetchEditions();
  }, [fetchEditions]);

  // Revoke object URLs on closing reader to free browser memory
  useEffect(() => {
    if (!isReaderOpen) {
      Object.values(loadedPages).forEach(url => URL.revokeObjectURL(url));
      setLoadedPages({});
      setLoadingPagesState({});
      setCurrentPage(1);
      setZoom(100);
      setIsExpandedView(false);
      setTouchZoom(100);
    }
  }, [isReaderOpen]);

  // Safe page image fetching sending authentication headers and converting binary responses to Object URLs
  const fetchPageImage = useCallback(async (editionId: number, pageNum: number, companyId: number) => {
    if (!companyId) return null;
    if (loadedPages[pageNum]) return loadedPages[pageNum];
    if (loadingPagesState[pageNum] === 'loading') return null;

    setLoadingPagesState(prev => ({ ...prev, [pageNum]: 'loading' }));
    try {
      const response = await api.get(
        `/companies/${companyId}/editions/${editionId}/pages/${pageNum}/`,
        { responseType: 'blob' }
      );
      const blob = response.data;
      const objectUrl = URL.createObjectURL(blob);
      setLoadedPages(prev => ({ ...prev, [pageNum]: objectUrl }));
      setLoadingPagesState(prev => ({ ...prev, [pageNum]: 'loaded' }));
      return objectUrl;
    } catch (err) {
      console.error(`Error loading page ${pageNum} from backend:`, err);
      setLoadingPagesState(prev => ({ ...prev, [pageNum]: 'error' }));
      return null;
    }
  }, [loadedPages, loadingPagesState]);

  // Load and prefetch visible and adjacent pages
  const loadPageRange = useCallback(async (edition: Edition, pageNum: number) => {
    const total = edition.numero_paginas || 0;
    if (total === 0) return;

    // Resolve company ID from edition object
    const companyId = (edition as any).company_id || (edition as any).empresa?.id || selectedCompanyId || 1;

    // Determine current visible pages
    const visiblePages: number[] = [];
    if (isMobile) {
      visiblePages.push(pageNum);
    } else {
      if (pageNum === 1) {
        visiblePages.push(1);
      } else {
        visiblePages.push(pageNum);
        if (pageNum + 1 <= total) {
          visiblePages.push(pageNum + 1);
        }
      }
    }

    // Load visible pages first
    for (const page of visiblePages) {
      if (page >= 1 && page <= total && !loadedPages[page]) {
        await fetchPageImage(edition.id, page, companyId);
      }
    }

    // Prefetch next and previous page sets in the background for zero-latency turning
    const prefetchPages: number[] = [];
    if (isMobile) {
      if (pageNum + 1 <= total) prefetchPages.push(pageNum + 1);
      if (pageNum - 1 >= 1) prefetchPages.push(pageNum - 1);
    } else {
      const nextSpreadLeft = pageNum === 1 ? 2 : pageNum + 2;
      const prevSpreadLeft = pageNum === 1 ? 0 : pageNum - 2;

      if (nextSpreadLeft <= total) {
        prefetchPages.push(nextSpreadLeft);
        if (nextSpreadLeft + 1 <= total) prefetchPages.push(nextSpreadLeft + 1);
      }
      if (prevSpreadLeft >= 2) {
        prefetchPages.push(prevSpreadLeft);
        prefetchPages.push(prevSpreadLeft + 1);
      }
    }

    for (const page of prefetchPages) {
      if (page >= 1 && page <= total && !loadedPages[page] && loadingPagesState[page] !== 'loading') {
        fetchPageImage(edition.id, page, companyId);
      }
    }
  }, [isMobile, fetchPageImage, loadedPages, loadingPagesState, selectedCompanyId]);

  // Refresh page loading whenever current page or selected edition changes
  useEffect(() => {
    if (selectedEdition && isReaderOpen) {
      loadPageRange(selectedEdition, currentPage);
    }
  }, [currentPage, selectedEdition, isReaderOpen, loadPageRange]);

  // Flip page navigation triggers
  const handleNextPage = () => {
    if (!selectedEdition) return;
    const total = selectedEdition.numero_paginas || 0;
    
    let nextPage = currentPage;
    if (isMobile) {
      if (currentPage < total) nextPage = currentPage + 1;
    } else {
      if (currentPage === 1) {
        if (total >= 2) nextPage = 2;
      } else {
        if (currentPage + 2 <= total) {
          nextPage = currentPage + 2;
        } else if (currentPage + 1 <= total) {
          nextPage = currentPage + 1; // back cover fallback if odd total
        }
      }
    }

    if (nextPage !== currentPage) {
      setFlipDirection('right');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(nextPage);
        setIsFlipping(false);
      }, 300);
    }
  };

  const handlePrevPage = () => {
    if (!selectedEdition) return;
    
    let prevPage = currentPage;
    if (isMobile) {
      if (currentPage > 1) prevPage = currentPage - 1;
    } else {
      if (currentPage === 2) {
        prevPage = 1;
      } else if (currentPage > 2) {
        prevPage = currentPage - 2;
      }
    }

    if (prevPage !== currentPage) {
      setFlipDirection('left');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(prevPage);
        setIsFlipping(false);
      }, 300);
    }
  };

  // Keyboard navigation listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isReaderOpen) return;
      if (e.key === 'ArrowRight') {
        handleNextPage();
      } else if (e.key === 'ArrowLeft') {
        handlePrevPage();
      } else if (e.key === 'Escape') {
        setIsReaderOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReaderOpen, currentPage, selectedEdition, isMobile]);

  // Fullscreen support handlers
  const toggleFullscreen = () => {
    if (!readerRef.current) return;
    if (!document.fullscreenElement) {
      readerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error("Error enabling fullscreen mode:", err);
      });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // Synchronize fullscreen state changes from browser event
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const openReader = async (edition: Edition) => {
    setSelectedEdition(edition);
    setCurrentPage(1);
    setIsReaderOpen(true);

    const companyId = (edition as any).company_id || selectedCompanyId || 1;
    setSelectedCompanyId(companyId);

    // Track unique read editions in localStorage
    try {
      const readEditionsRaw = localStorage.getItem('amazonia_read_editions');
      const readEditions: string[] = readEditionsRaw ? JSON.parse(readEditionsRaw) : [];
      const editionKey = `${edition.id || edition.codigo || edition.titulo}`;
      if (!readEditions.includes(editionKey)) {
        readEditions.push(editionKey);
        localStorage.setItem('amazonia_read_editions', JSON.stringify(readEditions));
      }
    } catch (e) {
      console.error('Error tracking read edition:', e);
    }

    try {
      const res = await api.get(`/companies/${companyId}/editions/${edition.id}/`);
      if (res.data) {
        setSelectedEdition({ ...res.data, company_id: companyId });
      }
    } catch (err) {
      console.error("Error fetching edition detail on read:", err);
    }
  };

  const [isAutoOpening, setIsAutoOpening] = useState<boolean>(() => {
    return !!localStorage.getItem('amazonia_viewer_selected_edition');
  });

  useEffect(() => {
    const autoOpenId = localStorage.getItem('amazonia_viewer_selected_edition');
    const autoCompanyIdRaw = localStorage.getItem('amazonia_viewer_selected_company');
    
    if (autoOpenId && autoCompanyIdRaw) {
      const targetCompanyId = parseInt(autoCompanyIdRaw, 10);
      localStorage.removeItem('amazonia_viewer_selected_edition');
      localStorage.removeItem('amazonia_viewer_selected_company');
      
      setIsAutoOpening(true);
      setSelectedCompanyId(targetCompanyId);
      
      api.get(`/companies/${targetCompanyId}/editions/${autoOpenId}/`)
        .then(res => {
          if (res.data) {
            openReader(res.data);
          }
          setIsAutoOpening(false);
        })
        .catch(err => {
          console.error("Error loading auto-open edition:", err);
          setIsAutoOpening(false);
        });
    } else {
      setIsAutoOpening(false);
    }
  }, []);

  // Selected Newspaper name helper
  const getSelectedCompanyName = () => {
    const company = companies.find(c => c.id === selectedCompanyId);
    return company ? (company.nombre_comercial || company.nombre) : 'Selecciona un periódico';
  };

  if (isAutoOpening) {
    return (
      <div className="fixed inset-0 z-[120] bg-[#050914] flex flex-col items-center justify-center gap-4 text-white">
        <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider animate-pulse">Cargando lector seguro...</span>
      </div>
    );
  }

  if (isReaderOpen && selectedEdition) {
    return (
      <div 
        ref={readerRef}
        className="fixed inset-0 z-[100] bg-[#080d1a] text-white flex flex-col justify-between select-none animate-in fade-in duration-350"
      >
        {/* Header Toolbar */}
        {!isExpandedView && (
          <div className="bg-[#0b1329]/90 border-b border-white/10 px-4 md:px-6 py-3 md:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 backdrop-blur-md">
            <div className="space-y-0.5 text-center sm:text-left">
              <span className="text-[9px] text-sky-400 font-bold tracking-widest uppercase">
                Visor Protegido — {parseCollectionType(selectedEdition.codigo)}
              </span>
              <h2 className="text-xs sm:text-sm md:text-base font-black tracking-tight flex items-center justify-center sm:justify-start gap-2">
                {selectedEdition.titulo} <span className="text-slate-500 text-xs font-mono font-bold">({selectedEdition.codigo})</span>
              </h2>
            </div>

            {/* Controls panel */}
            <div className="flex items-center gap-2 md:gap-4">
              {/* Zoom Controls */}
              <div className="hidden sm:flex bg-slate-900 border border-white/10 rounded-xl p-1 text-slate-400 items-center">
                <button 
                  onClick={() => setZoom(prev => Math.max(50, prev - 25))}
                  className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold px-2 w-12 text-center text-white">{zoom}%</span>
                <button 
                  onClick={() => setZoom(prev => Math.min(250, prev + 25))}
                  className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Fullscreen Button */}
              <button 
                onClick={toggleFullscreen}
                className="p-2.5 bg-slate-900 border border-white/10 hover:text-white text-slate-400 rounded-xl transition-all hidden sm:block"
                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* Ampliar Vista Button */}
              <button 
                onClick={() => {
                  setIsExpandedView(true);
                  setTouchZoom(100);
                }}
                className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500 hover:text-white text-sky-400 font-bold text-xs py-2 px-3.5 rounded-xl transition-all cursor-pointer"
                title="Ampliar Vista de Lectura (Habilita Zoom Táctil)"
              >
                <Maximize2 className="w-4 h-4" /> <span>Ampliar</span>
              </button>

              {/* Close Button */}
              <button 
                onClick={() => {
                  setIsReaderOpen(false);
                  navigate('/dashboard');
                }}
                className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-400 font-bold text-xs py-2 px-3.5 rounded-xl transition-all"
              >
                <X className="w-4 h-4" /> <span className="hidden sm:inline">Cerrar Visor</span>
              </button>
            </div>
          </div>
        )}

        {/* Viewport Area */}
        <div className="flex-grow flex items-center justify-between p-4 relative overflow-hidden bg-[#050914] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0d162d] via-[#050914] to-[#02050c]">
          
          {/* Floating Close Button for Expanded View */}
          {isExpandedView && (
            <button 
              onClick={() => {
                setIsExpandedView(false);
                setTouchZoom(100);
              }}
              className="absolute top-4 right-4 z-50 bg-rose-500/90 hover:bg-rose-500 text-white p-3 rounded-full shadow-2xl transition-all border border-rose-450/20 active:scale-95 cursor-pointer flex items-center justify-center hover:bg-rose-600"
              title="Salir de Vista Ampliada"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          )}

          {/* Left page switcher trigger */}
          <button 
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isFlipping}
            className="absolute left-2 sm:left-6 z-40 bg-slate-900/80 hover:bg-slate-800/90 text-slate-300 hover:text-white border border-white/10 hover:border-sky-500/30 p-2 sm:p-4 rounded-full disabled:opacity-10 transition-all shadow-2xl disabled:pointer-events-none hover:scale-105"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
          </button>

          {/* Page display box */}
          <div className="w-full h-full flex items-center justify-center p-2 md:p-6 overflow-auto">
            <div 
              className="flex items-center justify-center origin-center transition-all duration-300"
              style={{ transform: isExpandedView ? 'scale(1)' : `scale(${zoom / 100})` }}
            >
              {selectedEdition.numero_paginas === 0 || !selectedEdition.numero_paginas ? (
                /* No pages fallback placeholder */
                <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-8 text-center max-w-md shadow-2xl space-y-4">
                  <Award className="w-12 h-12 text-yellow-400 mx-auto animate-bounce" />
                  <h3 className="text-lg font-black text-white">Edición en procesamiento</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Esta publicación aún no contiene páginas procesadas. Si acabas de subir tu archivo PDF, se está transformando en segundo plano. Espera unos instantes.
                  </p>
                  <div className="flex items-center justify-center gap-1.5 text-sky-400 font-bold text-[10px] uppercase tracking-wider animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando PDF principal...
                  </div>
                </div>
              ) : (
                /* Reader display container (Single page on mobile, Double page spread on desktop) */
                <div 
                  className={`flex items-stretch justify-center relative ${
                    isFlipping 
                      ? (flipDirection === 'right' ? 'animate-flip-right' : 'animate-flip-left') 
                      : ''
                  }`}
                  style={{
                    perspective: '2000px',
                    transition: 'transform 0.4s ease-out'
                  }}
                >
                  
                  {/* Double page view wrapper */}
                  {isMobile || isExpandedView || currentPage === 1 ? (
                    /* Single Center Page (e.g. Cover Page, or mobile mode, or expanded reader) */
                    isExpandedView ? (
                      <div 
                        className={`w-[85vw] h-[85vh] overflow-auto no-scrollbar flex relative rounded-2xl ${
                          touchZoom > 100 ? 'items-start justify-start p-4' : 'items-center justify-center p-2'
                        }`}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                      >
                        {loadingPagesState[currentPage] === 'loading' && (
                          <div className="absolute inset-0 bg-[#0e121b]/95 rounded-2xl flex flex-col items-center justify-center gap-3 z-10">
                            <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">Servidor seguro...</span>
                          </div>
                        )}
                        {loadingPagesState[currentPage] === 'error' && (
                          <div className="absolute inset-0 bg-[#0e121b]/95 rounded-2xl flex flex-col items-center justify-center gap-3 p-6 text-center text-rose-400 font-bold text-xs z-10">
                            <X className="w-8 h-8 text-rose-500" /> Error al leer página {currentPage}
                          </div>
                        )}
                        {loadedPages[currentPage] && (
                          <img 
                            src={loadedPages[currentPage]} 
                            className="object-contain rounded-xl select-none"
                            alt={`Página ${currentPage}`} 
                            style={{
                              width: touchZoom > 100 ? `${touchZoom}%` : '100%',
                              height: touchZoom > 100 ? 'auto' : '100%',
                              maxWidth: touchZoom > 100 ? 'none' : '100%',
                              maxHeight: touchZoom > 100 ? 'none' : '100%',
                              transition: 'width 0.1s ease-out'
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      /* Regular Single Page View */
                      <div className="bg-[#181d2a] p-1.5 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] border border-white/10 max-w-[85vw] max-h-[70vh] aspect-[3/4] overflow-hidden flex items-center justify-center">
                        {loadingPagesState[currentPage] === 'loading' && (
                          <div className="absolute inset-0 bg-[#0e121b]/95 rounded-2xl flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">Servidor seguro...</span>
                          </div>
                        )}
                        {loadingPagesState[currentPage] === 'error' && (
                          <div className="absolute inset-0 bg-[#0e121b]/95 rounded-2xl flex flex-col items-center justify-center gap-3 p-6 text-center text-rose-400 font-bold text-xs">
                            <X className="w-8 h-8 text-rose-500" /> Error al leer página {currentPage}
                          </div>
                        )}
                        {loadedPages[currentPage] && (
                          <img 
                            src={loadedPages[currentPage]} 
                            className="w-full h-full object-contain rounded-xl select-none"
                            alt={`Página ${currentPage}`} 
                          />
                        )}
                      </div>
                    )
                  ) : (
                    /* Double Page Spread side-by-side (Book representation) */
                    <div className="flex shadow-[0_30px_70px_-20px_rgba(0,0,0,0.95)] rounded-2xl overflow-hidden border border-white/15">
                      
                      {/* LEFT PAGE */}
                      <div className="bg-[#1b2131] p-1.5 border-r border-slate-950 flex-shrink-0 w-[40vw] max-w-[500px] aspect-[3/4] flex items-center justify-center relative overflow-hidden">
                        {loadingPagesState[currentPage] === 'loading' && (
                          <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
                          </div>
                        )}
                        {loadingPagesState[currentPage] === 'error' && (
                          <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3 text-center text-rose-400 text-xs">
                            <span>Error al leer página</span>
                          </div>
                        )}
                        {loadedPages[currentPage] && (
                          <img 
                            src={loadedPages[currentPage]} 
                            className="w-full h-full object-contain"
                            alt={`Página ${currentPage}`} 
                          />
                        )}
                        <span className="absolute bottom-3 left-4 text-[9px] font-bold text-slate-500 font-mono">Página {currentPage}</span>
                      </div>

                      {/* RIGHT PAGE */}
                      <div className="bg-[#1b2131] p-1.5 flex-shrink-0 w-[40vw] max-w-[500px] aspect-[3/4] flex items-center justify-center relative overflow-hidden">
                        {currentPage + 1 <= (selectedEdition.numero_paginas || 0) ? (
                          <>
                            {loadingPagesState[currentPage + 1] === 'loading' && (
                              <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
                              </div>
                            )}
                            {loadingPagesState[currentPage + 1] === 'error' && (
                              <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3 text-center text-rose-400 text-xs">
                                <span>Error al leer página</span>
                              </div>
                            )}
                            {loadedPages[currentPage + 1] && (
                              <img 
                                src={loadedPages[currentPage + 1]} 
                                className="w-full h-full object-contain"
                                alt={`Página ${currentPage + 1}`} 
                              />
                            )}
                            <span className="absolute bottom-3 right-4 text-[9px] font-bold text-slate-500 font-mono">Página {currentPage + 1}</span>
                          </>
                        ) : (
                          /* Empty space background if odd and pages exceeded */
                          <div className="w-full h-full bg-[#0a0d14] flex items-center justify-center text-slate-700">
                            <Sparkles className="w-8 h-8 opacity-20" />
                          </div>
                        )}
                      </div>

                      {/* Binder middle shade/crease simulation */}
                      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-4 bg-gradient-to-r from-black/40 via-black/10 to-black/40 pointer-events-none z-30"></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right page switcher trigger */}
          <button 
            onClick={handleNextPage}
            disabled={
              !selectedEdition || 
              (selectedEdition.numero_paginas || 0) <= 0 || 
              isFlipping || 
              (isMobile 
                ? currentPage >= (selectedEdition.numero_paginas || 0) 
                : (currentPage === 1 ? (selectedEdition.numero_paginas || 0) <= 1 : currentPage + 1 >= (selectedEdition.numero_paginas || 0))
              )
            }
            className="absolute right-2 sm:right-6 z-40 bg-slate-900/80 hover:bg-slate-800/90 text-slate-300 hover:text-white border border-white/10 hover:border-sky-500/30 p-2 sm:p-4 rounded-full disabled:opacity-10 transition-all shadow-2xl disabled:pointer-events-none hover:scale-105"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
          </button>
        </div>

        {/* Navigation Controls Footer */}
        {!isExpandedView && selectedEdition.numero_paginas && selectedEdition.numero_paginas > 0 ? (
          <div className="bg-[#0b1329]/95 border-t border-white/10 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 flex-shrink-0 backdrop-blur-md">
            <div className="text-xs text-slate-400 font-bold">
              Navega usando los botones, el slider inferior o las flechas <kbd className="bg-slate-800 border border-white/10 px-1 py-0.5 rounded text-white mx-0.5 font-mono">←</kbd> y <kbd className="bg-slate-800 border border-white/10 px-1 py-0.5 rounded text-white mx-0.5 font-mono">→</kbd> de tu teclado.
            </div>

            {/* Spread details */}
            <div className="flex items-center gap-4">
              <span className="font-bold text-sm tracking-widest text-white font-mono bg-slate-950 px-3.5 py-1.5 rounded-xl border border-white/5">
                {isMobile ? `Pág. ${currentPage}` : (currentPage === 1 ? 'Portada' : `Pág. ${currentPage} - ${Math.min(currentPage + 1, selectedEdition.numero_paginas || 0)}`)} / {selectedEdition.numero_paginas}
              </span>
            </div>

            {/* Quick slider navigator */}
            <div className="w-full md:w-64 flex items-center gap-3">
              <span className="text-[10px] text-slate-500 font-bold">1</span>
              <input 
                type="range"
                min={1}
                max={selectedEdition.numero_paginas}
                value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (isMobile || val === 1 || val === selectedEdition.numero_paginas) {
                    setCurrentPage(val);
                  } else {
                    setCurrentPage(val % 2 === 0 ? val : val - 1);
                  }
                }}
                className="flex-1 accent-sky-500 bg-slate-900 rounded-lg h-1.5 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 font-bold">{selectedEdition.numero_paginas}</span>
            </div>
          </div>
        ) : null}

        {/* Inline CSS animations to simulate smooth flipping 3D look */}
        <style>{`
          @keyframes flipRight {
            0% { transform: rotateY(0deg) scale(1); opacity: 1; }
            50% { transform: rotateY(-30deg) scale(0.98); opacity: 0.9; }
            100% { transform: rotateY(0deg) scale(1); opacity: 1; }
          }
          @keyframes flipLeft {
            0% { transform: rotateY(0deg) scale(1); opacity: 1; }
            50% { transform: rotateY(30deg) scale(0.98); opacity: 0.9; }
            100% { transform: rotateY(0deg) scale(1); opacity: 1; }
          }
          .animate-flip-right {
            animation: flipRight 0.3s ease-in-out;
          }
          .animate-flip-left {
            animation: flipLeft 0.3s ease-in-out;
          }
          .animate-hover-spin:hover {
            transform: rotate(180deg);
            transition: transform 0.5s ease;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-800 p-6 min-h-screen bg-[#0b1329] bg-gradient-to-br from-[#0b1329] via-[#101b3b] to-[#070b1a] relative overflow-hidden">
      
      {/* Background aesthetics */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-[160px] pointer-events-none"></div>

      {/* Visor Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6 relative z-10">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <Eye className="w-8 h-8 text-sky-400" /> Visor de Ediciones
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Visualiza y hojea de forma interactiva y en alta definición todas tus publicaciones digitales.
          </p>
        </div>

        {/* Newspaper Switcher Dropdown */}
        {/* Newspaper Switcher Dropdown */}
        {companies.length > 0 && (
          <div className="relative group">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Periódico / Empresa
            </label>
            <div className="relative">
              <select
                value={selectedCompanyId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedCompanyId(val ? parseInt(val, 10) : null);
                }}
                className="appearance-none bg-slate-900/90 border border-white/15 rounded-xl px-4 py-2.5 pr-10 text-sm font-bold text-white shadow-xl hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-500/50 cursor-pointer min-w-[220px]"
              >
                {companies.map((comp) => (
                  <option key={comp.id} value={comp.id} className="bg-slate-950 text-white">
                    {comp.nombre_comercial || comp.nombre}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-white transition-colors" />
            </div>
          </div>
        )}
      </div>

      {/* Advanced Filter Toolbar */}
      <div className="bg-slate-900/70 border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-md grid grid-cols-1 md:grid-cols-12 gap-4 items-end relative z-10">
        
        {/* Search */}
        <div className={`${companies.length > 0 ? 'md:col-span-4' : 'md:col-span-6'} space-y-1.5`}>
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-sky-400" /> Buscar por título
          </label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Buscar título..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-white/10 hover:border-white/20 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-2 px-3 pl-9 text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-medium"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Collection Type Filter */}
        <div className={`${companies.length > 0 ? 'md:col-span-3' : 'md:col-span-5'} space-y-1.5`}>
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-sky-400" /> Tipo de Colección
          </label>
          <div className="flex bg-slate-950/85 p-0.5 rounded-xl border border-white/10">
            {['TODAS', 'PERIÓDICO', 'REVISTA', 'CÓMIC'].map((type) => (
              <button
                key={type}
                onClick={() => setCollectionFilter(type)}
                className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all ${
                  collectionFilter === type 
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type === 'TODAS' ? 'Todos' : (type === 'PERIÓDICO' ? 'Periódicos' : (type === 'REVISTA' ? 'Revistas' : 'Cómics'))}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter */}
        {companies.length > 0 && (
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-400" /> Estado de Edición
            </label>
            <div className="flex bg-slate-950/85 p-0.5 rounded-xl border border-white/10">
              {['TODAS', 'PUBLICADA', 'PROGRAMADA', 'BORRADOR'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all ${
                    statusFilter === status 
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {status === 'TODAS' ? 'Todos' : (status === 'PUBLICADA' ? 'Publicadas' : (status === 'PROGRAMADA' ? 'Programadas' : 'Borradores'))}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reset Filter Button */}
        <div className="md:col-span-1">
          <button
            onClick={() => {
              setSearch('');
              setCollectionFilter('TODAS');
              setStatusFilter('TODAS');
            }}
            className="w-full flex items-center justify-center p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all border border-white/5"
            title="Limpiar Filtros"
          >
            <RefreshCw className="w-4 h-4 animate-hover-spin" />
          </button>
        </div>
      </div>

      {/* Editions Grid List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-12 h-12 text-sky-400 animate-spin" />
          <p className="text-slate-400 text-sm font-semibold animate-pulse">Cargando catálogo del Visor...</p>
        </div>
      ) : editions.length === 0 ? (
        <div className="bg-slate-900/40 border border-white/10 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-xl">
          <div className="w-16 h-16 bg-slate-800/80 rounded-2xl flex items-center justify-center mx-auto border border-white/5 text-slate-500">
            <LayoutGrid className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">No se hallaron ediciones</h3>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              No hay ediciones que coincidan con los filtros seleccionados o no se han cargado publicaciones para **{getSelectedCompanyName()}** todavía.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 relative z-10">
          {editions.map((ed) => {
            const displayType = parseCollectionType(ed.codigo);
            
            // Status colors map
            const getStatusBadge = (estado: string) => {
              switch (estado) {
                case 'PUBLICADA':
                  return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider">PUBLICADA</span>;
                case 'PROGRAMADA':
                  return <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider">PROGRAMADA</span>;
                case 'BORRADOR':
                  return <span className="bg-slate-500/10 text-slate-400 border border-slate-500/20 px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider">BORRADOR</span>;
                case 'SUSPENDIDA':
                  return <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider">SUSPENDIDA</span>;
                default:
                  return <span className="bg-slate-500/10 text-slate-400 border border-slate-500/20 px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider">{estado}</span>;
              }
            };

            return (
              <div 
                key={ed.id}
                onClick={() => openReader(ed)}
                className="group bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden hover:border-sky-500/40 hover:shadow-[0_20px_40px_-15px_rgba(56,189,248,0.15)] transition-all duration-300 cursor-pointer flex flex-col justify-between"
              >
                {/* Portada Image Container */}
                <div className="relative aspect-[3/4] bg-slate-950 overflow-hidden">
                  {ed.portada_url ? (
                    <img 
                      src={getFullImageUrl(ed.portada_url) || ''} 
                      alt={ed.titulo}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        // Fallback fallback to placeholder cover mockup
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=300&auto=format&fit=crop';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-600 gap-2 border-b border-white/5">
                      <FileText className="w-12 h-12" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Sin portada</span>
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60 group-hover:opacity-85 transition-opacity duration-300"></div>

                  {/* Hover Quick Action */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-slate-955/40 backdrop-blur-xs">
                    <button className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg transform translate-y-3 group-hover:translate-y-0 transition-all duration-300">
                      <BookOpen className="w-4 h-4" /> Leer Edición
                    </button>
                  </div>

                  {/* Type Badge top-left */}
                  <span className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md text-white border border-white/10 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider">
                    {displayType}
                  </span>
                </div>

                {/* Info Text */}
                <div className="p-4 space-y-3">
                  <div className="space-y-1">
                    <span className="text-[9px] text-sky-400 font-bold uppercase tracking-wider font-mono">
                      Código: {ed.codigo}
                    </span>
                    <h3 className="font-extrabold text-white text-sm tracking-tight leading-tight line-clamp-1 group-hover:text-sky-400 transition-colors">
                      {ed.titulo}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-400 font-bold">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {(() => {
                        const parts = (ed.fecha_edicion || '').split('-');
                        if (parts.length === 3) {
                          const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                          return dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
                        }
                        return new Date(ed.fecha_edicion).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
                      })()}
                    </span>
                    {getStatusBadge(ed.estado)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULLSCREEN FLIPBOOK modal */}
      {isReaderOpen && selectedEdition && (
        <div 
          ref={readerRef}
          className="fixed inset-0 z-[100] bg-[#080d1a] text-white flex flex-col justify-between select-none animate-in fade-in duration-350"
        >
          {/* Header Toolbar */}
          <div className="bg-[#0b1329]/90 border-b border-white/10 px-4 md:px-6 py-3 md:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 backdrop-blur-md">
            <div className="space-y-0.5 text-center sm:text-left">
              <span className="text-[9px] text-sky-400 font-bold tracking-widest uppercase">
                Visor Protegido — {parseCollectionType(selectedEdition.codigo)}
              </span>
              <h2 className="text-xs sm:text-sm md:text-base font-black tracking-tight flex items-center justify-center sm:justify-start gap-2">
                {selectedEdition.titulo} <span className="text-slate-500 text-xs font-mono font-bold">({selectedEdition.codigo})</span>
              </h2>
            </div>
 
            {/* Controls panel */}
            <div className="flex items-center gap-2 md:gap-4">
              {/* Zoom Controls */}
              <div className="hidden sm:flex bg-slate-900 border border-white/10 rounded-xl p-1 text-slate-400 items-center">
                <button 
                  onClick={() => setZoom(prev => Math.max(50, prev - 25))}
                  className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold px-2 w-12 text-center text-white">{zoom}%</span>
                <button 
                  onClick={() => setZoom(prev => Math.min(250, prev + 25))}
                  className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
 
              {/* Fullscreen Button */}
              <button 
                onClick={toggleFullscreen}
                className="p-2.5 bg-slate-900 border border-white/10 hover:text-white text-slate-400 rounded-xl transition-all hidden sm:block"
                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
 
              {/* Close Button */}
              <button 
                onClick={() => {
                  setIsReaderOpen(false);
                  navigate('/dashboard');
                }}
                className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-400 font-bold text-xs py-2 px-3.5 rounded-xl transition-all"
              >
                <X className="w-4 h-4" /> <span className="hidden sm:inline">Cerrar Visor</span>
              </button>
            </div>
          </div>

          {/* Viewport Area */}
          <div className="flex-grow flex items-center justify-between p-4 relative overflow-hidden bg-[#050914] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0d162d] via-[#050914] to-[#02050c]">
            
            {/* Left page switcher trigger */}
            <button 
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || isFlipping}
              className="absolute left-2 sm:left-6 z-40 bg-slate-900/80 hover:bg-slate-800/90 text-slate-300 hover:text-white border border-white/10 hover:border-sky-500/30 p-2 sm:p-4 rounded-full disabled:opacity-10 transition-all shadow-2xl disabled:pointer-events-none hover:scale-105"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
            </button>

            {/* Page display box */}
            <div className="w-full h-full flex items-center justify-center p-2 md:p-6 overflow-auto">
              <div 
                className="flex items-center justify-center origin-center transition-all duration-300"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                {selectedEdition.numero_paginas === 0 || !selectedEdition.numero_paginas ? (
                  /* No pages fallback placeholder */
                  <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-8 text-center max-w-md shadow-2xl space-y-4">
                    <Award className="w-12 h-12 text-yellow-400 mx-auto animate-bounce" />
                    <h3 className="text-lg font-black text-white">Edición en procesamiento</h3>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Esta publicación aún no contiene páginas procesadas. Si acabas de subir tu archivo PDF, se está transformando en segundo plano. Espera unos instantes.
                    </p>
                    <div className="flex items-center justify-center gap-1.5 text-sky-400 font-bold text-[10px] uppercase tracking-wider animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando PDF principal...
                    </div>
                  </div>
                ) : (
                  /* Reader display container (Single page on mobile, Double page spread on desktop) */
                  <div 
                    className={`flex items-stretch justify-center relative ${
                      isFlipping 
                        ? (flipDirection === 'right' ? 'animate-flip-right' : 'animate-flip-left') 
                        : ''
                    }`}
                    style={{
                      perspective: '2000px',
                      transition: 'transform 0.4s ease-out'
                    }}
                  >
                    
                    {/* Double page view wrapper */}
                    {isMobile || currentPage === 1 ? (
                      /* Single Center Page (e.g. Cover Page, or mobile mode) */
                      <div className="bg-[#181d2a] p-1.5 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] border border-white/10 max-w-[85vw] max-h-[70vh] aspect-[3/4] overflow-hidden flex items-center justify-center">
                        {loadingPagesState[currentPage] === 'loading' && (
                          <div className="absolute inset-0 bg-[#0e121b]/95 rounded-2xl flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">Servidor seguro...</span>
                          </div>
                        )}
                        {loadingPagesState[currentPage] === 'error' && (
                          <div className="absolute inset-0 bg-[#0e121b]/95 rounded-2xl flex flex-col items-center justify-center gap-3 p-6 text-center text-rose-400 font-bold text-xs">
                            <X className="w-8 h-8 text-rose-500" /> Error al leer página {currentPage}
                          </div>
                        )}
                        {loadedPages[currentPage] && (
                          <img 
                            src={loadedPages[currentPage]} 
                            className="w-full h-full object-contain rounded-xl select-none"
                            alt={`Página ${currentPage}`} 
                          />
                        )}
                      </div>
                    ) : (
                      /* Double Page Spread side-by-side (Book representation) */
                      <div className="flex shadow-[0_30px_70px_-20px_rgba(0,0,0,0.95)] rounded-2xl overflow-hidden border border-white/15">
                        
                        {/* LEFT PAGE */}
                        <div className="bg-[#1b2131] p-1.5 border-r border-slate-950 flex-shrink-0 w-[40vw] max-w-[500px] aspect-[3/4] flex items-center justify-center relative overflow-hidden">
                          {loadingPagesState[currentPage] === 'loading' && (
                            <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3">
                              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
                            </div>
                          )}
                          {loadingPagesState[currentPage] === 'error' && (
                            <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3 text-center text-rose-400 text-xs">
                              <span>Error al leer página</span>
                            </div>
                          )}
                          {loadedPages[currentPage] && (
                            <img 
                              src={loadedPages[currentPage]} 
                              className="w-full h-full object-contain"
                              alt={`Página ${currentPage}`} 
                            />
                          )}
                          <span className="absolute bottom-3 left-4 text-[9px] font-bold text-slate-500 font-mono">Página {currentPage}</span>
                        </div>

                        {/* RIGHT PAGE */}
                        <div className="bg-[#1b2131] p-1.5 flex-shrink-0 w-[40vw] max-w-[500px] aspect-[3/4] flex items-center justify-center relative overflow-hidden">
                          {currentPage + 1 <= (selectedEdition.numero_paginas || 0) ? (
                            <>
                              {loadingPagesState[currentPage + 1] === 'loading' && (
                                <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3">
                                  <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
                                </div>
                              )}
                              {loadingPagesState[currentPage + 1] === 'error' && (
                                <div className="absolute inset-0 bg-[#0e121b]/90 flex flex-col items-center justify-center gap-3 text-center text-rose-400 text-xs">
                                  <span>Error al leer página</span>
                                </div>
                              )}
                              {loadedPages[currentPage + 1] && (
                                <img 
                                  src={loadedPages[currentPage + 1]} 
                                  className="w-full h-full object-contain"
                                  alt={`Página ${currentPage + 1}`} 
                                />
                              )}
                              <span className="absolute bottom-3 right-4 text-[9px] font-bold text-slate-500 font-mono">Página {currentPage + 1}</span>
                            </>
                          ) : (
                            /* Empty space background if odd and pages exceeded */
                            <div className="w-full h-full bg-[#0a0d14] flex items-center justify-center text-slate-700">
                              <Sparkles className="w-8 h-8 opacity-20" />
                            </div>
                          )}
                        </div>

                        {/* Binder middle shade/crease simulation */}
                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-4 bg-gradient-to-r from-black/40 via-black/10 to-black/40 pointer-events-none z-30"></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right page switcher trigger */}
            <button 
              onClick={handleNextPage}
              disabled={
                !selectedEdition || 
                (selectedEdition.numero_paginas || 0) <= 0 || 
                isFlipping || 
                (isMobile 
                  ? currentPage >= (selectedEdition.numero_paginas || 0) 
                  : (currentPage === 1 ? (selectedEdition.numero_paginas || 0) <= 1 : currentPage + 1 >= (selectedEdition.numero_paginas || 0))
                )
              }
              className="absolute right-2 sm:right-6 z-40 bg-slate-900/80 hover:bg-slate-800/90 text-slate-300 hover:text-white border border-white/10 hover:border-sky-500/30 p-2 sm:p-4 rounded-full disabled:opacity-10 transition-all shadow-2xl disabled:pointer-events-none hover:scale-105"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
            </button>
          </div>

          {/* Navigation Controls Footer */}
          {selectedEdition.numero_paginas && selectedEdition.numero_paginas > 0 ? (
            <div className="bg-[#0b1329]/95 border-t border-white/10 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 flex-shrink-0 backdrop-blur-md">
              <div className="text-xs text-slate-400 font-bold">
                Navega usando los botones, el slider inferior o las flechas <kbd className="bg-slate-800 border border-white/10 px-1 py-0.5 rounded text-white mx-0.5 font-mono">←</kbd> y <kbd className="bg-slate-800 border border-white/10 px-1 py-0.5 rounded text-white mx-0.5 font-mono">→</kbd> de tu teclado.
              </div>

              {/* Spread details */}
              <div className="flex items-center gap-4">
                <span className="font-bold text-sm tracking-widest text-white font-mono bg-slate-950 px-3.5 py-1.5 rounded-xl border border-white/5">
                  {isMobile ? `Pág. ${currentPage}` : (currentPage === 1 ? 'Portada' : `Pág. ${currentPage} - ${Math.min(currentPage + 1, selectedEdition.numero_paginas || 0)}`)} / {selectedEdition.numero_paginas}
                </span>
              </div>

              {/* Quick slider navigator */}
              <div className="w-full md:w-64 flex items-center gap-3">
                <span className="text-[10px] text-slate-500 font-bold">1</span>
                <input 
                  type="range"
                  min={1}
                  max={selectedEdition.numero_paginas}
                  value={currentPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    // Standardize input behavior to always jump to even page or page 1
                    if (isMobile || val === 1 || val === selectedEdition.numero_paginas) {
                      setCurrentPage(val);
                    } else {
                      // On double page layout, jump to the even page start
                      setCurrentPage(val % 2 === 0 ? val : val - 1);
                    }
                  }}
                  className="flex-1 accent-sky-500 bg-slate-900 rounded-lg h-1.5 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 font-bold">{selectedEdition.numero_paginas}</span>
              </div>
            </div>
          ) : null}

          {/* Inline CSS animations to simulate smooth flipping 3D look */}
          <style>{`
            @keyframes flipRight {
              0% { transform: rotateY(0deg) scale(1); opacity: 1; }
              50% { transform: rotateY(-30deg) scale(0.98); opacity: 0.9; }
              100% { transform: rotateY(0deg) scale(1); opacity: 1; }
            }
            @keyframes flipLeft {
              0% { transform: rotateY(0deg) scale(1); opacity: 1; }
              50% { transform: rotateY(30deg) scale(0.98); opacity: 0.9; }
              100% { transform: rotateY(0deg) scale(1); opacity: 1; }
            }
            .animate-flip-right {
              animation: flipRight 0.3s ease-in-out;
            }
            .animate-flip-left {
              animation: flipLeft 0.3s ease-in-out;
            }
            .animate-hover-spin:hover {
              transform: rotate(180deg);
              transition: transform 0.5s ease;
            }
          `}</style>
        </div>
      )}

    </div>
  );
};

export default Viewer;
