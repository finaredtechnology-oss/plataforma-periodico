import React, { useState, useEffect, useRef } from 'react';
import { 
  BookCopy, Eye, Search, Filter, Calendar, Lock, Globe, 
  MoreVertical, ChevronLeft, ChevronRight, Plus, CheckCircle, 
  AlertTriangle, Upload, FileText, Loader2, Database, 
  MessageSquare, BarChart, HelpCircle, Pencil, X
} from 'lucide-react';
import { useAuth } from '../../contexts/auth';
import api from '../../services/api';
import { toast } from 'sonner';

// Allowed states matching the backend
const EstadoEdicion = {
  BORRADOR: 'BORRADOR',
  PENDIENTE_PROCESAMIENTO: 'PENDIENTE_PROCESAMIENTO',
  PROCESANDO: 'PROCESANDO',
  PROCESADA: 'PROCESADA',
  PROGRAMADA: 'PROGRAMADA',
  PUBLICADA: 'PUBLICADA',
  SUSPENDIDA: 'SUSPENDIDA',
  INACTIVA: 'INACTIVA',
  ERROR: 'ERROR'
};

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

const NewspaperThumbnail: React.FC<{ src: string | null }> = ({ src }) => {
  const [hasError, setHasError] = useState(false);
  const fullUrl = getFullImageUrl(src);

  if (!fullUrl || hasError) {
    return (
      <div className="w-full h-full bg-slate-50 border border-slate-200 flex flex-col justify-between p-1 select-none">
        <div className="border-b border-slate-200 pb-0.5 mb-1 flex justify-between items-center">
          <span className="text-[4.5px] font-black text-slate-700 tracking-tighter">DIARIO</span>
          <span className="text-[3px] text-slate-400 font-extrabold">PDF</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <FileText className="w-5 h-5 text-slate-300" />
        </div>
        <div className="h-0.5 bg-slate-200 rounded-xs w-full mt-0.5"></div>
      </div>
    );
  }

  return (
    <img 
      src={fullUrl} 
      className="w-full h-full object-cover" 
      alt="Portada" 
      onError={() => setHasError(true)} 
    />
  );
};

