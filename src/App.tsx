import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, RotateCw, Download, FileText, CheckCircle2, 
  ChevronRight, X, Layers, Shrink, ScanText, Plus, Ghost, Scissors, Trash2, Edit, MousePointer2
} from 'lucide-react';
import { PdfWorkspace } from './components/PdfWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';

type Tool = 'rotate' | 'merge' | 'compress' | 'ocr' | 'split' | 'delete' | 'edit';

export default function App() {
  const [activeTool, setActiveTool] = useState<Tool>('edit');
  const [files, setFiles] = useState<File[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitRange, setSplitRange] = useState({ start: 1, end: 1 });
  const [deletePages, setDeletePages] = useState('');
  const [result, setResult] = useState<{
    fileName?: string;
    downloadUrl?: string;
    text?: string;
    stats?: { before: number; after: number; note?: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files) as File[];
      
      // Filter valid PDF or Image files
      const validFiles = selectedFiles.filter(f => 
        f.type === 'application/pdf' || 
        f.type.startsWith('image/')
      );
      
      if (validFiles.length === 0) {
        setError('Please select valid PDF or image files.');
        return;
      }

      if (validFiles.length !== selectedFiles.length) {
        setError('Some files were skipped due to invalid format.');
      } else {
        setError(null);
      }

      // Logic: Merge tool can take multiple files, others take the first valid one
      if (activeTool === 'merge') {
        setFiles(prev => [...prev, ...validFiles]);
      } else {
        setFiles(validFiles.slice(0, 1));
        if (activeTool === 'edit') {
           setIsEditorOpen(true);
        }
      }
      setResult(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processTool = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);
    setResult(null);

    const formData = new FormData();

    try {
      console.log(`[Process] Starting ${activeTool} operation for ${files.length} file(s)`);
      if (activeTool === 'rotate') {
        formData.append('file', files[0]);
        const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const upData = await upRes.json();
        if (!upData.success) throw new Error(upData.error);

        const rotRes = await fetch('/api/pdf/rotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: upData.data.fileId, degree: 90 }),
        });
        const rotData = await rotRes.json();
        if (!rotData.success) throw new Error(rotData.error);

        setResult({
          fileName: rotData.data.fileName,
          downloadUrl: `/api/pdf/download/${rotData.data.fileName}`
        });
      } else if (activeTool === 'merge') {
        files.forEach(f => formData.append('files', f));
        const res = await fetch('/api/pdf/merge', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setResult({
          fileName: data.data.fileName,
          downloadUrl: data.data.download_url
        });
      } else if (activeTool === 'compress') {
        formData.append('file', files[0]);
        formData.append('level', 'screen');
        const res = await fetch('/api/pdf/compress', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setResult({
          fileName: `${data.data.id}_compressed.pdf`,
          downloadUrl: data.data.download_url,
          stats: { before: data.data.size_before, after: data.data.size_after, note: data.data.note }
        });
      } else if (activeTool === 'ocr') {
        formData.append('file', files[0]);
        const res = await fetch('/api/pdf/ocr', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setResult({
          text: data.data.pages[0].text
        });
      } else if (activeTool === 'split') {
        formData.append('file', files[0]);
        formData.append('start', splitRange.start.toString());
        formData.append('end', splitRange.end.toString());
        const res = await fetch('/api/pdf/split', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setResult({
          fileName: data.data.fileName,
          downloadUrl: data.data.download_url
        });
      } else if (activeTool === 'delete') {
        const indices = deletePages.split(',').map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n));
        const payload = new FormData();
        payload.append('file', files[0]);
        indices.forEach(idx => payload.append('pages', idx.toString()));

        const res = await fetch('/api/pdf/delete', { method: 'POST', body: payload });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setResult({
          fileName: data.data.fileName,
          downloadUrl: data.data.download_url
        });
      } else if (activeTool === 'edit') {
        setIsEditorOpen(true);
      }
      console.log(`[Process] ${activeTool} completed successfully`);
    } catch (err: any) {
      console.error(`[Process Error] ${activeTool}:`, err);
      setError(err.message || 'Operation failed. Please check the console/logs.');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 flex flex-col">
      <AnimatePresence>
        {isEditorOpen && files.length > 0 && (
          <ErrorBoundary key="pdf-editor">
            <PdfWorkspace 
              files={files} 
              activeTool={activeTool} 
              onBack={() => {
                setIsEditorOpen(false);
                // Optionally reset files here or in reset()
              }} 
            />
          </ErrorBoundary>
        )}
      </AnimatePresence>
      {/* Header & Sub-header Area */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <header className="max-w-7xl mx-auto w-full h-16 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#FA0F00] rounded-sm flex items-center justify-center shadow-sm">
              <span className="text-white font-black text-xs leading-none">PDF</span>
            </div>
            <span className="text-xl font-extrabold tracking-tighter text-slate-900">
              Master<span className="text-[#FA0F00]">Edit</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
          </div>
        </header>
        
        {/* Sub-header Navigation */}
        <nav className="max-w-7xl mx-auto w-full px-6 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth border-t border-slate-50">
          {[
            { id: 'edit', label: 'Edit PDF', icon: Edit },
          ].map((tool) => (
            <button 
              key={tool.id}
              onClick={() => { setActiveTool(tool.id as Tool); reset(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all active:scale-95 ${
                activeTool === tool.id 
                  ? 'bg-red-50 text-[#FA0F00] border border-red-100' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <tool.icon className={`w-4 h-4 ${activeTool === tool.id ? 'text-[#FA0F00]' : 'text-slate-400'}`} />
              {tool.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-20 max-w-7xl mx-auto w-full">
        <div className="max-w-3xl w-full text-center">
          <motion.h1 
            key={activeTool}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-6xl font-black text-slate-900 leading-[0.9] tracking-tight mb-4"
          >
            {activeTool === 'edit' && <>Edit PDF <span className="text-[#FA0F00] block md:inline">Instantly.</span></>}
            {activeTool === 'rotate' && <>Rotate PDF <span className="text-[#FA0F00] block md:inline">Instantly.</span></>}
            {activeTool === 'merge' && <>Merge PDFs <span className="text-[#FA0F00] block md:inline">Seamlessly.</span></>}
            {activeTool === 'compress' && <>Compress PDF <span className="text-[#FA0F00] block md:inline">Efficiently.</span></>}
            {activeTool === 'ocr' && <>Extract Text <span className="text-[#FA0F00] block md:inline">Intelligently.</span></>}
            {activeTool === 'split' && <>Split PDF <span className="text-[#FA0F00] block md:inline">Instantly.</span></>}
            {activeTool === 'delete' && <>Remove Pages <span className="text-[#FA0F00] block md:inline">Easily.</span></>}
          </motion.h1>
          <p className="text-lg text-slate-500 mb-10 max-w-xl mx-auto font-medium">
            Professional PDF tools designed for speed and precision. Secure, browser-based processing.
          </p>

          <div className="max-w-2xl mx-auto w-full">
            {!result ? (
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#FA0F00] to-orange-500 rounded-3xl blur opacity-10 group-hover:opacity-25 transition duration-1000 group-hover:duration-200"></div>
                <motion.div 
                  layout
                  className="relative bg-white border-2 border-dashed border-slate-200 rounded-3xl p-10 md:p-16 flex flex-col items-center justify-center hover:border-[#FA0F00] transition-colors bg-opacity-50"
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
                    {activeTool === 'edit' && <Edit className="w-8 h-8 md:w-10 md:h-10 text-[#FA0F00]" />}
                    {activeTool === 'rotate' && <RotateCw className="w-8 h-8 md:w-10 md:h-10 text-[#FA0F00]" />}
                    {activeTool === 'merge' && <Layers className="w-8 h-8 md:w-10 md:h-10 text-[#FA0F00]" />}
                    {activeTool === 'compress' && <Shrink className="w-8 h-8 md:w-10 md:h-10 text-[#FA0F00]" />}
                    {activeTool === 'ocr' && <ScanText className="w-8 h-8 md:w-10 md:h-10 text-[#FA0F00]" />}
                  </div>
                  
                  {files.length === 0 ? (
                    <>
                      <label 
                        htmlFor="file-upload" 
                        className="bg-[#FA0F00] hover:bg-[#D70D00] text-white px-10 py-4 rounded-full font-bold text-xl shadow-xl shadow-red-200 transition-all cursor-pointer active:scale-95"
                      >
                        {activeTool === 'merge' ? 'Select PDF files' : 'Select PDF file'}
                      </label>
                      <input 
                        id="file-upload" 
                        type="file" 
                        accept=".pdf,image/*" 
                        multiple={activeTool === 'merge'}
                        className="hidden" 
                        onChange={handleFileChange}
                      />
                      <p className="mt-4 text-slate-400 font-medium tracking-tight">or drop {activeTool === 'merge' ? 'files' : 'file'} here</p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center w-full">
                      <div className="w-full max-w-md space-y-3 mb-8 text-left">
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center gap-3 bg-slate-50 px-5 py-4 rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                            <FileText className="w-6 h-6 text-[#FA0F00]" />
                            <div className="flex flex-col text-left overflow-hidden">
                              <span className="text-sm font-bold text-slate-900 truncate">{f.name}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ready</span>
                            </div>
                            <button onClick={() => removeFile(i)} className="ml-auto text-slate-400 hover:text-[#FA0F00] transition-colors">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ))}

                        {activeTool === 'split' && (
                          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2 mb-2">
                              <Scissors className="w-4 h-4 text-slate-400" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Split Range</span>
                            </div>
                            <div className="flex gap-4">
                              <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Start Page</label>
                                <input 
                                  type="number" 
                                  value={splitRange.start} 
                                  min={1}
                                  onChange={(e) => setSplitRange(prev => ({ ...prev, start: parseInt(e.target.value) || 1 }))}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 font-bold focus:border-[#FA0F00] outline-none transition-colors"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">End Page</label>
                                <input 
                                  type="number" 
                                  value={splitRange.end} 
                                  min={splitRange.start}
                                  onChange={(e) => setSplitRange(prev => ({ ...prev, end: parseInt(e.target.value) || 1 }))}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 font-bold focus:border-[#FA0F00] outline-none transition-colors"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {activeTool === 'delete' && (
                          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2 mb-2">
                              <Trash2 className="w-4 h-4 text-slate-400" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Delete Pages</span>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Page Numbers (comma separated)</label>
                              <input 
                                type="text" 
                                value={deletePages}
                                placeholder="e.g. 1, 3, 5"
                                onChange={(e) => setDeletePages(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 font-bold focus:border-[#FA0F00] outline-none transition-colors"
                              />
                            </div>
                          </div>
                        )}
                        
                        {activeTool === 'merge' && (
                          <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-[#FA0F00] hover:border-[#FA0F00] cursor-pointer transition-all">
                            <Plus className="w-5 h-5" />
                            <span className="font-bold text-sm">Add more files</span>
                            <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileChange} />
                          </label>
                        )}
                      </div>
                      
                      <button 
                        onClick={processTool}
                        disabled={isProcessing || (activeTool === 'merge' && files.length < 2)}
                        className="bg-[#FA0F00] hover:bg-[#D70D00] disabled:bg-red-200 text-white px-12 py-4 rounded-full font-bold text-xl transition-all shadow-xl shadow-red-200 flex items-center justify-center gap-3 w-full max-w-xs group active:scale-95"
                      >
                        {isProcessing ? (
                          <RotateCw className="w-6 h-6 animate-spin" />
                        ) : (
                          <>
                            {activeTool === 'rotate' && 'Rotate 90°'}
                            {activeTool === 'edit' && 'Open Editor'}
                            {activeTool === 'merge' && 'Merge Files'}
                            {activeTool === 'compress' && 'Compress Now'}
                            {activeTool === 'ocr' && 'Extract Text'}
                            {activeTool === 'split' && 'Split Now'}
                            {activeTool === 'delete' && 'Delete Pages'}
                            <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-white border border-slate-200 rounded-[32px] p-10 shadow-2xl flex flex-col items-center text-center overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-6">
                  <button onClick={reset} className="text-slate-400 hover:text-[#FA0F00] transition-all">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="mb-6 w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                
                <h3 className="text-3xl font-black text-slate-900 mb-2">Success!</h3>
                <p className="text-slate-500 font-medium mb-10">Your processing is complete.</p>

                {result.text ? (
                  <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 text-left max-h-60 overflow-y-auto mb-10 font-mono text-sm whitespace-pre-wrap">
                    {result.text}
                  </div>
                ) : (
                  <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 flex items-center gap-5 mb-10 text-left">
                    <div className="w-14 h-14 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center">
                      <FileText className="w-7 h-7 text-[#FA0F00]" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-bold text-slate-900 truncate">{result.fileName}</p>
                      {result.stats && (
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                          {(result.stats.before / 1024 / 1024).toFixed(2)}MB → {(result.stats.after / 1024 / 1024).toFixed(2)}MB
                          {result.stats.note && ` (${result.stats.note})`}
                        </p>
                      )}
                      {!result.stats && <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">High Quality PDF</p>}
                    </div>
                  </div>
                )}

                {result.downloadUrl && (
                  <a 
                    href={result.downloadUrl}
                    className="bg-slate-900 hover:bg-black text-white px-12 py-5 rounded-full font-bold text-xl transition-all flex items-center justify-center gap-3 shadow-xl w-full max-w-sm group"
                  >
                    <Download className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
                    Download
                  </a>
                )}
                {result.text && (
                  <button 
                    onClick={() => { navigator.clipboard.writeText(result.text!); alert('Copied to clipboard!'); }}
                    className="bg-slate-900 hover:bg-black text-white px-12 py-5 rounded-full font-bold text-xl transition-all flex items-center justify-center gap-3 shadow-xl w-full max-w-sm group"
                  >
                    Copy Text
                  </button>
                )}
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-8 bg-red-50 border border-red-100 text-[#FA0F00] p-5 rounded-2xl flex items-center justify-center gap-3 text-sm font-bold shadow-sm"
              >
                <X className="w-5 h-5 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="w-full bg-slate-50 border-t border-gray-100 p-8 flex flex-col md:flex-row items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4 text-slate-400">
          <div className="flex -space-x-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-9 h-9 rounded-full border-[3px] border-white shadow-sm bg-slate-100 flex items-center justify-center overflow-hidden">
                <div className={`w-full h-full bg-slate-${i+1}00`}></div>
              </div>
            ))}
          </div>
          <span className="text-xs font-bold tracking-tight text-slate-500">12,000+ files processed daily</span>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          © 2026 MasterEdit PDF. Private & Secure.
        </div>
      </footer>
    </div>
  );
}
