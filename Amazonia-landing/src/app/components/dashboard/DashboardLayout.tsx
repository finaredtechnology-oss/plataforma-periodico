import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookCopy, 
  Eye, 
  CreditCard, 
  Users, 
  Settings, 
  Building2,
  LogOut,
  ChevronDown,
  Newspaper,
  Bookmark,
  Bell,
  Search,
  Heart,
  Calendar,
  Cloud,
  Download,
  User,
  ArrowRight,
  ChevronRight,
  Menu,
  Loader2,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '../../contexts/auth';
import api from '../../services/api';
import { AdBanner } from '../AdBanner';

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

const iconMap: Record<string, React.ComponentType<any>> = {
  BookCopy: BookCopy,
  User: User,
  CreditCard: CreditCard,
  Download: Download,
  Heart: Heart,
  Bookmark: Bookmark
};

const DashboardLayout: React.FC = () => {
  const { user, companies, activeCompanyId, setActiveCompany, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Reader Tabs State
  const [activeReaderTab, setActiveReaderTab] = useState<'inicio' | 'mis-ediciones' | 'colecciones' | 'favoritos' | 'suscripciones' | 'perfil'>(() => {
    const saved = localStorage.getItem('amazonia_active_reader_tab') as any;
    if (saved === 'mis-ediciones' || saved === 'colecciones' || saved === 'favoritos') {
      return 'inicio';
    }
    return saved || 'inicio';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'todas' | 'dia' | 'mes'>('todas');

  useEffect(() => {
    localStorage.setItem('amazonia_active_reader_tab', activeReaderTab);
  }, [activeReaderTab]);
  
  // Track unique read editions count dynamically
  const [readEditionsCount, setReadEditionsCount] = useState(0);
  const [activeSubscription, setActiveSubscription] = useState<any>(null);
  const [pendingSubscriptions, setPendingSubscriptions] = useState<any[]>([]);
  const [historySubscriptions, setHistorySubscriptions] = useState<any[]>([]);
  const [isLoadingSub, setIsLoadingSub] = useState(true);
  
  // Real assigned editions state
  const [assignedEditions, setAssignedEditions] = useState<any[]>([]);
  const [isLoadingEditions, setIsLoadingEditions] = useState(false);

  // Real user activities state
  const [activitiesList, setActivitiesList] = useState<any[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  const fetchActivities = async () => {
    setIsLoadingActivities(true);
    try {
      const res = await api.get('auth/activities/');
      setActivitiesList(res.data || []);
    } catch (err) {
      console.error('Error fetching activities:', err);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const fetchAssignedEditions = async () => {
    if (!user?.id) return;
    setIsLoadingEditions(true);
    try {
      const res = await api.get(`users/${user.id}/editions/`);
      setAssignedEditions(res.data || []);
    } catch (err) {
      console.error('Error fetching assigned editions:', err);
    } finally {
      setIsLoadingEditions(false);
    }
  };

  const fetchActiveSubscription = async () => {
    setIsLoadingSub(true);
    try {
      const res = await api.get('user/subscriptions/');
      const data = res.data;
      
      if (data.active_subscription) {
        const active = data.active_subscription;
        
        let planDesc = 'Acceso ilimitado a todas las ediciones regionales e históricas.';
        let planCode = 'mensual';
        if (active.plan_codigo === 'PLAN_DIARIO') {
          planDesc = 'Ideal para informarte cada día.';
          planCode = 'diario';
        } else if (active.plan_codigo === 'PLAN_ANUAL') {
          planDesc = 'La mejor opción para ti, con ahorro permanente.';
          planCode = 'anual';
        }

        const dateObj = new Date(active.fecha_fin);
        const formattedBilling = active.fecha_fin 
          ? dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
          : 'Acceso Permanente';

        setActiveSubscription({
          id: `#SUB-${String(active.id).padStart(5, '0')}`,
          name: active.nombre,
          desc: planDesc,
          price: `S/ ${active.precio}`,
          planCode: planCode,
          nextBilling: formattedBilling,
          paymentMethod: active.medio_pago || 'YAPE/PLIN'
        });
      } else {
        setActiveSubscription(null);
      }
      
      setPendingSubscriptions(data.pending_subscriptions || []);
      setHistorySubscriptions(data.history || []);
    } catch (err) {
      console.error('Error fetching reader subscription details:', err);
    } finally {
      setIsLoadingSub(false);
    }
  };

  useEffect(() => {
    try {
      const readEditionsRaw = localStorage.getItem('amazonia_read_editions');
      if (readEditionsRaw) {
        const readEditions = JSON.parse(readEditionsRaw);
        if (Array.isArray(readEditions)) {
          setReadEditionsCount(readEditions.length);
        } else {
          setReadEditionsCount(0);
        }
      } else {
        localStorage.setItem('amazonia_read_editions', JSON.stringify([]));
        setReadEditionsCount(0);
      }
    } catch (e) {
      console.error('Error loading read editions count:', e);
      setReadEditionsCount(0);
    }
  }, [activeReaderTab]);

  useEffect(() => {
    const isPublisher = (companies && companies.length > 0) || user?.email === 'admin';
    if (!isPublisher) {
      fetchActiveSubscription();
      fetchAssignedEditions();
      fetchActivities();
    }
  }, [activeReaderTab, user, companies]);

  // Mobile sidebars states
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [publisherSidebarOpen, setPublisherSidebarOpen] = useState(false);

  // Close sidebar drawer on route navigation
  useEffect(() => {
    setMobileSidebarOpen(false);
    setPublisherSidebarOpen(false);
  }, [location.pathname]);

  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches || 
    (window.navigator as any).standalone === true
  );

  const isPublisher = !isStandalone && ((companies && companies.length > 0) || user?.email === 'admin');

  // Redirection for admin routes in standalone mode
  useEffect(() => {
    if (isStandalone) {
      const adminRoutes = [
        '/dashboard/editions',
        '/dashboard/users',
        '/dashboard/subscribers',
        '/dashboard/plans',
        '/dashboard/payments-methods',
        '/dashboard/landing-config',
        '/dashboard/landing-editions',
        '/dashboard/landing-news'
      ];
      if (adminRoutes.some(route => location.pathname.startsWith(route))) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [location.pathname, isStandalone, navigate]);

  const activeCompany = isPublisher 
    ? (companies.find(c => c.id === activeCompanyId) || companies[0] || { id: 1, nombre: 'Amazonia', razon_social: 'Amazonia', estado: 'ACTIVO' }) 
    : null;

  // ----------------------------------------------------
  // READER DASHBOARD LAYOUT (when companies is empty)
  // ----------------------------------------------------
  if (!isPublisher) {
    // Mock user display name matching 'Carlos Sánchez' in mockup
    const userDisplayName = user?.nombres || 'Carlos Sánchez';
    const userInitials = userDisplayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2) || 'CS';

    // If on viewer path, occupy full screen and hide sidebar/header
    if (location.pathname === '/dashboard/viewer') {
      return (
        <div className="w-screen h-screen bg-[#080d1a] overflow-hidden">
          <Outlet />
        </div>
      );
    }

    // Mock data for "Mis ediciones"
    const misEdiciones = [
      { id: '125', name: 'La Voz del Sur', date: '15 Mayo 2024', badge: 'Edición del día', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', cardColor: 'bg-[#ffc107]', logo: 'LA VOZ DEL SUR', textColor: 'text-slate-900' },
      { id: '842', name: 'El Pueblo', date: 'Mayo 2024', badge: 'Plan mensual', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200', cardColor: 'bg-[#003882]', logo: 'El Pueblo', textColor: 'text-white' },
      { id: '310', name: 'Correo Arequipa', date: '14 Mayo 2024', badge: 'Edición del día', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', cardColor: 'bg-[#d90429]', logo: 'Correo', textColor: 'text-white' },
      { id: '038', name: 'Diario Opinión', date: 'Abril 2024', badge: 'Plan mensual', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200', cardColor: 'bg-[#0d1e38]', logo: 'Diario Opinión', textColor: 'text-white' },
      { id: '210', name: 'Gestión', date: '13 Mayo 2024', badge: 'Edición del día', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', cardColor: 'bg-[#830a1c]', logo: 'GESTIÓN', textColor: 'text-white' }
    ];

    // Mock data for "Te puede interesar"
    const tePuedeInteresar = [
      { name: 'El Comercio', logoText: 'El Comercio', bg: 'bg-[#ffc107] text-black', desc: 'Información nacional e internacional' },
      { name: 'Perú 21', logoText: 'Perú 21', bg: 'bg-[#0f3d7a] text-white', desc: 'Actualidad y análisis en profundidad' },
      { name: 'RPP', logoText: 'RPP', bg: 'bg-[#fec006] text-black', desc: 'Noticias al instante, las 24 horas' },
      { name: 'Exitosa', logoText: 'EXITOSA', bg: 'bg-[#d90429] text-white', desc: 'La voz de los que no tienen voz' },
      { name: 'La República', logoText: 'La República', bg: 'bg-[#c1121f] text-white', desc: 'Periodismo con independencia' }
    ];

    return (
      <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
        
        {/* Reader Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 transition-transform duration-300 transform lg:static lg:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div>
            {/* Header / Logo */}
            <div className="h-16 flex items-center px-6 border-b border-slate-100">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shadow-md">
                  <Newspaper className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-black text-slate-900 tracking-tight">Amazonia Diario</span>
              </Link>
            </div>

            {/* Navigation Options */}
            <div className="px-4 py-6 space-y-7 text-left">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 block mb-3">
                  Navegación
                </span>
                <nav className="space-y-1">
                  <button
                    onClick={() => { setActiveReaderTab('inicio'); navigate('/dashboard'); }}
                    className={`flex items-center w-full px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                      activeReaderTab === 'inicio' && location.pathname === '/dashboard'
                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <LayoutDashboard className={`mr-2.5 h-4.5 w-4.5 ${activeReaderTab === 'inicio' && location.pathname === '/dashboard' ? 'text-brand-600' : 'text-slate-400'}`} />
                    Inicio
                  </button>

                  {/* Ocultado temporalmente por el momento
                  <button
                    onClick={() => { setActiveReaderTab('mis-ediciones'); navigate('/dashboard'); }}
                    className={`flex items-center w-full px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                      activeReaderTab === 'mis-ediciones' && location.pathname === '/dashboard'
                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <BookCopy className={`mr-2.5 h-4.5 w-4.5 ${activeReaderTab === 'mis-ediciones' && location.pathname === '/dashboard' ? 'text-brand-600' : 'text-slate-400'}`} />
                    Mis ediciones
                  </button>

                  <button
                    onClick={() => { setActiveReaderTab('colecciones'); navigate('/dashboard'); }}
                    className={`flex items-center w-full px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                      activeReaderTab === 'colecciones' && location.pathname === '/dashboard'
                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Newspaper className={`mr-2.5 h-4.5 w-4.5 ${activeReaderTab === 'colecciones' && location.pathname === '/dashboard' ? 'text-brand-600' : 'text-slate-400'}`} />
                    Colecciones
                  </button>

                  <button
                    onClick={() => { setActiveReaderTab('favoritos'); navigate('/dashboard'); }}
                    className={`flex items-center w-full px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                      activeReaderTab === 'favoritos' && location.pathname === '/dashboard'
                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Heart className={`mr-2.5 h-4.5 w-4.5 ${activeReaderTab === 'favoritos' && location.pathname === '/dashboard' ? 'text-brand-600' : 'text-slate-400'}`} />
                    Favoritos
                  </button>
                  */}

                  <button
                    onClick={() => { setActiveReaderTab('suscripciones'); navigate('/dashboard'); }}
                    className={`flex items-center w-full px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                      activeReaderTab === 'suscripciones' && location.pathname === '/dashboard'
                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <CreditCard className={`mr-2.5 h-4.5 w-4.5 ${activeReaderTab === 'suscripciones' && location.pathname === '/dashboard' ? 'text-brand-600' : 'text-slate-400'}`} />
                    Suscripciones
                  </button>
                </nav>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 block mb-3">
                  Cuenta
                </span>
                <nav className="space-y-1">
                  <button
                    onClick={() => { setActiveReaderTab('perfil'); navigate('/dashboard'); }}
                    className={`flex items-center w-full px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                      activeReaderTab === 'perfil' && location.pathname === '/dashboard'
                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <User className={`mr-2.5 h-4.5 w-4.5 ${activeReaderTab === 'perfil' && location.pathname === '/dashboard' ? 'text-brand-600' : 'text-slate-400'}`} />
                    Perfil
                  </button>

                  <button
                    onClick={logout}
                    className="flex items-center w-full px-3 py-2.5 text-xs font-bold rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 transition-all cursor-pointer"
                  >
                    <LogOut className="mr-2.5 h-4.5 w-4.5 text-red-500" />
                    Cerrar sesión
                  </button>
                </nav>
              </div>
            </div>

          </div>

          {/* Promotion Banner Box inside Sidebar */}
          <div className="p-4 m-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-left">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white mb-3 shadow-md shadow-brand-500/10">
              <Newspaper className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-black text-slate-900 mb-1.5 leading-snug">¿Necesitas más ediciones?</h4>
            <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mb-3">
              Descubre todos los periódicos disponibles y elige el plan que mejor se adapte a ti.
            </p>
            <Link 
              to="/catalog" 
              className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 hover:text-brand-800 transition-colors uppercase tracking-wider"
            >
              Explorar periódicos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {mobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-20 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Reader Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Header */}
          <header className="h-16 bg-white border-b border-slate-200/60 flex items-center justify-between px-4 sm:px-8 shadow-sm flex-shrink-0 z-10 gap-3">
            <div className="flex items-center gap-3">
              {/* Hamburger Button for mobile */}
              <button 
                onClick={() => setMobileSidebarOpen(true)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden focus:outline-none"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Greeting */}
              <div className="text-left">
                <h1 className="text-sm sm:text-lg font-black text-slate-900 leading-tight">
                  ¡Hola, {userDisplayName}! 👋
                </h1>
                <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-slate-500 font-bold mt-0.5">
                  Explora y disfruta todas las ediciones que has adquirido.
                </p>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-64 lg:w-80 hidden md:block">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar periódicos o ediciones..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:bg-white transition-all font-semibold"
              />
            </div>

            {/* Notifications & Profile dropdown */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              {/* Notification Bell */}
              <button className="relative p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 transition-colors rounded-xl hover:bg-slate-50">
                <Bell className="w-4 h-4 sm:w-5 h-5" />
                <span className="absolute top-1 right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-brand-500 text-white text-[7px] sm:text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                  3
                </span>
              </button>

              <div className="h-6 sm:h-8 w-px bg-slate-200"></div>

              {/* User Profiling */}
              <button className="flex items-center gap-1.5 sm:gap-2 hover:bg-slate-100 p-1 sm:p-1.5 rounded-xl transition-all">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-brand-500 text-white flex items-center justify-center font-black text-[10px] sm:text-xs shadow-sm">
                  {userInitials}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-tight">{userDisplayName}</p>
                  <p className="text-[9px] text-slate-400 leading-none mt-0.5 font-bold">{user?.email}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1 hidden sm:block" />
              </button>
            </div>
          </header>

          {/* Body content wrapped in grid split with activity list */}
          <div className="flex-1 flex overflow-hidden">
            
            {/* Center Area (Tab contents, lists, highlights) */}
            <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-8 space-y-8">
              {location.pathname !== '/dashboard' && location.pathname !== '/dashboard/' ? (
                <Outlet />
              ) : (
                <>
                  {activeReaderTab === 'inicio' && (
                <>
                  {/* Explorar mis ediciones Tabs row */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/50 pb-5 text-left">
                    <div>
                      <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">
                        Explorar mis ediciones
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                      <div className="flex bg-slate-200/60 p-0.5 rounded-xl border border-slate-200">
                        <button 
                          onClick={() => setActiveFilter('todas')}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${activeFilter === 'todas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          Todas
                        </button>
                        <button 
                          onClick={() => setActiveFilter('dia')}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${activeFilter === 'dia' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          Por día
                        </button>
                        <button 
                          onClick={() => setActiveFilter('mes')}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${activeFilter === 'mes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          Plan mensual
                        </button>
                      </div>

                      {/* Dropdown Filters */}
                      <button className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-sm">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" /> Fecha <ChevronDown className="w-3 h-3" />
                      </button>
                      <button className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-sm">
                        Más recientes <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Mis ediciones list section */}
                  <div className="space-y-4 text-left">
                    <div className="flex justify-between items-end">
                      <div>
                        <h3 className="text-base font-black text-slate-900">Mis ediciones</h3>
                        <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Periódicos que has comprado o a los que estás suscrito.</p>
                      </div>
                      {/* Ocultado por el momento
                      <button 
                        onClick={() => setActiveReaderTab('mis-ediciones')} 
                        className="text-xs font-bold text-brand-700 hover:text-brand-800 flex items-center gap-0.5 transition-colors cursor-pointer"
                      >
                        Ver todas <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      */}
                    </div>

                    {/* Cards grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
                      {isLoadingEditions ? (
                        <div className="col-span-full py-8 text-center flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cargando ediciones...</span>
                        </div>
                      ) : assignedEditions.length === 0 ? (
                        <div className="col-span-full text-center py-10 border border-dashed border-slate-200 rounded-xl p-6">
                          <BookCopy className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                          <h4 className="text-[11px] font-bold text-slate-700">No hay ediciones disponibles</h4>
                        </div>
                      ) : (
                        assignedEditions.map((ed, i) => {
                          const initials = ed.title.substring(0, 2).toUpperCase();
                          const formattedDate = ed.publication_date 
                            ? (() => {
                                const parts = String(ed.publication_date).split('-');
                                if (parts.length === 3) {
                                  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString('es-PE');
                                }
                                return new Date(ed.publication_date).toLocaleDateString('es-PE');
                              })()
                            : 'N/A';
                          return (
                            <div key={i} className="group flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all duration-300">
                              {/* Card Cover Link */}
                              <Link 
                                to="/dashboard/viewer"
                                onClick={() => {
                                  localStorage.setItem('amazonia_viewer_selected_edition', String(ed.edition_id));
                                  localStorage.setItem('amazonia_viewer_selected_company', String(ed.company_id));
                                }}
                                className="aspect-[3/4] bg-slate-50 p-3 relative flex items-center justify-center overflow-hidden border-b border-slate-200"
                              >
                                {ed.portada_url ? (
                                  <img 
                                    src={getFullImageUrl(ed.portada_url)} 
                                    alt={ed.title} 
                                    className="w-full h-full object-cover rounded-lg shadow-sm transform group-hover:scale-[1.03] transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-white shadow-sm rounded-lg flex flex-col p-2 transform group-hover:scale-[1.01] transition-transform duration-300 overflow-hidden relative">
                                    <div className="w-full py-1.5 text-center text-[10px] font-serif font-black tracking-tight mb-2 bg-brand-600 text-white rounded-md uppercase">
                                      {initials}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                      <div className="h-0.5 bg-slate-900 w-full mb-0.5"></div>
                                      <div className="h-1 bg-slate-200 w-full mb-0.5"></div>
                                      <div className="h-10 bg-slate-50 rounded border border-slate-200 mt-1 flex items-center justify-center">
                                        <Newspaper className="w-4 h-4 text-slate-300" />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </Link>
                              
                              {/* Details */}
                              <div className="p-3.5 flex flex-col flex-1 w-full text-left">
                                <h4 className="font-black text-slate-800 text-xs truncate group-hover:text-brand-700 transition-all" title={ed.title}>{ed.title}</h4>
                                <p className="text-[10px] text-slate-500 font-bold mt-0.5">{formattedDate}</p>
                                
                                <div className="mt-3.5 flex items-center gap-2">
                                  <Link 
                                    to="/dashboard/viewer" 
                                    onClick={() => {
                                      localStorage.setItem('amazonia_viewer_selected_edition', String(ed.edition_id));
                                      localStorage.setItem('amazonia_viewer_selected_company', String(ed.company_id));
                                    }}
                                    className="flex-1 py-1.5 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg group-hover:bg-brand-500 group-hover:text-white group-hover:border-brand-400 transition-all text-center"
                                  >
                                    Leer ahora
                                  </Link>
                                  {/* Ocultado por el momento
                                  <button className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                    <Bookmark className="w-3.5 h-3.5" />
                                  </button>
                                  */}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Highlights Banner row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left pt-2">
                    
                    {/* Item 1 */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-700 flex-shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 leading-snug">Accede cuando quieras</h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-bold mt-0.5">
                          Lee tus ediciones en cualquier momento y desde cualquier dispositivo.
                        </p>
                      </div>
                    </div>

                    {/* Item 2 */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-700 flex-shrink-0">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 leading-snug">Guarda y organiza</h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-bold mt-0.5">
                          Tus ediciones se guardan automáticamente en tu biblioteca personal.
                        </p>
                      </div>
                    </div>

                    {/* Item 3 Ocultado por el momento
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-700 flex-shrink-0">
                        <Heart className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 leading-snug">Tus favoritos</h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-bold mt-0.5">
                          Marca y encuentra fácilmente tus periódicos y ediciones favoritas.
                        </p>
                      </div>
                    </div>
                    */}

                  </div>

                  {/* Te puede interesar / Publicidad */}
                  <div className="w-full text-left">
                    <div className="px-4 sm:px-6 mb-2">
                      <h3 className="text-base font-black text-slate-900">Te puede interesar</h3>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Enlaces de interés y ofertas de nuestros patrocinadores.</p>
                    </div>
                    <AdBanner positionId="dashboard-banner" initialIndex={2} />
                  </div>
                </>
              )}

              {activeReaderTab === 'mis-ediciones' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 text-left space-y-4">
                  <h2 className="text-lg font-black text-slate-900">Mis Ediciones Completas</h2>
                  <p className="text-xs text-slate-400 font-bold">Aquí encontrarás todas tus compras y suscripciones activas.</p>
                  
                  {isLoadingEditions ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cargando tus ediciones...</span>
                    </div>
                  ) : assignedEditions.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl p-6">
                      <BookCopy className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <h4 className="text-xs font-bold text-slate-700">Aún no tienes ediciones disponibles</h4>
                      <p className="text-[10px] text-slate-400 font-semibold max-w-xs mx-auto mt-1 leading-normal">
                        Las nuevas ediciones de tus suscripciones activas o tus compras individuales aparecerán aquí listas para leer.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5 pt-4">
                      {assignedEditions.map((ed, i) => {
                        const initials = ed.title.substring(0, 2).toUpperCase();
                        const formattedDate = ed.publication_date 
                          ? (() => {
                              const parts = String(ed.publication_date).split('-');
                              if (parts.length === 3) {
                                return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString('es-PE');
                              }
                              return new Date(ed.publication_date).toLocaleDateString('es-PE');
                            })()
                          : 'N/A';
                        return (
                          <div key={i} className="group flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all duration-300">
                            {/* Card Cover Link */}
                            <Link 
                              to="/dashboard/viewer"
                              onClick={() => {
                                  localStorage.setItem('amazonia_viewer_selected_edition', String(ed.edition_id));
                                  localStorage.setItem('amazonia_viewer_selected_company', String(ed.company_id));
                              }}
                              className="aspect-[3/4] bg-slate-50 p-3 relative flex items-center justify-center overflow-hidden border-b border-slate-200"
                            >
                              {ed.portada_url ? (
                                <img 
                                  src={getFullImageUrl(ed.portada_url)} 
                                  alt={ed.title} 
                                  className="w-full h-full object-cover rounded-lg shadow-sm transform group-hover:scale-[1.03] transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full bg-white shadow-sm rounded-lg flex flex-col p-2 transform group-hover:scale-[1.01] transition-transform duration-300 overflow-hidden relative">
                                  <div className="w-full py-1.5 text-center text-[10px] font-serif font-black tracking-tight mb-2 bg-brand-600 text-white rounded-md uppercase">
                                    {initials}
                                  </div>
                                  <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                    <div className="h-0.5 bg-slate-900 w-full mb-0.5"></div>
                                    <div className="h-1 bg-slate-200 w-full mb-0.5"></div>
                                    <div className="h-10 bg-slate-50 rounded border border-slate-200 mt-1 flex items-center justify-center">
                                      <Newspaper className="w-4 h-4 text-slate-300" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Link>
                            
                            {/* Details */}
                            <div className="p-3.5 flex flex-col flex-1 w-full text-left">
                              <h4 className="font-black text-slate-800 text-xs truncate group-hover:text-brand-700 transition-all" title={ed.title}>{ed.title}</h4>
                              <p className="text-[10px] text-slate-500 font-bold mt-0.5">{formattedDate}</p>
                              
                              <div className="mt-3.5 flex items-center gap-2">
                                <Link 
                                  to="/dashboard/viewer" 
                                  onClick={() => {
                                    localStorage.setItem('amazonia_viewer_selected_edition', String(ed.edition_id));
                                    localStorage.setItem('amazonia_viewer_selected_company', String(ed.company_id));
                                  }}
                                  className="flex-1 py-1.5 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg group-hover:bg-brand-500 group-hover:text-white group-hover:border-brand-400 transition-all text-center"
                                >
                                  Leer ahora
                                </Link>
                                <button className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                  <Bookmark className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeReaderTab === 'colecciones' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 text-left space-y-4">
                  <h2 className="text-lg font-black text-slate-900">Mis Colecciones</h2>
                  <p className="text-xs text-slate-400 font-semibold">Agrupa tus periódicos y clasifica tus artículos de prensa favoritos.</p>
                  <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                    No tienes colecciones creadas todavía. Crea una colección en el visor de lectura.
                  </div>
                </div>
              )}

              {activeReaderTab === 'favoritos' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 text-left space-y-4">
                  <h2 className="text-lg font-black text-slate-900">Ediciones Favoritas</h2>
                  <p className="text-xs text-slate-400 font-bold">Tus diarios marcados para lectura rápida.</p>
                  
                  {assignedEditions.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                      No tienes ediciones favoritas todavía.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                      {assignedEditions.slice(0, 2).map((ed, i) => {
                        const initials = ed.title.substring(0, 2).toUpperCase();
                        return (
                          <div key={i} className="bg-slate-50 p-4 border border-slate-200 rounded-xl flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-8 h-8 rounded bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                                <Heart className="w-4 h-4 fill-white text-white" />
                              </div>
                              <div className="overflow-hidden">
                                <h4 className="text-xs font-bold text-slate-900 truncate max-w-[150px]" title={ed.title}>{ed.title}</h4>
                                <p className="text-[9px] text-slate-500 font-bold mt-0.5">Marcado como preferido</p>
                              </div>
                            </div>
                            <Link 
                              to="/dashboard/viewer" 
                              onClick={() => {
                                localStorage.setItem('amazonia_viewer_selected_edition', String(ed.edition_id));
                              }}
                              className="text-[10px] font-bold text-brand-700 hover:underline px-2.5 py-1 bg-white border border-slate-200 rounded-md"
                            >
                              Ir a leer
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeReaderTab === 'perfil' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 text-left space-y-6">
                  <h2 className="text-lg font-black text-slate-900">Detalles de Perfil</h2>
                  <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                    <div className="h-14 w-14 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-lg shadow-sm">{userInitials}</div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{userDisplayName}</h3>
                      <p className="text-xs text-slate-400 font-semibold">{user?.email}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-semibold text-slate-600">
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Nombre Completo</span>
                      <p className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-slate-800 font-semibold">{userDisplayName}</p>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Correo Electrónico</span>
                      <p className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-slate-800 font-semibold">{user?.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeReaderTab === 'suscripciones' && (
                <div className="space-y-8 text-left animate-in fade-in slide-in-from-bottom-4 duration-300">
                  {/* Current Subscription Card */}
                  {isLoadingSub ? (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-[#1a4d2e]" />
                      <span className="text-xs text-slate-500 font-bold">Cargando detalles de tu suscripción...</span>
                    </div>
                  ) : activeSubscription ? (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
                      {/* Background accent */}
                      <div className="absolute right-0 top-0 bottom-0 w-24 bg-[#1a4d2e]/5 rounded-l-full pointer-events-none hidden md:block" />
                      
                      <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Suscripción Activa
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">ID: {activeSubscription.id}</span>
                        </div>
                        
                        <div>
                          <h2 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">{activeSubscription.name}</h2>
                          <p className="text-xs text-slate-500 font-bold mt-1">{activeSubscription.desc}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span>Próximo cobro: <strong className="text-slate-800">{activeSubscription.nextBilling}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CreditCard className="w-4 h-4 text-slate-400" />
                            <span>Método de pago: <strong className="text-slate-800 uppercase">{activeSubscription.paymentMethod}</strong></span>
                          </div>
                        </div>

                        {/* Reading usage progress bar */}
                        <div className="max-w-md pt-2">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                            <span>Ediciones leídas este mes</span>
                            <span className="text-slate-900">{readEditionsCount} / Ilimitado</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-[#1a4d2e] rounded-full transition-all duration-500" style={{ width: `${Math.min(readEditionsCount * 5, 100)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto flex-shrink-0">
                        <button className="px-5 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors border border-slate-200 cursor-pointer text-center">
                          Descargar Facturas
                        </button>
                        <button className="px-5 py-3 rounded-xl bg-red-50 text-red-700 border border-red-200 font-bold text-xs hover:bg-red-100 transition-colors cursor-pointer text-center">
                          Cancelar Suscripción
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
                      <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-850 border border-amber-200">
                            Sin suscripción activa
                          </span>
                        </div>
                        <div>
                          <h2 className="text-xl md:text-2xl font-black text-slate-900 leading-tight font-sans">No tienes un plan contratado</h2>
                          <p className="text-xs text-slate-500 font-bold mt-1">Actualmente estás en modo de lectura libre. Suscríbete a uno de nuestros planes a continuación para acceder sin límites.</p>
                        </div>
                        {/* Reading usage progress bar */}
                        <div className="max-w-md pt-2">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                            <span>Ediciones leídas este mes</span>
                            <span className="text-slate-900">{readEditionsCount} / 0 (Sin límites con suscripción)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-[#1a4d2e] rounded-full transition-all duration-500" style={{ width: `${Math.min(readEditionsCount * 5, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pending/Queued Subscriptions */}
                  {!isLoadingSub && pendingSubscriptions && pendingSubscriptions.length > 0 && (
                    <div className="space-y-4 text-left">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Suscripciones Futuras</h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Planes comprados anticipadamente que se activarán automáticamente al vencer tu suscripción activa.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingSubscriptions.map((pending: any) => (
                          <div key={pending.compra_id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between hover:shadow-sm transition-shadow">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  pending.estado === 'PENDIENTE_PAGO' ? 'bg-amber-100 text-amber-850 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}>
                                  {pending.estado === 'PENDIENTE_PAGO' ? 'Esperando Aprobación' : 'Listo en Cola (Anticipada)'}
                                </span>
                                <h4 className="text-sm font-bold text-slate-900 mt-2">{pending.nombre}</h4>
                                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                  Registrado el: {new Date(pending.fecha_creacion).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}
                                </p>
                              </div>
                              <div className="text-right flex flex-col items-end">
                                <span className="text-xs font-black text-slate-900">S/ {pending.precio}</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{pending.medio_pago}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* History of Subscriptions */}
                  {!isLoadingSub && historySubscriptions && historySubscriptions.length > 0 && (
                    <div className="space-y-4 text-left">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Historial de Suscripciones</h3>
                      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-left text-xs font-semibold text-slate-700">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50/50 uppercase text-[9px] font-black tracking-wider text-slate-400">
                                <th className="py-3 px-6">Plan</th>
                                <th className="py-3 px-4">Fecha Inicio</th>
                                <th className="py-3 px-4">Fecha Fin</th>
                                <th className="py-3 px-6">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {historySubscriptions.map((hist: any) => (
                                <tr key={hist.id} className="hover:bg-slate-50/30 transition-colors">
                                  <td className="py-3.5 px-6 font-bold text-slate-900">{hist.nombre}</td>
                                  <td className="py-3.5 px-4 text-slate-500 font-mono">{new Date(hist.fecha_inicio).toLocaleDateString('es-PE')}</td>
                                  <td className="py-3.5 px-4 text-slate-500 font-mono">{hist.fecha_fin ? new Date(hist.fecha_fin).toLocaleDateString('es-PE') : 'Ilimitado'}</td>
                                  <td className="py-3.5 px-6">
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-650 border border-slate-200">
                                      {hist.estado}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Available Plans Grid */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-base font-black text-slate-900">Planes y Mejoras Disponibles</h3>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Elige el plan que mejor se adapte a tus necesidades de lectura.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                      {/* Plan Diario */}
                      <div className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative ${
                        activeSubscription?.planCode === 'diario' ? 'border-2 border-emerald-550 opacity-90' : 'border-slate-200'
                      }`}>
                        {activeSubscription?.planCode === 'diario' && (
                          <div className="absolute top-4 right-4 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">
                            Tu plan actual
                          </div>
                        )}
                        <div>
                          <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                            <Newspaper size={20} className="text-[#1a4d2e]" />
                          </div>
                          <h4 className="text-xs font-black tracking-widest text-[#1a4d2e] uppercase mb-1">Plan Diario</h4>
                          <p className="text-[10px] text-slate-400 font-bold mb-4">Ideal para informarte cada día</p>
                          <div className="flex items-baseline gap-1 mb-6">
                            <span className="text-base font-bold text-slate-800">S/</span>
                            <span className="text-3xl font-black text-slate-950">0.50</span>
                            <span className="text-[10px] text-slate-400 font-bold">/ edición</span>
                          </div>
                          <ul className="space-y-2 mb-6">
                            {['Acceso a la edición del día', 'Lectura en línea', 'Desde cualquier dispositivo'].map((feat, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                                <ChevronRight className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <span>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {activeSubscription?.planCode === 'diario' ? (
                          <Link to="/payment?plan=diario" className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-[#ea580c] text-white hover:bg-[#d44f0a] transition-all block">
                            Compra Anticipada
                          </Link>
                        ) : (
                          <Link to="/payment?plan=diario" className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-[#1a4d2e] text-white hover:bg-[#153e25] transition-all block">
                            Comprar edición
                          </Link>
                        )}
                      </div>

                      {/* Plan Flex (Mensual) */}
                      <div className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between relative ${
                        activeSubscription?.planCode === 'mensual' ? 'border-2 border-emerald-550 opacity-90' : 'border-slate-200 hover:shadow-md transition-shadow'
                      }`}>
                        {activeSubscription?.planCode === 'mensual' && (
                          <div className="absolute top-4 right-4 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">
                            Tu plan actual
                          </div>
                        )}
                        <div>
                          <div className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mb-4">
                            <Calendar size={20} className="text-[#ea580c]" />
                          </div>
                          <h4 className="text-xs font-black tracking-widest text-[#ea580c] uppercase mb-1">Plan Mensual</h4>
                          <p className="text-[10px] text-slate-400 font-bold mb-4">Para lectores frecuentes</p>
                          <div className="flex items-baseline gap-1 mb-6">
                            <span className="text-base font-bold text-slate-800">S/</span>
                            <span className="text-3xl font-black text-slate-950">14.50</span>
                            <span className="text-[10px] text-slate-400 font-bold">/ mes</span>
                          </div>
                          <ul className="space-y-2 mb-6">
                            {['Acceso a todas las ediciones', 'Historial completo', 'Lectura sin límites', 'Soporte prioritario'].map((feat, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                                <ChevronRight className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <span>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {activeSubscription?.planCode === 'mensual' ? (
                          <Link to="/payment?plan=mensual" className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-[#ea580c] text-white hover:bg-[#d44f0a] transition-all block">
                            Compra Anticipada
                          </Link>
                        ) : (
                          <Link to="/payment?plan=mensual" className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-[#1a4d2e] text-white hover:bg-[#153e25] transition-all block">
                            Suscribirme ahora
                          </Link>
                        )}
                      </div>

                      {/* Plan Anual */}
                      <div className={`bg-white border rounded-2xl p-6 shadow-md flex flex-col justify-between relative hover:shadow-lg transition-shadow ${
                        activeSubscription?.planCode === 'anual' ? 'border-2 border-emerald-500' : 'border-[#ea580c]'
                      }`}>
                        {activeSubscription?.planCode === 'anual' ? (
                          <div className="absolute top-4 right-4 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">
                            Tu plan actual
                          </div>
                        ) : (
                          <div className="absolute -top-3 right-6 bg-[#ea580c] text-white px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm">
                            2 Meses Gratis
                          </div>
                        )}
                        <div>
                          <div className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mb-4">
                            <Cloud size={20} className="text-[#ea580c]" />
                          </div>
                          <h4 className="text-xs font-black tracking-widest text-[#ea580c] uppercase mb-1">Plan Anual</h4>
                          <p className="text-[10px] text-slate-400 font-bold mb-4">La mejor opción para ti</p>
                          <div className="flex items-baseline gap-1 mb-6">
                            <span className="text-base font-bold text-slate-800">S/</span>
                            <span className="text-3xl font-black text-[#ea580c]">129.00</span>
                            <span className="text-[10px] text-slate-400 font-bold">/ año</span>
                          </div>
                          <ul className="space-y-2 mb-6">
                            {['Acceso a todas las ediciones', 'Historial completo', 'Lectura sin límites', '2 meses gratis', 'Soporte prioritario'].map((feat, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                                <ChevronRight className="w-3.5 h-3.5 text-[#ea580c] flex-shrink-0" />
                                <span className={idx === 3 ? 'text-slate-800 font-black' : ''}>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {activeSubscription?.planCode === 'anual' ? (
                          <Link to="/payment?plan=anual" className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-[#ea580c] text-white hover:bg-[#d44f0a] transition-all block shadow-sm">
                            Compra Anticipada
                          </Link>
                        ) : (
                          <Link to="/payment?plan=anual" className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-[#ea580c] text-white hover:bg-[#d44f0a] transition-all block shadow-sm">
                            Suscribirme ahora
                          </Link>
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

            {/* Reader Right Activity Sidebar */}
            <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-6 hidden lg:flex flex-col justify-between flex-shrink-0 text-left">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-1.5">
                  Actividad reciente
                </h3>
                <p className="text-[10px] text-slate-400 font-semibold mb-6">
                  Tus últimas acciones en la plataforma.
                </p>

                {/* Activity List */}
                <div className="space-y-5">
                  {isLoadingActivities ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                    </div>
                  ) : activitiesList.length > 0 ? (
                    activitiesList.map((act, i) => {
                      const ActIcon = iconMap[act.icon] || User;
                      return (
                        <div key={i} className="flex items-start justify-between gap-3 text-left">
                          <div className="flex items-start gap-3">
                            {/* Icon wrapper */}
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${act.iconColor}`}>
                              <ActIcon className="w-4.5 h-4.5" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800 leading-tight">
                                {act.text}
                              </p>
                              <p className="text-[10px] text-slate-600 font-bold mt-0.5 leading-snug">
                                {act.detail}
                              </p>
                              {act.sub && (
                                <p className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">
                                  {act.sub}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-[8px] text-slate-400 font-bold whitespace-nowrap mt-0.5 text-right flex-shrink-0">
                            {act.time}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 font-bold text-center py-8">
                      No hay actividades recientes.
                    </p>
                  )}
                </div>
              </div>

              {/* View all activity button */}
              <button className="w-full mt-6 py-2.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 transition-all text-center cursor-pointer">
                Ver toda la actividad
              </button>
            </aside>

          </div>
        </div>

      </div>
    );
  }

  // ----------------------------------------------------
  // PUBLISHER DASHBOARD LAYOUT (when user has companies)
  // ----------------------------------------------------

  const editorialNav = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Ediciones', href: '/dashboard/editions', icon: BookCopy },
    { name: 'Visor', href: '/dashboard/viewer', icon: Eye },
    { name: 'Compras', href: '/dashboard/purchases', icon: CreditCard },
    { name: 'Suscriptores', href: '/dashboard/subscribers', icon: Users },
    { name: 'Planes', href: '/dashboard/plans', icon: Building2 },
  ];

  const webNav = [
    { name: 'Portada Web', href: '/dashboard/landing-config', icon: Sparkles },
    { name: 'Ediciones Landing', href: '/dashboard/landing-editions', icon: ImageIcon },
    { name: 'Lo que está pasando', href: '/dashboard/landing-news', icon: Newspaper },
    { name: 'Usuarios', href: '/dashboard/users', icon: User },
    { name: 'Métodos de Pago', href: '/dashboard/payments-methods', icon: CreditCard },
    { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-dark-900 flex flex-col shadow-xl flex-shrink-0 transition-transform duration-300 transform lg:static lg:translate-x-0 ${
        publisherSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="h-16 flex items-center px-6 border-b border-dark-800">
          <BookCopy className="h-8 w-8 text-brand-500 mr-2" />
          <span className="text-white text-xl font-bold tracking-wide">Amazonia Admin</span>
        </div>
 
        <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto text-left">
          {/* Grupo 1: Gestión Editorial */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Gestión Editorial
            </div>
            <div className="space-y-1">
              {editorialNav.map((item) => {
                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-md font-bold'
                        : 'text-gray-300 hover:bg-dark-800 hover:text-white'
                    }`}
                  >
                    <Icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Grupo 2: Control Web y Sistema */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Control Web y Sistema
            </div>
            <div className="space-y-1">
              {webNav.map((item) => {
                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-md font-bold'
                        : 'text-gray-300 hover:bg-dark-800 hover:text-white'
                    }`}
                  >
                    <Icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
 
        <div className="p-4 border-t border-dark-800">
          <button
            onClick={logout}
            className="flex items-center w-full px-3 py-3 text-sm font-medium text-gray-300 rounded-lg hover:bg-dark-800 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="mr-3 h-5 w-5 text-gray-400" />
            Cerrar Sesión
          </button>
        </div>
      </aside>
 
      {/* Backdrop for publisher mobile */}
      {publisherSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setPublisherSidebarOpen(false)}
        />
      )}
 
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8 shadow-sm flex-shrink-0 z-10 gap-3">
          
          {/* Company Selector */}
          <div className="flex items-center gap-3">
            {/* Hamburger Button for publisher mobile */}
            <button 
              onClick={() => setPublisherSidebarOpen(true)}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 lg:hidden focus:outline-none"
            >
              <Menu className="w-5 h-5" />
            </button>
 
            <div className="relative group cursor-pointer">
              <div className="flex items-center space-x-1.5 sm:space-x-2 bg-gray-50 hover:bg-gray-100 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-gray-200 transition-colors">
                <div className="h-6 w-6 sm:h-8 sm:w-8 bg-brand-100 text-brand-700 rounded-md flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0">
                  {(activeCompany?.nombre || 'E').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs sm:text-sm font-semibold text-gray-900 leading-tight truncate max-w-[80px] sm:max-w-[150px]">
                    {activeCompany?.nombre || 'Empresa'}
                  </span>
                  <span className="text-[9px] sm:text-xs text-gray-500 font-medium leading-none mt-0.5">
                    Admin
                  </span>
                </div>
                <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 ml-1.5" />
              </div>
              
              {/* Dropdown for Companies */}
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="p-2 text-left">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
                    Tus Organizaciones
                  </div>
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => setActiveCompany(company.id)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center cursor-pointer ${
                        activeCompanyId === company.id 
                          ? 'bg-brand-50 text-brand-700 font-bold' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="h-6 w-6 rounded bg-gray-100 text-gray-600 flex items-center justify-center mr-2 text-xs font-bold">
                        {(company.nombre || 'E').charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{company.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
 
          {/* User Profile */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-gray-900 leading-tight">{user?.nombres || user?.email}</div>
              <div className="text-xs text-gray-500 font-bold mt-0.5">{user?.email}</div>
            </div>
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-tr from-brand-400 to-brand-600 text-white flex items-center justify-center font-bold shadow-sm text-xs sm:text-sm">
              {(user?.nombres || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
