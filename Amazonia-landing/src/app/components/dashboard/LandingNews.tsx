import React, { useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, Loader2, Trash2, Upload, Globe, FileText, Calendar, AlertCircle, Edit3, X } from 'lucide-react';
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

interface LandingNewsItem {
  id: number;
  titulo: string;
  descripcion: string;
  imagen: string;
  fecha_creacion: string;
}

const LandingNews: React.FC = () => {
  const [items, setItems] = useState<LandingNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Edit Mode state
  const [editingItem, setEditingItem] = useState<LandingNewsItem | null>(null);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/public/news-landing/');
      setItems(response.data || []);
    } catch (err) {
      console.error('Error fetching landing news:', err);
      toast.error('No se pudieron cargar las noticias de landing.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast.success(`Imagen "${file.name}" seleccionada.`);
    }
  };

  const handleStartEdit = (item: LandingNewsItem) => {
    setEditingItem(item);
    setTitulo(item.titulo);
    setDescripcion(item.descripcion);
    if (item.imagen && !item.imagen.startsWith('http')) {
      setImageMode('upload');
      setImageUrl('');
    } else {
      setImageMode('url');
      setImageUrl(item.imagen);
    }
    setSelectedFile(null);
    toast.info(`Editando noticia: "${item.titulo}"`);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setTitulo('');
    setDescripcion('');
    setImageUrl('');
    setSelectedFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error('El título es obligatorio.');
      return;
    }
    if (!descripcion.trim()) {
      toast.error('La descripción corta es obligatoria.');
      return;
    }
    if (imageMode === 'url' && !imageUrl.trim()) {
      toast.error('La URL de la imagen es obligatoria.');
      return;
    }
    if (imageMode === 'upload' && !selectedFile && !editingItem) {
      toast.error('Por favor, selecciona una imagen para subir.');
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('titulo', titulo.trim());
      formData.append('descripcion', descripcion.trim());
      
      if (imageMode === 'upload' && selectedFile) {
        formData.append('image', selectedFile);
      } else if (imageMode === 'url') {
        formData.append('image_url', imageUrl.trim());
      }

      if (editingItem) {
        // Edit mode (PUT)
        await api.put(`/public/news-landing/${editingItem.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('¡Noticia actualizada correctamente!');
      } else {
        // Create mode (POST)
        await api.post('/public/news-landing/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('¡Noticia agregada correctamente!');
      }
      
      // Clear and reset form
      handleCancelEdit();
      
      // Refresh list
      fetchItems();
    } catch (err: any) {
      console.error('Error saving news item:', err);
      const msg = err.response?.data?.detail || 'Error al guardar la noticia.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta noticia de la Landing Page?')) {
      return;
    }
    try {
      await api.delete(`/public/news-landing/${id}/`);
      toast.success('Noticia eliminada correctamente.');
      if (editingItem?.id === id) {
        handleCancelEdit();
      }
      fetchItems();
    } catch (err) {
      console.error('Error deleting landing news:', err);
      toast.error('No se pudo eliminar la noticia.');
    }
  };

  const formatCreationDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Reciente';
    }
  };

  return (
    <div className="space-y-6 text-left max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <FileText className="text-[#ea580c] w-6 h-6" />
          Lo que está pasando (Noticias)
        </h1>
        <p className="text-xs text-slate-500 font-bold mt-1">
          Agrega, edita y gestiona las noticias rápidas de la columna derecha de la Landing Page.
        </p>
      </div>

      {/* Info Warning */}
      <div className="flex items-start gap-2.5 text-xs text-slate-500 font-bold leading-normal bg-slate-50 border border-slate-200 rounded-xl p-4">
        <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
        <div>
          <span className="text-slate-800">Límite Automático de Visualización:</span>
          <p className="font-semibold text-slate-400 mt-0.5">
            Puedes agregar todas las noticias que necesites para tu historial. Sin embargo, la Landing Page pública **sólo mostrará de forma automática las últimas 5 noticias más recientes** que hayas creado para mantener un diseño limpio y compacto.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form panel */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4 self-start">
          <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">
            {editingItem ? 'Editar Noticia' : 'Agregar Nueva Noticia'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">Título de Noticia</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Escribe el titular..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all placeholder:text-slate-450"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">Descripción Corta</label>
              <textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Escribe una breve descripción..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all placeholder:text-slate-450"
              />
            </div>

            {/* Image Selector Tab */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500">Imagen de Noticia</label>
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setImageMode('upload')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                    imageMode === 'upload' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Upload size={12} />
                  Subir desde PC
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('url')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                    imageMode === 'url' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Globe size={12} />
                  Imagen por URL
                </button>
              </div>

              {imageMode === 'upload' ? (
                <div className="border-2 border-dashed border-slate-200 hover:border-slate-350 transition-colors rounded-xl p-4 flex flex-col items-center justify-center bg-slate-50 relative cursor-pointer group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-slate-650 transition-colors mb-1.5" />
                  <span className="text-[9px] font-black text-slate-550 uppercase tracking-wider">
                    {selectedFile ? 'Cambiar Imagen' : 'Seleccionar Imagen'}
                  </span>
                  <span className="text-[8px] text-slate-400 font-semibold mt-0.5 truncate max-w-[200px]">
                    {selectedFile ? selectedFile.name : 'PNG o JPG'}
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-3 text-slate-400 w-3.5 h-3.5" />
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://ejemplo.com/noticia.jpg"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all placeholder:text-slate-400"
                  />
                </div>
              )}
              {editingItem && !selectedFile && imageMode === 'upload' && (
                <span className="text-[9px] text-slate-400 font-bold block mt-1">
                  (Manteniendo la imagen de PC actual si no seleccionas otra)
                </span>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              {editingItem && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 flex items-center justify-center gap-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="flex-2 w-full flex items-center justify-center gap-1.5 bg-[#ea580c] hover:bg-[#d44f0a] text-white py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shadow-sm active:scale-[0.99]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    Guardando...
                  </>
                ) : editingItem ? (
                  <>
                    <Edit3 className="w-3.5 h-3.5" />
                    Guardar Cambios
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Agregar Noticia
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Existing List Panel */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">
            Noticias Existentes ({items.length})
          </h2>

          {isLoading ? (
            <div className="flex flex-col justify-center items-center py-20 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-[#1a4d2e]" />
              <span className="text-xs font-semibold text-slate-500">Cargando noticias...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-xs font-bold">
              No hay noticias agregadas todavía. La Landing Page está usando las noticias mock por defecto.
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {items.map((item, index) => {
                const isDisplayedOnLanding = index < 5;
                const isItemBeingEdited = editingItem?.id === item.id;
                return (
                  <div 
                    key={item.id} 
                    className={`p-3 border rounded-xl flex gap-3 relative transition-all ${
                      isItemBeingEdited 
                        ? 'border-orange-500 bg-orange-50/20' 
                        : isDisplayedOnLanding 
                        ? 'border-slate-200 bg-slate-50' 
                        : 'border-slate-100 bg-slate-50 opacity-60'
                    }`}
                  >
                    <img
                      src={getFullImageUrl(item.imagen)}
                      alt={item.titulo}
                      className="w-20 h-16 object-cover rounded flex-shrink-0 bg-slate-200"
                    />
                    <div className="flex-1 text-left min-w-0 pr-14">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold">
                        <span className="text-slate-400 flex items-center gap-0.5">
                          <Calendar size={10} />
                          {formatCreationDate(item.fecha_creacion)}
                        </span>
                        {isDisplayedOnLanding ? (
                          <span className="bg-emerald-50 text-emerald-600 px-1 py-0.2 rounded font-black text-[8px] uppercase tracking-wide">
                            En Landing (Top 5)
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 px-1 py-0.2 rounded font-black text-[8px] uppercase tracking-wide">
                            Archivado
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-black text-slate-800 mt-1 truncate break-words">{item.titulo}</h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-snug line-clamp-2 break-all">
                        {item.descripcion}
                      </p>
                    </div>

                    <div className="absolute right-3 top-3 flex gap-1">
                      <button
                        onClick={() => handleStartEdit(item)}
                        className="text-slate-450 hover:text-slate-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                        title="Editar Noticia"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-red-500 hover:text-red-700 transition-colors p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
                        title="Eliminar Noticia"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LandingNews;
