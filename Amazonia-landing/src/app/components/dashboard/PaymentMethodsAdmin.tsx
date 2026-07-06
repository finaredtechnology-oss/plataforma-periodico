import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Plus, Pencil, Trash2, X, Eye, 
  Copy, Check, Landmark, QrCode, Upload, Loader2, AlertCircle
} from 'lucide-react';
import api from '../../services/api';
import { toast } from 'sonner';

interface PaymentMethod {
  id: number;
  nombre: string;
  numero: string;
  qr: string | null;
  estado: string;
  created_at: string;
  updated_at: string;
}

// Inline SVGs for Yape & Plin
const YapeLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="#74227E" />
    <path d="M30 65C32 50 40 32 52 32C65 32 70 42 70 52C70 65 58 72 45 72C38 72 32 68 30 65Z" fill="#00D2C4" />
    <path d="M42 42C44 38 48 35 52 35C57 35 60 38 60 42C60 47 55 52 48 56" stroke="white" strokeWidth="6" strokeLinecap="round" />
    <circle cx="48" cy="65" r="4" fill="white" />
  </svg>
);

const PlinLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="#00B1C9" />
    <path d="M32 30H68V38H54V70H46V38H32V30Z" fill="white" />
    <circle cx="62" cy="62" r="8" fill="#FF7900" />
  </svg>
);

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

