import React, { useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, Loader2, Trash2, Upload, Globe, Order, ArrowUp, ArrowDown } from 'lucide-react';
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

interface LandingEditionItem {
  id: number;
  imagen: string;
  orden: number;
  fecha_creacion: string;
}

const LandingEditions: React.FC = () => {
  const [items, setItems] = useState<LandingEditionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form states
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [orden, setOrden] = useState('0');

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/public/editions-landing/');
      setItems(response.data || []);
    } catch (err) {
      console.error('Error fetching landing editions:', err);
      toast.error('No se pudieron cargar las ediciones de landing.');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (imageMode === 'url' && !imageUrl.trim()) {
      toast.error('La URL de la imagen es obligatoria.');
      return;
    }
    if (imageMode === 'upload' && !selectedFile) {
      toast.error('Por favor, selecciona un archivo de imagen.');
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('orden', orden);
      if (imageMode === 'upload' && selectedFile) {
        formData.append('image', selectedFile);
      } else {
        formData.append('image_url', imageUrl.trim());
      }

      await api.post('/public/editions-landing/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('¡Edición agregada correctamente a la Landing Page!');
      // Reset form
      setImageUrl('');
      setSelectedFile(null);
      setOrden('0');
      // Refresh list
      fetchItems();
    } catch (err: any) {
      console.error('Error adding landing edition:', err);
      const msg = err.response?.data?.detail || 'Error al guardar la edición.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta edición de la Landing Page?')) {
      return;
    }
    try {
      await api.delete(`/public/editions-landing/${id}/`);
      toast.success('Edición eliminada correctamente.');
      // Refresh list
      fetchItems();
    } catch (err) {
      console.error('Error deleting landing edition:', err);
      toast.error('No se pudo eliminar la edición.');
    }
  };

  return (
    <div className="space-y-6 text-left max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <ImageIcon className="text-[#ea580c] w-6 h-6" />
          Ediciones Landing
        </h1>
        <p className="text-xs text-slate-500 font-bold mt-1">
          Agrega y gestiona las imágenes de portada de las últimas ediciones que se visualizan en la Landing Page pública.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form panel */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4 self-start">
          <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">
            Agregar Nueva Edición
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input Selection Tab */}
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
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500">URL de Imagen</label>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-3 text-slate-400 w-3.5 h-3.5" />
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://ejemplo.com/portada.jpg"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>
            )}

            {/* Order */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">Orden de Visualización</label>
              <input
                type="number"
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-800 transition-all"
              />
              <span className="text-[9px] text-slate-400 font-bold block">
                Números menores se visualizan primero en la grilla.
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-1.5 bg-[#ea580c] hover:bg-[#d44f0a] text-white py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shadow-sm active:scale-[0.99]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  Guardando...
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Edición
                </>
              )}
            </button>
          </form>
        </div>

        {/* Existing Grid Panel */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">
            Ediciones en la Landing Page ({items.length})
          </h2>

          {isLoading ? (
            <div className="flex flex-col justify-center items-center py-20 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-[#1a4d2e]" />
              <span className="text-xs font-semibold text-slate-500">Cargando catálogo...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-xs font-bold">
              No hay imágenes agregadas todavía. La Landing Page está usando las imágenes mock por defecto.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {items.map((item) => (
                <div 
                  key={item.id} 
                  className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 relative group flex flex-col justify-between"
                  style={{ height: '170px' }}
                >
                  <img
                    src={getFullImageUrl(item.imagen)}
                    alt="Edicion"
                    className="w-full flex-1 object-fill pointer-events-none"
                  />
                  <div className="px-2 py-1.5 border-t bg-white flex items-center justify-between text-[10px] font-bold text-slate-500">
                    <span>Orden: {item.orden}</span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-500 hover:text-red-700 transition-colors p-1 rounded hover:bg-red-50 cursor-pointer"
                      title="Eliminar de Landing"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LandingEditions;