const Editions: React.FC = () => {
  const { activeCompanyId } = useAuth();
  
  // States for list
  const [editions, setEditions] = useState<Edition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(5);
  
  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODAS'); // TODAS, PUBLICADA, PROGRAMADA, BORRADOR
  const [collectionFilter, setCollectionFilter] = useState<string>('TODAS'); // TODAS, PERIÓDICO, REVISTA, CÓMIC
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  
  // Right Sidebar Metrics state
  const [metrics, setMetrics] = useState({
    publicadas: 0,
    programadas: 0,
    borradores: 0,
    storageUsed: '0 MB',
    storageLimit: '0 MB',
    storagePercent: 0
  });

  // Next logical edition codes cache for instant UI rendering
  const [nextCodesCache, setNextCodesCache] = useState<Record<string, string>>({});

  // Action states
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);
  
  // Modals state
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null);
  
  // Wizard steps state
  const [wizardStep, setWizardStep] = useState(1); // 1: Info, 2: Upload PDF, 3: Visibility, 4: Success
  const [newEditionId, setNewEditionId] = useState<number | null>(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [planLimits, setPlanLimits] = useState<any>(null);

  // Form Fields for new edition
  const [formTitulo, setFormTitulo] = useState('');
  const [formCodigo, setFormCodigo] = useState('');
  const [formCollectionType, setFormCollectionType] = useState('PERIÓDICO'); // PERIÓDICO, REVISTA, CÓMIC
  const [formFechaEdicion, setFormFechaEdicion] = useState(new Date().toISOString().substring(0, 10));
  const [formModalidad, setFormModalidad] = useState('PAGO'); // GRATUITA, PAGO
  const [formPrecio, setFormPrecio] = useState('2.50');
  const [formPermiteMuestra, setFormPermiteMuestra] = useState(false);
  const [formPaginasMuestra, setFormPaginasMuestra] = useState('1');
  const [formDescripcionCorta, setFormDescripcionCorta] = useState('');
  const [formDescripcionLarga, setFormDescripcionLarga] = useState('');

  // Selected PDF file
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Schedule Publish states
  const [scheduleDatetime, setScheduleDatetime] = useState('');

  // Reference for dropdown menus
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Subscriber Distribution Modal States
  const [showDistributionModal, setShowDistributionModal] = useState(false);
  const [selectedDistributionEdition, setSelectedDistributionEdition] = useState<Edition | null>(null);
  const [distributionList, setDistributionList] = useState<any[]>([]);
  const [isLoadingDistribution, setIsLoadingDistribution] = useState(false);
  const [isRetryingDistribution, setIsRetryingDistribution] = useState(false);

  const fetchDistributionStatus = async (editionId: number) => {
    if (!activeCompanyId) return;
    setIsLoadingDistribution(true);
    try {
      const res = await api.get(`/companies/${activeCompanyId}/editions/${editionId}/distribution-status/`);
      setDistributionList(res.data || []);
    } catch (err) {
      console.error("Error al cargar estado de distribución:", err);
      toast.error("Error al obtener la lista de distribución.");
    } finally {
      setIsLoadingDistribution(false);
    }
  };

  const handleRetryDistribution = async (editionId: number) => {
    if (!activeCompanyId) return;
    setIsRetryingDistribution(true);
    try {
      await api.post(`/companies/${activeCompanyId}/editions/${editionId}/retry-distribution/`);
      toast.success("¡Reintento de distribución encolado con éxito!");
      // Refresh list after brief delay
      setTimeout(() => fetchDistributionStatus(editionId), 1500);
    } catch (err) {
      console.error("Error al reintentar distribución:", err);
      toast.error("No se pudo iniciar el reintento de distribución.");
    } finally {
      setIsRetryingDistribution(false);
    }
  };

  const handleOpenDistributionModal = (ed: Edition) => {
    setSelectedDistributionEdition(ed);
    setShowDistributionModal(true);
    fetchDistributionStatus(ed.id);
    setActiveDropdownId(null);
  };

  // Fetch list of editions
  const fetchEditions = async () => {
    if (!activeCompanyId) return;
    setIsLoading(true);
    try {
      let url = `/companies/${activeCompanyId}/editions/?page=${page}`;
      
      if (statusFilter !== 'TODAS') {
        url += `&estado=${statusFilter}`;
      }
      if (search) {
        url += `&titulo=${search}`;
      }
      if (fechaInicio) {
        url += `&fecha_inicio=${fechaInicio}`;
      }
      if (fechaFin) {
        url += `&fecha_fin=${fechaFin}`;
      }
      
      const res = await api.get(url);
      
      // Parse response based on pagination wrapper
      let results: Edition[] = [];
      if (res.data && Array.isArray(res.data.results)) {
        results = res.data.results;
        setCount(res.data.count);
      } else if (Array.isArray(res.data)) {
        results = res.data;
        setCount(res.data.length);
      }
      
      // Filter locally for collection type based on code prefix
      if (collectionFilter !== 'TODAS') {
        results = results.filter(ed => {
          const type = parseCollectionType(ed.codigo);
          return type.toUpperCase() === collectionFilter;
        });
      }
      
      setEditions(results);
    } catch (err) {
      console.error("Error al cargar ediciones:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Right Sidebar Metrics
  const fetchMetrics = async () => {
    if (!activeCompanyId) return;
    try {
      // 1. Get plan details and storage limits
      const planRes = await api.get(`/companies/${activeCompanyId}/plan/usage/`);
      const usage = planRes.data;
      setPlanLimits(usage);
      
      // 2. Fetch status-specific counts
      const [pubRes, progRes, draftRes] = await Promise.all([
        api.get(`/companies/${activeCompanyId}/editions/?estado=PUBLICADA`),
        api.get(`/companies/${activeCompanyId}/editions/?estado=PROGRAMADA`),
        api.get(`/companies/${activeCompanyId}/editions/?estado=BORRADOR`)
      ]);
      
      const pubCount = pubRes.data.count !== undefined ? pubRes.data.count : (Array.isArray(pubRes.data) ? pubRes.data.length : 0);
      const progCount = progRes.data.count !== undefined ? progRes.data.count : (Array.isArray(progRes.data) ? progRes.data.length : 0);
      const draftCount = draftRes.data.count !== undefined ? draftRes.data.count : (Array.isArray(draftRes.data) ? draftRes.data.length : 0);
      
      // Format Storage
      const usedBytes = usage.storage?.used_bytes || 0;
      const limitBytes = usage.storage?.limit_bytes || 1024 * 1024 * 1024; // fallback 1GB
      
      const formatSize = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) {
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      };
      
      setMetrics({
        publicadas: pubCount,
        programadas: progCount,
        borradores: draftCount,
        storageUsed: formatSize(usedBytes),
        storageLimit: formatSize(limitBytes),
        storagePercent: Math.min(100, Math.round((usedBytes / limitBytes) * 100))
      });
    } catch (err) {
      console.warn("No se pudieron cargar las métricas de uso:", err);
    }
  };

  const prefetchNextCodes = async () => {
    if (!activeCompanyId) return;
    try {
      const res = await api.get(`/companies/${activeCompanyId}/editions/next-code/`);
      if (res.data) {
        const cache: Record<string, string> = {};
        Object.keys(res.data).forEach((type) => {
          cache[type] = res.data[type].next_number.toString();
        });
        setNextCodesCache(cache);
      }
    } catch (err) {
      console.warn("Error al pre-cargar los códigos autogenerados:", err);
    }
  };

  useEffect(() => {
    fetchEditions();
  }, [activeCompanyId, page, statusFilter, collectionFilter, search, fechaInicio, fechaFin]);

  useEffect(() => {
    fetchMetrics();
    prefetchNextCodes();
  }, [activeCompanyId, editions]);

  // Parse type from code prefix
  const parseCollectionType = (codigo: string): string => {
    if (codigo.startsWith('PER-')) return 'Periódico';
    if (codigo.startsWith('REV-')) return 'Revista';
    if (codigo.startsWith('COM-')) return 'Cómic';
    return 'Periódico'; // default
  };

  // Helper to strip prefixes when showing standard code to users
  const getDisplayCode = (codigo: string): string => {
    return codigo.replace(/^(PER-|REV-|COM-)/, '');
  };

  // State Transition Handlers
  const handlePublishNow = async (editionId: number) => {
    if (!activeCompanyId) return;
    try {
      await api.post(`/companies/${activeCompanyId}/editions/${editionId}/publish/`);
      fetchEditions();
      alert("Edición publicada exitosamente.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "No se pudo publicar la edición. Verifica que haya sido procesada.");
    }
  };

  const handleSuspend = async (editionId: number) => {
    if (!activeCompanyId) return;
    try {
      await api.post(`/companies/${activeCompanyId}/editions/${editionId}/suspend/`, { reason: "Suspensión administrativa." });
      fetchEditions();
      alert("Edición suspendida.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "No se pudo suspender la edición.");
    }
  };

  const handleReactivate = async (editionId: number) => {
    if (!activeCompanyId) return;
    try {
      await api.post(`/companies/${activeCompanyId}/editions/${editionId}/reactivate/`, { target_state: 'PUBLICADA' });
      fetchEditions();
      alert("Edición reactivada a Publicada.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "No se pudo reactivar la edición.");
    }
  };

  const handleDeleteEdition = async (editionId: number) => {
    if (!activeCompanyId) return;
    if (!window.confirm("¿Estás seguro de que deseas eliminar permanentemente esta edición? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      await api.delete(`/companies/${activeCompanyId}/editions/${editionId}/`);
      fetchEditions();
      fetchMetrics();
      alert("Edición eliminada exitosamente.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "No se pudo eliminar la edición.");
    }
  };

  const handleOpenScheduleModal = (edition: Edition) => {
    setSelectedEdition(edition);
    setScheduleDatetime('');
    setShowScheduleModal(true);
    setActiveDropdownId(null);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !selectedEdition || !scheduleDatetime) return;
    try {
      await api.post(`/companies/${activeCompanyId}/editions/${selectedEdition.id}/schedule/`, {
        scheduled_at: new Date(scheduleDatetime).toISOString(),
        timezone: 'America/Lima'
      });
      setShowScheduleModal(false);
      fetchEditions();
      alert("Edición programada.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "No se pudo programar la edición.");
    }
  };

  // Edit Metadata states
  const handleOpenEditModal = (edition: Edition) => {
    setSelectedEdition(edition);
    setFormTitulo(edition.titulo);
    setFormCodigo(getDisplayCode(edition.codigo));
    setFormCollectionType(parseCollectionType(edition.codigo).toUpperCase());
    setFormFechaEdicion(edition.fecha_edicion);
    setFormModalidad(edition.numero_paginas ? 'PAGO' : 'PAGO'); // placeholder checks
    setFormPrecio(edition.precio);
    setShowEditModal(true);
    setActiveDropdownId(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !selectedEdition) return;
    try {
      const typePrefix = formCollectionType === 'PERIÓDICO' ? 'PER-' : (formCollectionType === 'REVISTA' ? 'REV-' : 'COM-');
      await api.patch(`/companies/${activeCompanyId}/editions/${selectedEdition.id}/`, {
        titulo: formTitulo,
        codigo: `${typePrefix}${formCodigo}`,
        fecha_edicion: formFechaEdicion,
        precio: parseFloat(formPrecio)
      });
      setShowEditModal(false);
      fetchEditions();
      alert("Información de la edición actualizada.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "No se pudo actualizar la edición.");
    }
  };

  // Fetch next edition code from API (with instant cache lookup fallback)
  const fetchNextCode = async (type: string) => {
    if (nextCodesCache[type]) {
      setFormCodigo(nextCodesCache[type]);
      return;
    }
    
    if (!activeCompanyId) return;
    try {
      const res = await api.get(`/companies/${activeCompanyId}/editions/next-code/?type=${type}`);
      if (res.data && res.data.next_number) {
        const nextNumStr = res.data.next_number.toString();
        setFormCodigo(nextNumStr);
        setNextCodesCache((prev) => ({ ...prev, [type]: nextNumStr }));
      }
    } catch (err) {
      console.warn("No se pudo obtener el siguiente código de edición:", err);
    }
  };

  // Upload Wizard handlers
  const handleOpenUploadWizard = () => {
    setWizardStep(1);
    setWizardError('');
    setFormTitulo('');
    setFormCodigo('');
    setFormCollectionType('PERIÓDICO');
    fetchNextCode('PERIÓDICO');
    setFormFechaEdicion(new Date().toISOString().substring(0, 10));
    setFormModalidad('PAGO');
    setFormPrecio('2.50');
    setFormPermiteMuestra(false);
    setFormPaginasMuestra('1');
    setFormDescripcionCorta('');
    setFormDescripcionLarga('');
    setPdfFile(null);
    setCoverFile(null);
    setUploadProgress(0);
    setNewEditionId(null);
    setShowUploadWizard(true);
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId) return;
    setWizardLoading(true);
    setWizardError('');

    try {
      // Validate inputs
      if (formModalidad === 'PAGO' && parseFloat(formPrecio) <= 0) {
        throw new Error("El precio de venta debe ser mayor a 0.");
      }
      
      const typePrefix = formCollectionType === 'PERIÓDICO' ? 'PER-' : (formCollectionType === 'REVISTA' ? 'REV-' : 'COM-');
      
      const payload: any = {
        titulo: formTitulo,
        codigo: `${typePrefix}${formCodigo}`,
        fecha_edicion: formFechaEdicion,
        modalidad: formModalidad,
        precio: formModalidad === 'PAGO' ? parseFloat(formPrecio) : 0,
        moneda: 'PEN',
        descripcion_corta: formDescripcionCorta || undefined,
        descripcion_larga: formDescripcionLarga || undefined,
        permite_muestra: formPermiteMuestra,
        paginas_muestra: formPermiteMuestra ? parseInt(formPaginasMuestra) : null
      };

      const res = await api.post(`/companies/${activeCompanyId}/editions/`, payload);
      setNewEditionId(res.data.id);
      setWizardStep(2);
    } catch (err: any) {
      setWizardError(err.response?.data?.detail || err.message || "Error al registrar metadatos de la edición.");
    } finally {
      setWizardLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setWizardError("El archivo debe ser un formato PDF válido.");
        setPdfFile(null);
        return;
      }
      
      // Pre-validation of size limits on plan
      const limitMb = planLimits?.plan?.limite_pdf_mb || 50;
      if (file.size > limitMb * 1024 * 1024) {
        setWizardError(`El archivo excede el tamaño límite permitido por tu plan (${limitMb} MB).`);
        setPdfFile(null);
        return;
      }

      setPdfFile(file);
      setWizardError('');
    }
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !newEditionId || !pdfFile) return;
    setWizardLoading(true);
    setWizardError('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', pdfFile);
    if (coverFile) {
      formData.append('portada', coverFile);
    }

    try {
      await api.post(`/companies/${activeCompanyId}/editions/${newEditionId}/pdf/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(percent);
        }
      });

      // Once uploaded, the backend enqueues page rendering processing.
      // Move to step 3 for choosing visibilty state (they can save as Draft or wait for processing to schedule/publish)
      setWizardStep(3);
    } catch (err: any) {
      setWizardError(err.response?.data?.detail || "Error al subir el archivo PDF. Asegúrate de que cumple las restricciones.");
    } finally {
      setWizardLoading(false);
    }
  };

  const handleStep3Submit = async (stateOption: 'draft' | 'publish' | 'schedule') => {
    if (!activeCompanyId || !newEditionId) return;
    setWizardLoading(true);
    setWizardError('');

    try {
      if (stateOption === 'publish') {
        // Must wait for processing to finish before publishing!
        // We will notify the user, or try to publish. If backend fails because not processed, we explain it.
        try {
          await api.post(`/companies/${activeCompanyId}/editions/${newEditionId}/publish/`);
        } catch (pubErr: any) {
          // If not processed yet, it will fail with EDITION_NOT_PROCESSED.
          // That is normal, we just leave it in PENDIENTE_PROCESAMIENTO state.
          if (pubErr.response?.status === 400 && pubErr.response?.data?.detail?.includes("procesamiento")) {
             // Let it be, the background task will process it. We explain in success screen.
          } else {
            throw pubErr;
          }
        }
      } else if (stateOption === 'schedule') {
        if (!scheduleDatetime) {
          setWizardError("Por favor ingresa una fecha y hora para programar.");
          setWizardLoading(false);
          return;
        }
        await api.post(`/companies/${activeCompanyId}/editions/${newEditionId}/schedule/`, {
          scheduled_at: new Date(scheduleDatetime).toISOString(),
          timezone: 'America/Lima'
        });
      }
      
      setWizardStep(4);
    } catch (err: any) {
      setWizardError(err.response?.data?.detail || "Ocurrió un error al configurar la publicación.");
    } finally {
      setWizardLoading(false);
    }
  };

  const closeWizard = () => {
    setShowUploadWizard(false);
    fetchEditions();
  };

  return (
    <div className="max-w-[90rem] mx-auto space-y-8 animate-in fade-in duration-300 text-left">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/60 pb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">
            Gestión de ediciones
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-1.5">
            Sube, organiza y publica las ediciones de tus colecciones.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleOpenUploadWizard}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all shadow-md shadow-brand-500/10 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> Subir nueva edición
          </button>
        </div>
      </div>

      {/* Main Grid: Central Table + Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Central area: List & filters */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Tab bar & Search row */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            {/* Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 flex-wrap">
              {[
                { label: 'Todas las ediciones', value: 'TODAS' },
                { label: 'Publicadas', value: 'PUBLICADA' },
                { label: 'Programadas', value: 'PROGRAMADA' },
                { label: 'Borradores', value: 'BORRADOR' }
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => { setStatusFilter(tab.value); setPage(1); }}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    statusFilter === tab.value 
                      ? 'bg-white text-slate-900 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-grow md:flex-grow-0 md:w-60">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Buscar edición o periódico..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:bg-white transition-all font-semibold"
                />
              </div>

              {/* Advanced Filters Trigger */}
              <div className="relative">
                <button
                  onClick={() => setShowFiltersDropdown(!showFiltersDropdown)}
                  className={`px-3.5 py-2.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
                    showFiltersDropdown || fechaInicio || fechaFin || collectionFilter !== 'TODAS'
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-4 h-4" /> Filtros
                </button>

                {/* Filters Dropdown Card */}
                {showFiltersDropdown && (
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-40 space-y-4">
                    <div className="text-xs font-bold text-slate-900 border-b pb-2">Filtros Avanzados</div>
                    
                    {/* Collection Type */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Colección</label>
                      <select 
                        value={collectionFilter}
                        onChange={(e) => { setCollectionFilter(e.target.value); setPage(1); }}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                      >
                        <option value="TODAS">Todas las colecciones</option>
                        <option value="PERIÓDICO">Periódicos</option>
                        <option value="REVISTA">Revistas</option>
                        <option value="CÓMIC">Cómics</option>
                      </select>
                    </div>

                    {/* Date range */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Rango de fecha</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={fechaInicio}
                          onChange={(e) => { setFechaInicio(e.target.value); setPage(1); }}
                          className="border border-slate-200 rounded-lg p-1.5 text-[11px] font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                        />
                        <input
                          type="date"
                          value={fechaFin}
                          onChange={(e) => { setFechaFin(e.target.value); setPage(1); }}
                          className="border border-slate-200 rounded-lg p-1.5 text-[11px] font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Clear Button */}
                    <button
                      onClick={() => {
                        setCollectionFilter('TODAS');
                        setFechaInicio('');
                        setFechaFin('');
                        setShowFiltersDropdown(false);
                      }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-bold text-slate-700 transition-colors text-center uppercase tracking-wide"
                    >
                      Limpiar Filtros
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Table Container */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="px-6 py-4">Edición</th>
                    <th className="px-6 py-4">Periódico/Colección</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Visibilidad</th>
                    <th className="px-6 py-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs font-semibold text-slate-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-24 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                          <span className="text-slate-400 font-bold text-sm">Cargando ediciones...</span>
                        </div>
                      </td>
                    </tr>
                  ) : editions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-24 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto text-slate-400">
                          <BookCopy className="w-12 h-12 text-slate-300" />
                          <h4 className="font-bold text-slate-700 text-sm mt-2">No se encontraron ediciones</h4>
                          <p className="text-[11px] leading-relaxed text-center">Intenta ajustando tus filtros o sube tu primera edición.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    editions.map((ed) => {
                      const type = parseCollectionType(ed.codigo);
                      return (
                        <tr key={ed.id} className="hover:bg-slate-50/50 transition-colors">
                          {/* Miniatura & Numero */}
                          <td className="px-6 py-4.5">
                            <div className="flex items-center gap-3.5">
                              {/* Thumbnail frame */}
                              <div className="w-12 h-16 bg-slate-100 border border-slate-200 rounded overflow-hidden flex items-center justify-center shadow-sm relative flex-shrink-0">
                                <NewspaperThumbnail src={ed.portada_url} />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-black text-slate-900 text-sm">Edición #{getDisplayCode(ed.codigo)}</span>
                                <span className="text-[10px] text-slate-400 font-bold mt-0.5">{ed.titulo}</span>
                                <span className="text-[9px] text-slate-500 font-bold mt-1 bg-slate-100 border border-slate-200/60 px-1.5 py-0.5 rounded w-fit uppercase">{type}</span>
                              </div>
                            </div>
                          </td>

                          {/* Periódico / Colección */}
                          <td className="px-6 py-4.5 align-middle">
                            <span className="text-slate-800 text-xs font-bold">{ed.titulo}</span>
                          </td>

                          {/* Fecha */}
                          <td className="px-6 py-4.5 align-middle">
                            <div className="flex flex-col">
                              <span className="text-slate-800 text-xs font-bold">{ed.fecha_edicion}</span>
                              <span className="text-[9px] text-slate-400 mt-0.5">{ed.fecha_publicacion ? new Date(ed.fecha_publicacion).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '08:00 AM'}</span>
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="px-6 py-4.5 align-middle">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              ed.estado === EstadoEdicion.PUBLICADA 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                : ed.estado === EstadoEdicion.PROGRAMADA 
                                ? 'bg-blue-50 text-blue-700 border-blue-200/50'
                                : ed.estado === EstadoEdicion.BORRADOR 
                                ? 'bg-amber-50 text-amber-700 border-amber-200/50'
                                : ed.estado === EstadoEdicion.ERROR
                                ? 'bg-red-50 text-red-700 border-red-200/50'
                                : 'bg-slate-50 text-slate-700 border-slate-200/50'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                ed.estado === EstadoEdicion.PUBLICADA ? 'bg-emerald-500' :
                                ed.estado === EstadoEdicion.PROGRAMADA ? 'bg-blue-500' :
                                ed.estado === EstadoEdicion.BORRADOR ? 'bg-amber-500' : 'bg-slate-400'
                              }`}></span>
                              {ed.estado}
                            </span>
                          </td>

                          {/* Visibilidad */}
                          <td className="px-6 py-4.5 align-middle">
                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                              {ed.estado === EstadoEdicion.PUBLICADA ? (
                                <><Globe className="w-4 h-4 text-emerald-500" /> Pública</>
                              ) : ed.estado === EstadoEdicion.PROGRAMADA ? (
                                <><Calendar className="w-4 h-4 text-blue-500" /> Programada</>
                              ) : (
                                <><Lock className="w-4 h-4 text-slate-400" /> Privada</>
                              )}
                            </span>
                          </td>

                          {/* Acciones */}
                          <td className="px-6 py-4.5 text-center align-middle">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button 
                                onClick={() => handleOpenEditModal(ed)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 font-bold text-[10px] text-slate-700 transition-all shadow-xs"
                                title="Editar información"
                              >
                                Editar
                              </button>
                              
                              {ed.estado === EstadoEdicion.PUBLICADA ? (
                                <button 
                                  onClick={() => handleSuspend(ed.id)}
                                  className="px-2.5 py-1.5 bg-amber-50 border border-amber-200/50 rounded-lg hover:bg-amber-100/70 font-bold text-[10px] text-amber-700 transition-all shadow-xs"
                                >
                                  Inhabilitar
                                </button>
                              ) : (
                                <button 
                                  onClick={() => {
                                    if (ed.estado === EstadoEdicion.SUSPENDIDA) {
                                      handleReactivate(ed.id);
                                    } else {
                                      handlePublishNow(ed.id);
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200/50 rounded-lg hover:bg-emerald-100/70 font-bold text-[10px] text-emerald-700 transition-all shadow-xs"
                                >
                                  Habilitar
                                </button>
                              )}

                              {ed.estado === EstadoEdicion.PUBLICADA && (
                                <button 
                                  onClick={() => handleOpenDistributionModal(ed)}
                                  className="px-2.5 py-1.5 bg-blue-50 border border-blue-200/50 rounded-lg hover:bg-blue-100/70 font-bold text-[10px] text-blue-700 transition-all shadow-xs"
                                >
                                  Distribución
                                </button>
                              )}

                              <button 
                                onClick={() => handleDeleteEdition(ed.id)}
                                className="px-2.5 py-1.5 bg-red-50 border border-red-200/50 rounded-lg hover:bg-red-100/70 font-bold text-[10px] text-red-650 transition-all shadow-xs"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Pagination */}
            {!isLoading && count > 0 && (
              <div className="px-6 py-4.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
                <span className="text-[11px] text-slate-400 font-bold">
                  Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, count)} de {count} ediciones
                </span>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-white bg-slate-50 disabled:opacity-40 transition-colors shadow-sm"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  {[...Array(Math.ceil(count / pageSize))].map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all shadow-sm ${
                          page === pageNum 
                            ? 'bg-brand-50 border border-brand-300 text-brand-700' 
                            : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button 
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * pageSize >= count}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-white bg-slate-50 disabled:opacity-40 transition-colors shadow-sm"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Guide Steps "Cómo funciona el flujo de publicación" */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-left">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Cómo funciona el flujo de publicación</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
              {[
                { step: '1', title: '1. Sube el PDF', desc: 'Selecciona y sube el archivo PDF de la edición.' },
                { step: '2', title: '2. Completa la información', desc: 'Agrega fecha, portada, descripción y otros detalles.' },
                { step: '3', title: '3. Elige visibilidad', desc: 'Publica ahora o programa para una fecha específica.' },
                { step: '4', title: '4. Disponible para usuarios', desc: 'La edición estará visible en la plataforma para todos los suscriptores.' }
              ].map((stepItem, i) => (
                <div key={i} className="flex items-start gap-3 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center flex-shrink-0 shadow-sm border border-brand-100 font-black text-xs">
                    {stepItem.step}
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 mb-1 leading-snug">{stepItem.title}</h4>
                    <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">{stepItem.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Sidebar: Resumen & Acciones */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Metrics summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left space-y-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2">Resumen general</h3>
            <div className="space-y-4">
              {[
                { label: 'Ediciones publicadas', value: metrics.publicadas, color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Ediciones programadas', value: metrics.programadas, color: 'text-blue-600 bg-blue-50' },
                { label: 'Borradores', value: metrics.borradores, color: 'text-amber-500 bg-amber-50' }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${item.color}`}>
                    {item.value}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">{item.label}</span>
                </div>
              ))}
              
              {/* Storage metric */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between items-center text-[11px] font-semibold">
                  <span className="text-slate-500 flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Almacenamiento</span>
                  <span className="text-slate-900 font-bold">{metrics.storageUsed} / {metrics.storageLimit}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${metrics.storagePercent}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left space-y-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2">Acciones rápidas</h3>
            <div className="space-y-2">
              <button 
                onClick={handleOpenUploadWizard}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-xs text-slate-700 hover:text-slate-900 font-bold transition-all"
              >
                <Upload className="w-4 h-4 text-slate-400" /> Subir nueva edición
              </button>
              <button 
                onClick={() => setCollectionFilter('TODAS')}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-xs text-slate-700 hover:text-slate-900 font-bold transition-all"
              >
                <BookCopy className="w-4 h-4 text-slate-400" /> Gestionar publicaciones
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-xs text-slate-700 hover:text-slate-900 font-bold transition-all">
                <MessageSquare className="w-4 h-4 text-slate-400" /> Enviar notificación
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-xs text-slate-700 hover:text-slate-900 font-bold transition-all">
                <BarChart className="w-4 h-4 text-slate-400" /> Ver informes
              </button>
            </div>
          </div>

          {/* Need help banner */}
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 shadow-sm text-left">
            <h4 className="text-xs font-black text-slate-900 mb-1.5 leading-snug flex items-center gap-1.5"><HelpCircle className="w-4 h-4 text-emerald-600" /> ¿Necesitas ayuda?</h4>
            <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mb-3">
              Consulta nuestra guía detallada para subir y publicar ediciones correctamente de acuerdo a los límites de tu plan.
            </p>
            <button className="text-[10px] font-bold text-brand-700 hover:underline uppercase tracking-wide">Ver guía e instrucciones</button>
          </div>

        </div>

      </div>

      {/* SCHEDULE MODAL */}
      {showScheduleModal && selectedEdition && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-900">Programar publicación</h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Elige fecha y hora para publicar la Edición #{getDisplayCode(selectedEdition.codigo)}</p>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Fecha y Hora</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduleDatetime}
                  onChange={(e) => setScheduleDatetime(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all text-center shadow-md shadow-brand-500/10"
                >
                  Programar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && selectedEdition && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-900">Editar metadatos</h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Actualizar información básica de la Edición #{getDisplayCode(selectedEdition.codigo)}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Título</label>
                <input
                  type="text"
                  required
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Código</label>
                  <input
                    type="text"
                    required
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Fecha de Registro</label>
                  <input
                    type="date"
                    required
                    readOnly
                    value={formFechaEdicion}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none"
                  />
                </div>
              </div>



              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all text-center shadow-md shadow-brand-500/10"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WIZARD MODAL (Upload new edition) */}
      {showUploadWizard && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            
            {/* Wizard Header */}
            <div className="bg-slate-50 border-b p-5 flex justify-between items-center text-left">
              <div>
                <h3 className="text-base font-black text-slate-900">Subir nueva edición</h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Paso {wizardStep} de 4: {
                  wizardStep === 1 ? 'Información básica' :
                  wizardStep === 2 ? 'Subir archivo PDF' :
                  wizardStep === 3 ? 'Configurar publicación' : 'Éxito'
                }</p>
              </div>
              {wizardStep < 4 && (
                <button onClick={closeWizard} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
              )}
            </div>

            {/* Error Box */}
            {wizardError && (
              <div className="p-4 bg-red-50 border-b border-red-100 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{wizardError}</span>
              </div>
            )}

            {/* Wizard Body */}
            <div className="p-6">
              
              {/* STEP 1: Metadata Form */}
              {wizardStep === 1 && (
                <form onSubmit={handleStep1Submit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Colección / Tipo</label>
                      <select
                        value={formCollectionType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormCollectionType(val);
                          fetchNextCode(val);
                        }}
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                      >
                        <option value="PERIÓDICO">Periódicos</option>
                        <option value="REVISTA">Revistas</option>
                        <option value="CÓMIC">Cómics</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Código de Edición (Autogenerado)</label>
                      <input
                        type="text"
                        required
                        readOnly
                        value={formCodigo ? `${formCollectionType === 'PERIÓDICO' ? 'PER-' : (formCollectionType === 'REVISTA' ? 'REV-' : 'COM-')}${formCodigo}` : 'Cargando...'}
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Título de Edición</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Edición Especial de Mayo"
                      value={formTitulo}
                      onChange={(e) => setFormTitulo(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Fecha de Registro</label>
                      <input
                        type="date"
                        required
                        readOnly
                        value={formFechaEdicion}
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Modalidad</label>
                      <select
                        value={formModalidad}
                        onChange={(e) => setFormModalidad(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                      >
                        <option value="PAGO">De Pago (Monetizada)</option>
                        <option value="GRATUITA">Gratuita</option>
                      </select>
                    </div>
                  </div>



                  {/* Sample Pages configuration */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formPermiteMuestra}
                        onChange={(e) => setFormPermiteMuestra(e.target.checked)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Habilitar páginas de muestra gratis</span>
                    </label>
                    
                    {formPermiteMuestra && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Cantidad de páginas de muestra</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={formPaginasMuestra}
                          onChange={(e) => setFormPaginasMuestra(e.target.value)}
                          className="w-24 border border-slate-200 rounded-lg p-1.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-white text-slate-800"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Descripción corta</label>
                    <input
                      type="text"
                      placeholder="Resumen para la landing..."
                      value={formDescripcionCorta}
                      onChange={(e) => setFormDescripcionCorta(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={wizardLoading}
                    className="w-full py-3 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all text-center flex items-center justify-center gap-2"
                  >
                    {wizardLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>Continuar <ArrowRightSubstitute /></>
                    )}
                  </button>
                </form>
              )}

              {/* STEP 2: PDF File Upload */}
              {wizardStep === 2 && (
                <form onSubmit={handleStep2Submit} className="space-y-6">
                  <div className={`text-center p-8 border-2 border-dashed rounded-2xl transition-all duration-300 relative flex flex-col items-center justify-center group ${
                    pdfFile 
                      ? 'border-brand-500 bg-brand-50/20 shadow-inner' 
                      : 'border-slate-200 bg-slate-50/50 hover:border-brand-400 hover:bg-slate-50'
                  }`}>
                    
                    {/* Dynamic Newspaper/File Illustration */}
                    {!pdfFile ? (
                      <div className="relative mb-4 flex items-center justify-center h-20 w-32">
                        {/* Beautiful stacked newspaper effect */}
                        <div className="absolute w-12 h-16 bg-slate-100 border border-slate-200 rounded shadow p-1.5 flex flex-col gap-1 -rotate-6 -translate-x-3 opacity-60 transition-transform duration-300 group-hover:-rotate-12 group-hover:-translate-x-5">
                          <div className="h-1 bg-slate-300 rounded-xs w-2/3"></div>
                          <div className="h-3 bg-slate-200 rounded-xs w-full"></div>
                          <div className="h-0.5 bg-slate-300 rounded-xs w-full"></div>
                          <div className="h-0.5 bg-slate-300 rounded-xs w-5/6"></div>
                        </div>
                        <div className="absolute w-12 h-16 bg-white border border-slate-300 rounded shadow-md p-1.5 flex flex-col gap-1 z-10 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
                          {/* Mini Header */}
                          <div className="flex justify-between items-center border-b border-slate-300 pb-0.5 mb-0.5">
                            <span className="text-[5px] font-black text-slate-800 tracking-tighter">EL DIARIO</span>
                            <span className="text-[3px] text-slate-400 font-extrabold">PDF</span>
                          </div>
                          {/* Mock Image and lines */}
                          <div className="grid grid-cols-3 gap-0.5 flex-1">
                            <div className="col-span-1 bg-slate-100 rounded border border-slate-200/50 flex items-center justify-center">
                              <span className="text-[6px] text-slate-400 select-none">📰</span>
                            </div>
                            <div className="col-span-2 flex flex-col gap-0.5 pt-0.5">
                              <div className="h-0.5 bg-slate-300 rounded-xs w-full"></div>
                              <div className="h-0.5 bg-slate-300 rounded-xs w-5/6"></div>
                              <div className="h-0.5 bg-slate-200 rounded-xs w-full"></div>
                            </div>
                          </div>
                          <div className="h-0.5 bg-slate-200 rounded-xs w-full"></div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative mb-4 flex items-center justify-center animate-in zoom-in-95 duration-300">
                        {/* Uploaded File Graphic */}
                        <div className="w-14 h-18 bg-white border-2 border-brand-500 rounded-xl shadow-lg p-2 flex flex-col gap-1 justify-between relative transition-transform duration-300 hover:scale-105">
                          {/* PDF Top Badge */}
                          <div className="flex justify-between items-start">
                            <div className="bg-brand-500 text-[6px] font-extrabold text-white px-1 py-0.5 rounded-sm">PDF</div>
                            <div className="w-3.5 h-3.5 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm">
                              <CheckCircle className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          </div>
                          {/* File Icon */}
                          <div className="flex-1 flex items-center justify-center">
                            <FileText className="w-7 h-7 text-brand-600 animate-bounce" />
                          </div>
                          {/* Text mock lines */}
                          <div className="space-y-0.5">
                            <div className="h-0.5 bg-slate-200 rounded-xs w-full"></div>
                            <div className="h-0.5 bg-slate-200 rounded-xs w-2/3"></div>
                          </div>
                        </div>
                      </div>
                    )}

                    <span className="text-xs font-bold text-slate-700 block mb-1">
                      {pdfFile ? pdfFile.name : "Selecciona tu archivo PDF"}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold block mb-4">
                      {pdfFile ? `${(pdfFile.size / (1024 * 1024)).toFixed(1)} MB` : `Límite por plan: ${planLimits?.plan?.limite_pdf_mb || 50} MB`}
                    </span>
                    
                    <input
                      type="file"
                      accept=".pdf"
                      required
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    
                    {!pdfFile ? (
                      <button
                        type="button"
                        className="py-1.5 px-4 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                      >
                        Buscar archivo
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="py-1 px-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-[9px] font-bold text-slate-500 shadow-sm transition-all z-20 pointer-events-none"
                      >
                        Arrastra o haz clic para cambiar
                      </button>
                    )}
                  </div>

                  {/* Imagen de Portada (Opcional) */}
                  <div className="space-y-2 text-left bg-slate-50/50 p-4 border border-slate-200/60 rounded-2xl">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Imagen de Portada (Opcional)</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-20 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                        {coverFile ? (
                          <img src={URL.createObjectURL(coverFile)} className="w-full h-full object-cover" alt="Portada" />
                        ) : (
                          <span className="text-xl">🖼️</span>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-[11px] font-bold text-slate-700 block">
                          {coverFile ? coverFile.name : "Subir portada personalizada"}
                        </span>
                        <p className="text-[9px] text-slate-400 font-semibold leading-normal">
                          Si dejas esto vacío, el sistema generará automáticamente la portada extrayendo la primera página del PDF.
                        </p>
                        <div className="relative inline-block mt-1">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (!file.type.startsWith('image/')) {
                                  setWizardError("El archivo debe ser una imagen válida.");
                                  setCoverFile(null);
                                  return;
                                }
                                setCoverFile(file);
                                setWizardError('');
                              }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <button
                            type="button"
                            className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
                          >
                            Seleccionar imagen
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {uploadProgress > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-500 font-bold">Subiendo PDF y Portada...</span>
                        <span className="text-brand-700">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="bg-brand-500 h-1.5 rounded-full transition-all duration-150" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all text-center"
                    >
                      Atrás
                    </button>
                    <button
                      type="submit"
                      disabled={!pdfFile || wizardLoading}
                      className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all text-center flex items-center justify-center gap-2 shadow-md shadow-brand-500/10"
                    >
                      {wizardLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>Subir PDF <ArrowRightSubstitute /></>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: Visibility Setting */}
              {wizardStep === 3 && (
                <div className="space-y-6 text-left">
                  <div className="text-center text-xs text-slate-500 font-semibold mb-4 leading-relaxed">
                    El PDF se ha subido correctamente y se está procesando en segundo plano. ¿Cuál es el estado de visibilidad inicial?
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {/* Opción 1: Borrador */}
                    <button
                      onClick={() => handleStep3Submit('draft')}
                      className="w-full p-4 border border-slate-200 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all flex items-start gap-4 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center flex-shrink-0"><Lock className="w-4 h-4" /></div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 mb-0.5">Guardar como Borrador (Privado)</h4>
                        <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">La edición permanecerá oculta para tus lectores hasta que decidas publicarla de manera manual.</p>
                      </div>
                    </button>

                    {/* Opción 2: Publicar */}
                    <button
                      onClick={() => handleStep3Submit('publish')}
                      className="w-full p-4 border border-slate-200 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all flex items-start gap-4 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center flex-shrink-0"><Globe className="w-4 h-4" /></div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 mb-0.5">Publicar inmediatamente</h4>
                        <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">Se publicará de forma automática una vez que finalice el procesamiento de las páginas.</p>
                      </div>
                    </button>

                    {/* Opción 3: Programar */}
                    <div className="w-full p-4 border border-slate-200 rounded-2xl space-y-4">
                      <div className="flex items-start gap-4 text-left">
                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0"><Calendar className="w-4 h-4" /></div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 mb-0.5">Programar publicación</h4>
                          <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">Indica una fecha y hora específicas. Se habilitará para tus usuarios en ese momento exacto.</p>
                        </div>
                      </div>
                      <div className="pl-12 flex gap-2">
                        <input
                          type="datetime-local"
                          value={scheduleDatetime}
                          onChange={(e) => setScheduleDatetime(e.target.value)}
                          className="border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-none focus:border-brand-500 bg-slate-50 text-slate-800 flex-grow"
                        />
                        <button
                          onClick={() => handleStep3Submit('schedule')}
                          disabled={!scheduleDatetime}
                          className="px-4 py-2 bg-brand-600 text-white rounded-xl text-[11px] font-bold hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                          Programar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Success Screen */}
              {wizardStep === 4 && (
                <div className="text-center py-6 space-y-5">
                  <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
                  <div>
                    <h4 className="text-base font-black text-slate-900">¡Edición cargada con éxito!</h4>
                    <p className="text-xs text-slate-500 font-semibold max-w-sm mx-auto mt-2 leading-relaxed">
                      La edición se ha registrado en el sistema. El procesamiento de páginas PDF a imágenes de lectura se está ejecutando en segundo plano.
                    </p>
                  </div>
                  <button
                    onClick={closeWizard}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all text-center shadow-md shadow-brand-500/10"
                  >
                    Volver a la lista
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Subscriber Distribution Modal */}
      {showDistributionModal && selectedDistributionEdition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">Distribución de la Edición #{getDisplayCode(selectedDistributionEdition.codigo)}</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">{selectedDistributionEdition.titulo}</p>
              </div>
              <button 
                onClick={() => {
                  setShowDistributionModal(false);
                  setSelectedDistributionEdition(null);
                  setDistributionList([]);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-left">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Suscriptores</span>
                  <h4 className="text-xl font-black text-slate-900 mt-1">{distributionList.length}</h4>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-left">
                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Enviados</span>
                  <h4 className="text-xl font-black text-emerald-700 mt-1">
                    {distributionList.filter(n => n.estado === 'ENVIADA').length}
                  </h4>
                </div>
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-left">
                  <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Fallidos</span>
                  <h4 className="text-xl font-black text-red-700 mt-1">
                    {distributionList.filter(n => n.estado === 'FALLIDA').length}
                  </h4>
                </div>
              </div>

              {/* Status List */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  {isLoadingDistribution ? (
                    <div className="py-16 text-center flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Obteniendo estado de entregas...</span>
                    </div>
                  ) : distributionList.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 font-semibold text-xs leading-relaxed max-w-sm mx-auto">
                      Ninguna entrega registrada aún. Haz clic en "Reintentar distribución" para lanzar el envío a todos los suscriptores activos.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/75 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="px-4 py-2.5">Usuario / Correo</th>
                          <th className="px-4 py-2.5">Estado</th>
                          <th className="px-4 py-2.5">Fecha y Hora</th>
                          <th className="px-4 py-2.5">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-medium text-slate-700">
                        {distributionList.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-slate-900">{item.usuario.nombres} {item.usuario.apellidos}</span>
                                <span className="text-[9px] text-slate-400 font-semibold mt-0.5">{item.usuario.correo}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {item.estado === 'ENVIADA' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                  <CheckCircle className="w-3.5 h-3.5" /> Enviado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Fallido
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400 font-semibold">
                              {item.fecha_envio ? new Date(item.fecha_envio).toLocaleString('es-PE') : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-[10px] text-slate-400 font-bold max-w-[200px] truncate" title={item.mensaje_error || ''}>
                              {item.mensaje_error || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDistributionModal(false);
                  setSelectedDistributionEdition(null);
                  setDistributionList([]);
                }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors shadow-sm"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => handleRetryDistribution(selectedDistributionEdition.id)}
                disabled={isRetryingDistribution || isLoadingDistribution}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-colors flex items-center gap-2 shadow-md shadow-brand-500/10 disabled:opacity-60"
              >
                {isRetryingDistribution ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Encolando...
                  </>
                ) : (
                  'Reintentar Distribución'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Subcomponent to match layout arrows without importing extra icons
const ArrowRightSubstitute: React.FC = () => (
  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default Editions;
