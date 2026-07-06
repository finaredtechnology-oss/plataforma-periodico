import React, { useState, useEffect } from 'react';
import { Save, Image as ImageIcon, Loader2, Sparkles, AlertCircle, Upload, Globe, AlignVerticalSpaceAround } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

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

const LandingConfig: React.FC = () => {
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [heroBackgroundUrl, setHeroBackgroundUrl] = useState('');
  const [heroBackgroundPosition, setHeroBackgroundPosition] = useState('center');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [imageError, setImageError] = useState(false);

  // Fetch current config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const response = await api.get('/configuration/landing/');
        if (response.data) {
          setHeroTitle(response.data.hero_title || '');
          setHeroSubtitle(response.data.hero_subtitle || '');
          setHeroBackgroundUrl(response.data.hero_background_url || '');
          setHeroBackgroundPosition(response.data.hero_background_position || 'center');
          
          if (response.data.hero_background_url && !response.data.hero_background_url.startsWith('http')) {
            setImageMode('upload');
          } else {
            setImageMode('url');
          }
        }
      } catch (err) {
        console.error('Error fetching landing config:', err);
        toast.error('No se pudo cargar la configuración de la portada.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setLocalPreviewUrl(objectUrl);
      toast.success(`Imagen "${file.name}" seleccionada localmente.`);
    }
  };

  const getBackgroundSource = () => {
    if (imageMode === 'upload' && localPreviewUrl) {
      return localPreviewUrl;
    }
    return getFullImageUrl(heroBackgroundUrl);
  };

  const bgSource = getBackgroundSource();

  // Reset image error state when background source changes
  useEffect(() => {
    setImageError(false);
  }, [bgSource]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heroTitle.trim()) {
      toast.error('El título de portada es obligatorio.');
      return;
    }
    if (!heroSubtitle.trim()) {
      toast.error('El subtítulo o descripción es obligatorio.');
      return;
    }
    
    if (imageMode === 'url' && !heroBackgroundUrl.trim()) {
      toast.error('La URL de la imagen de fondo es obligatoria.');
      return;
    }
    if (imageMode === 'upload' && !selectedFile && !heroBackgroundUrl) {
      toast.error('Por favor, selecciona una imagen para subir.');
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('hero_title', heroTitle.trim());
      formData.append('hero_subtitle', heroSubtitle.trim());
      formData.append('hero_background_position', heroBackgroundPosition);
      
      if (imageMode === 'upload' && selectedFile) {
        formData.append('hero_background_file', selectedFile);
      } else {
        formData.append('hero_background_url', heroBackgroundUrl.trim());
      }

      const response = await api.put('/configuration/landing/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (response.data) {
        toast.success('¡Portada guardada correctamente! Los cambios ya están en vivo.');
        setSelectedFile(null);
        setLocalPreviewUrl(null);
        setHeroBackgroundUrl(response.data.hero_background_url);
        setHeroBackgroundPosition(response.data.hero_background_position);
      }
    } catch (err: any) {
      console.error('Error saving landing config:', err);
      const msg = err.response?.data?.detail || 'Error al guardar la configuración.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const renderPreviewTitle = (title: string) => {
    if (!title) return 'Escribe un título';
    const targetPhrase = "conecta nuestra región";
    const exactIndex = title.toLowerCase().indexOf(targetPhrase.toLowerCase());
    if (exactIndex !== -1) {
      return (
        <>
          {title.substring(0, exactIndex)}
          <span className="text-[#ea580c]">
            {title.substring(exactIndex, exactIndex + targetPhrase.length)}
          </span>
          {title.substring(exactIndex + targetPhrase.length)}
        </>
      );
    }
    
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

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center py-20 gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-[#1a4d2e]" />
        <span className="text-sm font-bold text-slate-500">Cargando configuración de portada...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <Sparkles className="text-[#ea580c] w-6 h-6 animate-pulse" />
          Gestión de Portada (Hero)
        </h1>
        <p className="text-xs text-slate-500 font-bold mt-1">
          Modifica el encabezado, subtítulo, imagen de fondo y su alineación en la Landing Page.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form Container */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          <form onSubmit={handleSave} className="space-y-5">
            {/* Hero Title */}
            <div className="space-y-1.5">
              <label htmlFor="heroTitle" className="text-xs font-black uppercase text-slate-500 block">
                Título Principal
              </label>
              <textarea
                id="heroTitle"
                rows={2}
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                placeholder="Escribe el título de portada..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all placeholder:text-slate-400"
              />
              <div className="flex items-start gap-1.5 text-[10px] text-slate-400 font-bold leading-normal bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                <AlertCircle className="w-4.5 h-4.5 text-orange-500 flex-shrink-0" />
                <span>
                  <strong>Formato Inteligente:</strong> Si escribes una frase larga, el sistema la dividirá en dos automáticamente pintando la segunda parte de naranja para crear contraste.
                </span>
              </div>
            </div>

            {/* Hero Subtitle */}
            <div className="space-y-1.5">
              <label htmlFor="heroSubtitle" className="text-xs font-black uppercase text-slate-500 block">
                Subtítulo / Bajada
              </label>
              <textarea
                id="heroSubtitle"
                rows={2}
                value={heroSubtitle}
                onChange={(e) => setHeroSubtitle(e.target.value)}
                placeholder="Escribe la descripción de portada..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Alignment selector */}
            <div className="space-y-1.5">
              <label htmlFor="heroPosition" className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                <AlignVerticalSpaceAround size={14} className="text-slate-400" />
                Alineación Vertical del Fondo
              </label>
              <select
                id="heroPosition"
                value={heroBackgroundPosition}
                onChange={(e) => setHeroBackgroundPosition(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all cursor-pointer"
              >
                <option value="center">Centrado (Center)</option>
                <option value="top">Alineado Arriba (Top)</option>
                <option value="bottom">Alineado Abajo (Bottom)</option>
              </select>
              <span className="text-[10px] text-slate-400 font-bold block mt-1">
                Alinea la imagen verticalmente para enfocar el área de interés y evitar que se corte el sujeto principal.
              </span>
            </div>

            {/* Background Selector Tab */}
            <div className="space-y-3">
              <label className="text-xs font-black uppercase text-slate-500 block">
                Imagen de Fondo
              </label>
              
              {/* Tab Selector */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setImageMode('upload')}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    imageMode === 'upload' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Upload size={14} />
                  Subir desde PC
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('url')}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    imageMode === 'url' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Globe size={14} />
                  Imagen por URL
                </button>
              </div>

              {/* Upload Input */}
              {imageMode === 'upload' ? (
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-slate-200 hover:border-slate-350 transition-colors rounded-xl p-4 flex flex-col items-center justify-center bg-slate-50 relative cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-slate-400 group-hover:text-slate-650 transition-colors mb-2" />
                    <span className="text-[10px] font-black text-slate-550 uppercase tracking-wider">
                      {selectedFile ? 'Cambiar Imagen de PC' : 'Seleccionar Imagen'}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold mt-1">
                      {selectedFile ? selectedFile.name : 'PNG, JPG, JPEG hasta 5MB'}
                    </span>
                  </div>
                  {heroBackgroundUrl && !selectedFile && (
                    <div className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Actualmente usando imagen del sistema</span>
                    </div>
                  )}
                </div>
              ) : (
                /* URL Input */
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                  <input
                    type="url"
                    value={heroBackgroundUrl}
                    onChange={(e) => setHeroBackgroundUrl(e.target.value)}
                    placeholder="https://ejemplo.com/paisaje.jpg"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all placeholder:text-slate-400"
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-[#1a4d2e] hover:bg-[#153e25] text-white py-3 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shadow-sm active:scale-[0.99]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Guardando Cambios...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar Portada
                </>
              )}
            </button>
          </form>
        </div>

        {/* Live Preview Container */}
        <div className="lg:col-span-2 space-y-4">
          <span className="text-xs font-black uppercase text-slate-500 block">
            Previsualización en Vivo
          </span>
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 shadow-md">
            {bgSource ? (
              <img
                src={imageError ? 'https://images.unsplash.com/photo-1599582964755-971498d2b4a0?q=80&w=600' : bgSource}
                alt="Vista previa fondo real"
                className={`w-full h-full object-cover ${getPositionClass(heroBackgroundPosition)} pointer-events-none`}
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-850">
                <ImageIcon className="w-8 h-8 opacity-50" />
                <span className="text-[10px] font-bold">Sin imagen cargada</span>
              </div>
            )}
            
            {/* Overlaid mock text */}
            <div className="absolute inset-0 p-4 flex flex-col justify-end text-white z-20">
              <h2 className="text-xs sm:text-sm font-black leading-tight text-left drop-shadow-md">
                {renderPreviewTitle(heroTitle)}
              </h2>
              <p className="text-[9px] text-slate-200 mt-1 leading-snug text-left truncate-3-lines font-semibold drop-shadow-sm whitespace-pre-line">
                {heroSubtitle || 'Escribe una descripción'}
              </p>
              
              {/* Buttons mockup */}
              <div className="flex gap-1.5 mt-3">
                <div className="px-2 py-1 bg-[#1a4d2e] text-[8px] font-bold rounded text-white select-none">
                  Leer edición
                </div>
                <div className="px-2 py-1 bg-white text-slate-800 text-[8px] font-bold rounded select-none">
                  Ver planes
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingConfig;