const PaymentMethodsAdmin: React.FC = () => {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('Yape');
  const [formNumber, setFormNumber] = useState('');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formCCI, setFormCCI] = useState('');
  const [formStatus, setFormStatus] = useState('ACTIVO');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [clearQr, setClearQr] = useState(false);

  // Actions states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMethods = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/admin/payments-methods/');
      setMethods(response.data || []);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Error al obtener los métodos de pago.';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  useEffect(() => {
    if (formName === 'Yape' || formName === 'Plin') {
      setFormNumber(prev => prev.replace(/\D/g, '').slice(0, 9));
    }
  }, [formName]);

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('¡Copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // File change handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        toast.error('Por favor, selecciona una imagen en formato JPG o PNG.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('El tamaño de la imagen no debe superar los 5MB.');
        return;
      }
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setClearQr(false);
    }
  };

  // Open modal for adding
  const handleOpenAdd = () => {
    setSelectedMethod(null);
    setFormName('Yape');
    setFormNumber('');
    setFormAccountNumber('');
    setFormCCI('');
    setFormStatus('ACTIVO');
    setSelectedFile(null);
    setFilePreview(null);
    setClearQr(false);
    setShowFormModal(true);
  };

  // Open modal for editing
  const handleOpenEdit = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setFormName(method.nombre);
    setFormNumber(method.numero);

    // Split account number and CCI for Cuenta bancaria
    if (method.nombre.toLowerCase().includes('banco') || method.nombre.toLowerCase().includes('cuenta')) {
      if (method.numero.includes(' | CCI: ')) {
        const [accNum, cci] = method.numero.split(' | CCI: ');
        setFormAccountNumber(accNum);
        setFormCCI(cci);
      } else {
        setFormAccountNumber(method.numero);
        setFormCCI('');
      }
    } else {
      setFormAccountNumber('');
      setFormCCI('');
    }

    setFormStatus(method.estado);
    setSelectedFile(null);
    setFilePreview(method.qr ? getFullImageUrl(method.qr) : null);
    setClearQr(false);
    setShowFormModal(true);
  };

  // Open modal for deleting
  const handleOpenDelete = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setShowDeleteModal(true);
  };

  // Submit Handler (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalNumber = formNumber.trim();
    if (formName === 'Cuenta bancaria') {
      if (!formAccountNumber.trim() || !formCCI.trim()) {
        toast.error('El número de cuenta y el CCI son requeridos para Cuenta bancaria.');
        return;
      }
      finalNumber = `${formAccountNumber.trim()} | CCI: ${formCCI.trim()}`;
    } else {
      if (!finalNumber) {
        toast.error('El número o referencia es requerido.');
        return;
      }
      if ((formName === 'Yape' || formName === 'Plin') && !/^\d{9}$/.test(finalNumber)) {
        toast.error('El número de celular para Yape o Plin debe tener exactamente 9 dígitos numéricos.');
        return;
      }
    }

    if (formName === 'QR' && !filePreview && !selectedFile) {
      toast.error('Para el método QR es obligatorio subir una imagen.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('pm_name', formName);
      formData.append('pm_number', finalNumber);
      formData.append('pm_status', formStatus);
      if (selectedFile) {
        formData.append('pm_qr', selectedFile);
      }
      if (selectedMethod) {
        formData.append('clear_qr', clearQr ? 'true' : 'false');
      }

      if (selectedMethod) {
        // Edit flow
        await api.put(`/admin/payments-methods/${selectedMethod.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Método de pago actualizado exitosamente.');
      } else {
        // Create flow
        await api.post('/admin/payments-methods/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Método de pago registrado exitosamente.');
      }

      setShowFormModal(false);
      fetchMethods();
    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail || 'Ocurrió un error al guardar el método de pago.';
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Handler
  const handleDelete = async () => {
    if (!selectedMethod) return;
    setIsDeleting(true);
    try {
      await api.delete(`/admin/payments-methods/${selectedMethod.id}/`);
      toast.success('Método de pago eliminado exitosamente.');
      setShowDeleteModal(false);
      fetchMethods();
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Error al eliminar el método de pago.';
      toast.error(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const getMethodIcon = (name: string) => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('yape')) return <YapeLogo className="w-6 h-6" />;
    if (nameLower.includes('plin')) return <PlinLogo className="w-6 h-6" />;
    if (nameLower.includes('banco') || nameLower.includes('cuenta')) return <Landmark className="w-5 h-5 text-slate-600" />;
    return <QrCode className="w-5 h-5 text-slate-600" />;
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 text-left max-w-7xl mx-auto">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">Métodos de Pago</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-1">
            Gestiona los métodos de pago que se muestran en el flujo de suscripción pública.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0D957A] hover:bg-[#0b8068] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus size={16} /> Agregar nuevo método
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-[#0D957A] animate-spin" />
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cargando métodos de pago...</span>
        </div>
      ) : methods.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-700">No hay métodos de pago registrados</h4>
          <p className="text-xs text-slate-400 font-semibold max-w-xs mx-auto mt-1">
            Registra métodos de pago activos para que los usuarios puedan adquirir las ediciones o suscribirse.
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-[#0D957A] hover:bg-[#0b8068] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            <Plus size={14} /> Registrar primer método
          </button>
        </div>
      ) : (
        /* TABLE CONTAINER */
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs font-semibold text-slate-700">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 uppercase text-[9px] font-black tracking-wider text-slate-400 select-none">
                  <th className="py-4 px-6">Método de Pago</th>
                  <th className="py-4 px-6">Número / Referencia</th>
                  <th className="py-4 px-6 text-center">Imagen QR</th>
                  <th className="py-4 px-6 text-center">Estado</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {methods.map((method) => (
                  <tr key={method.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                          {getMethodIcon(method.nombre)}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block">{method.nombre}</span>
                          <span className="text-[9px] text-slate-400 font-medium">Registrado el {new Date(method.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-800 text-xs">{method.numero}</span>
                        <button
                          onClick={() => handleCopy(method.numero, method.id)}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Copiar al portapapeles"
                        >
                          {copiedId === method.id ? <Check size={13} className="text-[#0D957A]" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {method.qr ? (
                        <div className="inline-flex items-center justify-center gap-2 group">
                          <div className="w-10 h-10 border border-slate-100 rounded-lg overflow-hidden bg-white shadow-sm flex items-center justify-center relative">
                            <img src={getFullImageUrl(method.qr) || ''} alt="QR code" className="w-full h-full object-cover" />
                          </div>
                          <button
                            onClick={() => setZoomImageUrl(getFullImageUrl(method.qr))}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
                            title="Ver en grande"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-350 italic font-normal text-[10px]">No aplica</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                        method.estado === 'ACTIVO' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                          : 'bg-rose-50 text-rose-700 border-rose-250'
                      }`}>
                        {method.estado === 'ACTIVO' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        {method.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(method)}
                          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all cursor-pointer"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(method)}
                          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FORM MODAL (Add / Edit) */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-900 text-sm">
                  {selectedMethod ? 'Editar método de pago' : 'Agregar nuevo método de pago'}
                </h3>
                <p className="text-[10px] text-slate-400 font-semibold">Completa los campos obligatorios.</p>
              </div>
              <button 
                onClick={() => setShowFormModal(false)}
                className="p-1 rounded-lg hover:bg-slate-150 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold text-slate-600">
              {/* Type selector */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo de método</label>
                <select
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0D957A] focus:bg-white transition-all text-slate-800 font-bold"
                >
                  <option value="Yape">Yape</option>
                  <option value="Plin">Plin</option>
                  <option value="Cuenta bancaria">Cuenta bancaria</option>
                  <option value="QR">QR de pago</option>
                </select>
              </div>

              {/* Number / reference */}
              {formName === 'Cuenta bancaria' ? (
                <>
                  <div className="space-y-1 text-left animate-in fade-in duration-150">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Número de Cuenta Corriente / Ahorros</label>
                    <input
                      type="text"
                      value={formAccountNumber}
                      onChange={(e) => setFormAccountNumber(e.target.value)}
                      placeholder="Ej. 193-4567890-0-12"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0D957A] focus:bg-white transition-all text-slate-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1 text-left animate-in fade-in duration-150">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código de Cuenta Interbancaria (CCI)</label>
                    <input
                      type="text"
                      value={formCCI}
                      onChange={(e) => setFormCCI(e.target.value)}
                      placeholder="Ej. 002-19300456789001214"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0D957A] focus:bg-white transition-all text-slate-800 font-bold"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Número de Cuenta / Celular o Referencia</label>
                  <input
                    type="text"
                    value={formNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (formName === 'Yape' || formName === 'Plin') {
                        const cleaned = val.replace(/\D/g, '').slice(0, 9);
                        setFormNumber(cleaned);
                      } else {
                        setFormNumber(val);
                      }
                    }}
                    placeholder={formName === 'QR' ? 'Ej. Referencia de pago QR' : 'Ej. 987654321'}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0D957A] focus:bg-white transition-all text-slate-800 font-bold"
                  />
                </div>
              )}

              {/* QR Image Uploader */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Código QR {formName === 'QR' && <span className="text-red-500 font-black">* Requerido</span>}
                </label>
                
                <div className="relative border border-dashed border-slate-250 hover:border-[#0D957A] bg-slate-50/50 hover:bg-slate-50 rounded-xl p-4 transition-all flex flex-col items-center justify-center text-center">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  
                  {filePreview ? (
                    <div className="space-y-2 z-20 flex flex-col items-center">
                      <div className="w-16 h-16 border border-slate-200 rounded overflow-hidden bg-white shadow-sm flex items-center justify-center">
                        <img src={filePreview} alt="QR Preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="text-[9px] text-slate-500 font-bold">
                        {selectedFile ? `${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)` : 'Código QR asignado'}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedFile(null); setFilePreview(null); setClearQr(true); }}
                        className="relative z-20 text-[9px] font-bold text-rose-600 hover:underline uppercase tracking-wide cursor-pointer"
                      >
                        Quitar código QR
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-[#0D957A] shadow-sm mx-auto">
                        <Upload size={14} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-800">
                          Arrastra tu imagen QR aquí o <span className="text-[#ea580c] hover:underline">haz clic para buscar</span>
                        </p>
                        <p className="text-[8px] text-slate-400 font-bold mt-0.5">JPG, JPEG o PNG (Máx. 5MB)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="text-left">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Estado del método</label>
                  <span className="text-[10px] text-slate-400 font-semibold">Indica si se mostrará a los usuarios en la pasarela de suscripción.</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormStatus(formStatus === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formStatus === 'ACTIVO' ? 'bg-[#0D957A]' : 'bg-slate-250'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        formStatus === 'ACTIVO' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-bold text-slate-700 w-12 text-left uppercase tracking-wide">
                    {formStatus === 'ACTIVO' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 font-bold transition-all text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#0D957A] hover:bg-[#0b8068] text-white rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-sm text-xs cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 space-y-4 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-red-50 border border-red-100 rounded-full flex items-center justify-center text-red-650 mx-auto shadow-sm">
              <AlertCircle size={24} />
            </div>

            <div className="space-y-1">
              <h3 className="font-black text-slate-900 text-sm">¿Eliminar método de pago?</h3>
              <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                Esta acción eliminará el método <strong>{selectedMethod?.nombre}</strong> ({selectedMethod?.numero}) definitivamente del sistema. No se podrá revertir.
              </p>
            </div>

            <div className="flex justify-center gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 font-bold text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {isDeleting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : 'Eliminar de todas formas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE ZOOM MODAL */}
      {zoomImageUrl && (
        <div 
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-55 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setZoomImageUrl(null)}
        >
          <div className="max-w-md w-full relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setZoomImageUrl(null)}
              className="absolute -top-10 right-0 p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
            <div className="bg-white p-3.5 rounded-3xl shadow-2xl border border-slate-200 flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 select-none">Vista Previa QR</span>
              <img src={zoomImageUrl} alt="Zoom QR" className="w-full aspect-square object-contain rounded-2xl border border-slate-100" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentMethodsAdmin;
