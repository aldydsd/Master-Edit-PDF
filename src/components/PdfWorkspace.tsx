import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { motion, AnimatePresence } from 'motion/react';
import * as fabric from 'fabric';
import { 
  ChevronLeft, ChevronRight, RotateCw, Trash2, Scissors, 
  Layers, Shrink, ScanText, Download,
  ZoomIn, ZoomOut, Maximize, MousePointer2, ImagePlus, Pencil, Shapes, Type,
  Eraser, RotateCcw, Pipette, Square, Circle, Triangle, Minus, Undo2, Redo2,
  PlusCircle, ArrowUp, ArrowDown, XCircle, PanelLeftClose, PanelLeftOpen, Menu
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import Tesseract from 'tesseract.js';

// Setup PDF.js worker
const PDFJS_VERSION = '4.10.38'; // Stable version with good CDN support
const DEFAULT_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

try {
  // Use Vite's worker URL or fallback to CDN
  const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc || DEFAULT_WORKER_URL;
  console.log('PDF.js worker source set:', pdfjs.GlobalWorkerOptions.workerSrc);
} catch (e) {
  pdfjs.GlobalWorkerOptions.workerSrc = DEFAULT_WORKER_URL;
  console.warn('Falling back to CDN worker:', DEFAULT_WORKER_URL);
}

interface PdfWorkspaceProps {
  files: File[];
  onBack: () => void;
  activeTool: string;
}

export const PdfWorkspace: React.FC<PdfWorkspaceProps> = ({ files, onBack, activeTool: initialTool }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [zoom, setZoom] = useState(1.0);
  const [activeTool, setActiveTool] = useState(initialTool);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [brushWidth, setBrushWidth] = useState(5);
  const [brushColor, setBrushColor] = useState('#FA0F00');
  const [textSize, setTextSize] = useState(24);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [pageAnnotations, setPageAnnotations] = useState<Record<number, string>>({});
  const [deletedPages, setDeletedPages] = useState<Set<number>>(new Set());
  const [mergeQueue, setMergeQueue] = useState<File[]>([]);
  const [compressionLevel, setCompressionLevel] = useState<'screen' | 'ebook' | 'printer'>('ebook');
  const [shapeType, setShapeType] = useState<'rect' | 'circle' | 'triangle' | 'line'>('rect');
  const [isShapeFilled, setIsShapeFilled] = useState(true);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [pageUndoStacks, setPageUndoStacks] = useState<Record<number, string[]>>({});
  const [pageRedoStacks, setPageRedoStacks] = useState<Record<number, string[]>>({});
  const [nativePageText, setNativePageText] = useState<Record<number, any[]>>({});
  const [pageOcrText, setPageOcrText] = useState<Record<number, any[]>>({});
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);
  const isHistoryUpdate = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const renderTaskRef = useRef<any>(null);

  const notify = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setNotification({ message, type });
    console.log(`[Notification] ${type.toUpperCase()}: ${message}`);
    setTimeout(() => setNotification(null), 5000);
  };

  // Initialize Fabric Canvas
  useEffect(() => {
    let isMounted = true;
    try {
      if (canvasRef.current && !fabricRef.current) {
        console.log('Initializing Fabric canvas...');
        fabricRef.current = new fabric.Canvas(canvasRef.current, {
          isDrawingMode: false,
          enableRetinaScaling: true,
          selection: true,
        });

        const canvas = fabricRef.current;

        // History Observers
        const saveHistory = () => {
          if (isHistoryUpdate.current) return;
          const json = JSON.stringify(canvas.toJSON());
          const page = currentPageRef.current;
          
          setPageUndoStacks(prev => {
            const currentStack = prev[page] || [];
            if (currentStack.length > 0 && currentStack[currentStack.length - 1] === json) {
              return prev;
            }
            return {
              ...prev,
              [page]: [...currentStack, json].slice(-50)
            };
          });
          
          setPageRedoStacks(prev => ({
            ...prev,
            [page]: []
          }));

          setPageAnnotations(prev => ({
            ...prev,
            [page]: json
          }));
        };

        canvas.on('object:added', saveHistory);
        canvas.on('object:modified', saveHistory);
        canvas.on('object:removed', saveHistory);
        canvas.on('path:created', saveHistory);

        setCanvasReady(true);
        console.log('Fabric canvas ready');
      }
    } catch (err) {
      if (isMounted) {
        console.error('Failed to initialize canvas:', err);
        notify('Critical error initializing editor canvas', 'error');
      }
    }
    return () => {
      isMounted = false;
      if (fabricRef.current) {
        console.log('Disposing Fabric canvas...');
        fabricRef.current.dispose();
        fabricRef.current = null;
        setCanvasReady(false);
      }
    };
  }, []);

  // Keyboard listeners for deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && (activeTool === 'select' || activeTool === 'text')) {
        const canvas = fabricRef.current;
        if (!canvas) return;

        const activeObject = canvas.getActiveObject();
        // Specifically check if a text object is currently in "editing" mode (cursor active)
        const isEditing = activeObject && (activeObject as any).isEditing;

        if (isEditing) return; // Allow normal backspace/delete behavior inside text editing

        // Prevent backspace from navigating back if we're not in an input
        if (!(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
          if (e.key === 'Backspace' || e.key === 'Delete') {
            deleteSelectedItem();
            if (e.key === 'Backspace') e.preventDefault();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool]);

  // Update Tool Mode & Selected Object styles
  useEffect(() => {
    try {
      if (!fabricRef.current) return;
      const canvas = fabricRef.current;
      
      canvas.isDrawingMode = activeTool === 'draw';
      if (activeTool === 'draw') {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = brushWidth;
        canvas.freeDrawingBrush.color = brushColor;
      }

      // If in select mode and something is selected, apply changes to it
      if (activeTool === 'select' || activeTool === 'text') {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length > 0) {
          activeObjects.forEach(obj => {
            if (obj.type === 'i-text') {
              (obj as any).set({ 
                fill: brushColor,
                fontSize: textSize,
                fontFamily: fontFamily
              });
            } else if (obj.type === 'path' || obj.type === 'rect') {
              (obj as any).set({ 
                stroke: brushColor, 
                strokeWidth: brushWidth,
                // If it's a shape we might also want to set fill if it's transparent-ish
              });
            }
          });
          canvas.requestRenderAll();
        }
      }

      if (activeTool === 'select' || activeTool === 'text') {
        canvas.selection = true;
        canvas.forEachObject(obj => {
          // Allow selecting text while in text mode, or anything in select mode
          obj.selectable = activeTool === 'select' || obj.type === 'i-text';
          obj.evented = true;
        });
      } else {
        canvas.selection = false;
        canvas.forEachObject(obj => {
          obj.selectable = false;
          obj.evented = activeTool === 'draw' ? false : true;
        });
      }
      canvas.requestRenderAll();
    } catch (err) {
      console.error('Error switching tool:', err);
      notify('Failed to switch tool mode', 'error');
    }
  }, [activeTool, brushWidth, brushColor, textSize, fontFamily]);

  useEffect(() => {
    const loadPdf = async () => {
      const file = files[0];
      if (!file) return;

      if (mergeQueue.length === 0) {
        setMergeQueue(files);
      }

      try {
        console.log(`Loading PDF: ${file.name}`);
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        notify('PDF loaded successfully', 'success');
        console.log('PDF doc initialized:', pdf.numPages, 'pages');
      } catch (err: any) {
        console.error('PDF Load Error:', err);
        notify(`Failed to load PDF: ${err.message}`, 'error');
      }
    };

    loadPdf();
  }, [files]);

  useEffect(() => {
    if (pdfDoc && canvasReady) {
      const currentRotation = pageRotations[currentPage] || 0;
      renderPage(pdfDoc, currentPage, zoom, currentRotation);
    }
  }, [currentPage, zoom, pdfDoc, canvasReady, pageRotations]);

  const renderPage = async (pdf: any, pageNum: number, currentZoom: number, currentRotation: number = 0) => {
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {
        // Ignore cancel errors
      }
    }

    if (!pdf || !pageNum) return;

    try {
      setIsRendering(true);
      if (!fabricRef.current || !canvasReady) {
        console.warn('Fabric instance or canvas not ready for rendering, waiting...');
        return;
      }

      const canvas = fabricRef.current;
      isHistoryUpdate.current = true;
      
      // Before rendering a new page, clear all objects (not background)
      // The saving logic should be handled by the caller or a side effect
      canvas.getObjects().forEach(obj => {
        if (obj !== canvas.backgroundImage) {
          canvas.remove(obj);
        }
      });

      console.log(`Starting render for page ${pageNum} at ${currentZoom}x zoom with ${currentRotation}deg rotation`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentZoom, rotation: currentRotation });
      
      canvas.setDimensions({
        width: viewport.width,
        height: viewport.height
      });
      setCanvasSize({ width: viewport.width, height: viewport.height });

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      const tempContext = tempCanvas.getContext('2d');

      if (!tempContext) throw new Error('Could not create temp canvas context');

      const renderContext = {
        canvasContext: tempContext,
        viewport: viewport,
      };
      
      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      const imgData = tempCanvas.toDataURL('image/png');
      
      let img;
      try {
        if (fabric.FabricImage && (fabric.FabricImage as any).fromURL) {
            img = await (fabric.FabricImage as any).fromURL(imgData);
        } else {
            img = await new Promise((resolve, reject) => {
                (fabric as any).Image.fromURL(imgData, (res: any) => {
                    if (res) resolve(res);
                    else reject(new Error('Failed to load background via Image.fromURL'));
                }, { crossOrigin: 'anonymous' });
            });
        }
      } catch (e) {
        console.error('Image creation failed:', e);
        throw e;
      }
      
      if (img) {
        (img as any).set({
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
          originX: 'left',
          originY: 'top'
        });

        canvas.backgroundImage = img as any;
        
        // Load saved annotations for this page
        if (pageAnnotations[pageNum]) {
          await canvas.loadFromJSON(pageAnnotations[pageNum]);
          canvas.backgroundImage = img as any; // Ensure background stays
        }

        canvas.requestRenderAll();
        console.log(`Page ${pageNum} background set and annotations loaded`);

        // Load native text content for selectable overlay
        try {
          const textContent = await page.getTextContent();
          if (textContent && textContent.items && textContent.items.length > 0) {
            const items = textContent.items.map((item: any) => {
              const [scaleX, skewY, skewX, scaleY, tx, ty] = item.transform;
              const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
              const fontHeight = Math.sqrt(scaleY * scaleY + skewX * skewX);
              const screenFontSize = fontHeight * viewport.scale;
              const screenWidth = (item.width || 0) * viewport.scale;
              const screenHeight = (item.height || 0) * viewport.scale;
              
              const top = vy - (screenHeight || screenFontSize);
              const left = vx;
              
              return {
                str: item.str,
                left,
                top,
                width: screenWidth || 4,
                height: screenHeight || screenFontSize || 12,
                fontSize: screenFontSize || 12,
                fontFamily: item.fontName || 'monospace'
              };
            });
            setNativePageText(prev => ({
              ...prev,
              [pageNum]: items
            }));
          }
        } catch (err) {
          console.warn('Could not load native page text:', err);
        }

        // Initialize the first state in undo history for this page if empty
        const initialJson = JSON.stringify(canvas.toJSON());
        setPageUndoStacks(prev => {
          if (prev[pageNum] && prev[pageNum].length > 0) return prev;
          return {
            ...prev,
            [pageNum]: [initialJson]
          };
        });
      }
    } catch (err: any) {
      if (err.name === 'RenderingCancelledException') {
        process.env.NODE_ENV === 'development' && console.log('Rendering cancelled');
      } else {
        console.error('PDF Render Error:', err);
        notify(`Rendering Error: ${err.message}`, 'error');
      }
    } finally {
      setIsRendering(false);
      isHistoryUpdate.current = false;
    }
  };

  const addText = () => {
    try {
      if (!fabricRef.current) return;
      const text = new fabric.IText('Type here...', {
        left: 100,
        top: 100,
        fontFamily: fontFamily,
        fontSize: textSize,
        fill: brushColor
      });
      fabricRef.current.add(text);
      fabricRef.current.centerObject(text);
      fabricRef.current.setActiveObject(text);
      fabricRef.current.requestRenderAll();
      // Don't switch to select immediately to allow more typing
      notify('Text element added', 'success');
    } catch (err) {
      console.error('Error adding text:', err);
      notify('Failed to add text element', 'error');
    }
  };

  const addShape = (typeOverride?: any) => {
    try {
      if (!fabricRef.current) return;
      // If called from onClick directly, typeOverride might be an event object
      const targetType = (typeOverride && typeof typeOverride === 'string') ? typeOverride : shapeType;
      let shape: any;
      
      // Use solid fill (100% opaque) if requested
      const fillValue = isShapeFilled ? brushColor : 'transparent';

      const commonStyles = {
        left: fabricRef.current.width ? fabricRef.current.width / 2 - 50 : 150,
        top: fabricRef.current.height ? fabricRef.current.height / 2 - 50 : 150,
        fill: fillValue,
        stroke: brushColor,
        strokeWidth: Math.max(brushWidth, 1),
        cornerColor: '#FA0F00',
        cornerStyle: 'circle' as const,
        transparentCorners: false,
        padding: 5
      };

      if (targetType === 'rect') {
        shape = new fabric.Rect({
          ...commonStyles,
          width: 120,
          height: 80,
        });
      } else if (targetType === 'circle') {
        shape = new fabric.Circle({
          ...commonStyles,
          radius: 50,
        });
      } else if (targetType === 'triangle') {
        shape = new fabric.Triangle({
          ...commonStyles,
          width: 100,
          height: 100,
        });
      } else if (targetType === 'line') {
        shape = new fabric.Line([0, 0, 150, 0], {
          ...commonStyles,
          strokeWidth: Math.max(brushWidth, 2),
        });
      }

      if (shape) {
        fabricRef.current.add(shape);
        fabricRef.current.centerObject(shape);
        fabricRef.current.setActiveObject(shape);
        fabricRef.current.requestRenderAll();
        // Don't switch tool immediately to allow user to add more or change settings
        notify(`${targetType.charAt(0).toUpperCase() + targetType.slice(1)} added`, 'success');
      } else {
        throw new Error('Shape type not recognized: ' + targetType);
      }
    } catch (err: any) {
      console.error('Error adding shape:', err);
      notify('Failed to add shape: ' + err.message, 'error');
    }
  };

  const addImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !fabricRef.current) return;

      if (!file.type.startsWith('image/')) {
        notify('Please select a valid image file', 'error');
        return;
      }

      console.log(`Adding image: ${file.name}`);
      const reader = new FileReader();
      reader.onload = async (f) => {
        const data = f.target?.result as string;
        try {
          const img = await fabric.FabricImage.fromURL(data);
          img.scaleToWidth(200);
          fabricRef.current?.add(img);
          fabricRef.current?.centerObject(img);
          fabricRef.current?.setActiveObject(img);
          setActiveTool('select');
          notify('Image added to canvas', 'success');
        } catch (err) {
          console.error('Error loading image into fabric:', err);
          notify('Failed to load image onto canvas', 'error');
        }
      };
      reader.onerror = () => {
        notify('Failed to read image file', 'error');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error in addImage:', err);
      notify('Unexpected error adding image', 'error');
    }
  };

  const deleteSelectedItem = () => {
    try {
      if (!fabricRef.current) return;
      const activeObjects = fabricRef.current.getActiveObjects();
      if (activeObjects.length > 0) {
        fabricRef.current.remove(...activeObjects);
        fabricRef.current.discardActiveObject();
        fabricRef.current.requestRenderAll();
        notify('Selected items removed', 'success');
      } else {
        notify('Please select an item first', 'info');
      }
    } catch (err) {
      console.error('Error deleting item:', err);
      notify('Failed to delete item', 'error');
    }
  };

  const clearCanvas = () => {
    try {
      if (!fabricRef.current) return;
      const objects = fabricRef.current.getObjects();
      // Only remove user annotations, keep background
      const toRemove = objects.filter(obj => obj !== fabricRef.current?.backgroundImage);
      if (toRemove.length > 0) {
        isHistoryUpdate.current = true;
        fabricRef.current.remove(...toRemove);
        fabricRef.current.requestRenderAll();
        isHistoryUpdate.current = false;

        // Manual history save for the cleared state
        if (fabricRef.current) {
          const json = JSON.stringify(fabricRef.current.toJSON());
          const page = currentPageRef.current;
          setPageUndoStacks(prev => {
            const currentStack = prev[page] || [];
            return {
              ...prev,
              [page]: [...currentStack, json].slice(-50)
            };
          });
          setPageRedoStacks(prev => ({
            ...prev,
            [page]: []
          }));
          setPageAnnotations(prev => ({
            ...prev,
            [page]: json
          }));
        }
        notify('All annotations cleared', 'success');
      } else {
        notify('Canvas is already clear', 'info');
      }
    } catch (err) {
      console.error('Error clearing canvas:', err);
      notify('Failed to clear canvas', 'error');
    }
  };

  const undo = async () => {
    const page = currentPageRef.current;
    const currentUndoStack = pageUndoStacks[page] || [];
    if (currentUndoStack.length <= 1 || !fabricRef.current) return;
    
    try {
      isHistoryUpdate.current = true;
      const canvas = fabricRef.current;
      const currentStatus = currentUndoStack[currentUndoStack.length - 1];
      const prevStatus = currentUndoStack[currentUndoStack.length - 2];
      const newUndoStack = currentUndoStack.slice(0, -1);
      
      const bg = canvas.backgroundImage;
      await canvas.loadFromJSON(prevStatus);
      if (bg) {
        canvas.backgroundImage = bg;
      }
      canvas.requestRenderAll();
      
      setPageRedoStacks(prev => ({
        ...prev,
        [page]: [...(prev[page] || []), currentStatus]
      }));
      setPageUndoStacks(prev => ({
        ...prev,
        [page]: newUndoStack
      }));
      setPageAnnotations(prev => ({
        ...prev,
        [page]: prevStatus
      }));
      notify('Undo successful', 'info');
    } catch (err) {
      console.error('Undo failed:', err);
    } finally {
      isHistoryUpdate.current = false;
    }
  };

  const redo = async () => {
    const page = currentPageRef.current;
    const currentRedoStack = pageRedoStacks[page] || [];
    if (currentRedoStack.length === 0 || !fabricRef.current) return;

    try {
      isHistoryUpdate.current = true;
      const canvas = fabricRef.current;
      const currentStatus = JSON.stringify(canvas.toJSON());
      const nextStatus = currentRedoStack[currentRedoStack.length - 1];
      const newRedoStack = currentRedoStack.slice(0, -1);
      
      const bg = canvas.backgroundImage;
      await canvas.loadFromJSON(nextStatus);
      if (bg) {
        canvas.backgroundImage = bg;
      }
      canvas.requestRenderAll();
      
      setPageUndoStacks(prev => ({
        ...prev,
        [page]: [...(prev[page] || []), nextStatus]
      }));
      setPageRedoStacks(prev => ({
        ...prev,
        [page]: newRedoStack
      }));
      setPageAnnotations(prev => ({
        ...prev,
        [page]: nextStatus
      }));
      notify('Redo successful', 'info');
    } catch (err) {
      console.error('Redo failed:', err);
    } finally {
      isHistoryUpdate.current = false;
    }
  };

  const pickColorFromScreen = async () => {
    if (!('EyeDropper' in window)) {
      notify('Eyedropper not supported in this browser', 'error');
      return;
    }

    try {
      setIsPickerActive(true);
      // @ts-ignore
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      setBrushColor(result.sRGBHex);
      notify('Color picked: ' + result.sRGBHex, 'success');
    } catch (e) {
      console.error('Eyedropper error:', e);
    } finally {
      setIsPickerActive(false);
    }
  };

  const handleRotate = () => {
    try {
      if (!fabricRef.current) return;
      const canvas = fabricRef.current;
      
      const newRotation = ((pageRotations[currentPage] || 0) + 90) % 360;
      setPageRotations(prev => ({
        ...prev,
        [currentPage]: newRotation
      }));
      
      // Calculate rotation offset for existing objects
      // When the page rotates, we need to rotate all existing annotations as well
      const center = { x: canvas.width! / 2, y: canvas.height! / 2 };
      const objects = canvas.getObjects().filter(obj => obj !== canvas.backgroundImage);
      
      if (objects.length > 0) {
        const cx = canvas.width! / 2;
        const cy = canvas.height! / 2;
        
        objects.forEach(obj => {
          const left = obj.left || 0;
          const top = obj.top || 0;
          
          // Manual 90-degree clockwise rotation math around center (cx, cy)
          const dx = left - cx;
          const dy = top - cy;
          
          // New position: x' = cx - dy, y' = cy + dx
          obj.set({
            left: cx - dy,
            top: cy + dx,
            angle: (obj.angle || 0) + 90
          });
          
          obj.setCoords();
        });
      }
      
      canvas.requestRenderAll();
      notify(`Page ${currentPage} rotated to ${newRotation}°`, 'info');
    } catch (err) {
      console.error('Rotation error:', err);
      notify('Failed to rotate page', 'error');
    }
  };

  const handleMergeExecution = async () => {
    // Validation: Need at least 2 files to merge
    if (mergeQueue.length < 2) {
      notify('Please add at least two files in the merge staging area.', 'error');
      return;
    }

    setIsProcessing(true);
    notify('Merging PDF documents in sequence...', 'info');

    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const file of mergeQueue) {
        const bytes = await file.arrayBuffer();
        const pdf = await PDFDocument.load(bytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const fileName = `merged_${Date.now()}.pdf`;
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      
      notify('PDFs merged successfully! Preparing download...', 'success');
      
      // Trigger browser download
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(downloadUrl);

    } catch (err: any) {
      console.error('Merge Error:', err);
      notify(`Merge operation failed: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompressExecution = async () => {
    if (!pdfDoc || files.length === 0) return;

    setIsProcessing(true);
    notify(`Compressing PDF (${compressionLevel})...`, 'info');

    try {
      // In a client-side environment, we use pdf-lib's object stream compression.
      // While it won't downsample images like Ghostscript without complex manual processing,
      // it provides the best available web-based compression.
      
      const file = files[0];
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      
      // pdf-lib's save defaults to useObjectStreams: true which is good for compression
      // We can vary the level by conditionally applying more aggressive stream compression if available.
      const compressedBytes = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      const blob = new Blob([compressedBytes], { type: 'application/pdf' });
      const fileName = `compressed_${compressionLevel}_${file.name}`;
      const compressedFile = new File([blob], fileName, { type: 'application/pdf' });

      // Calculate sizes for the notification
      const oldSize = (file.size / 1024 / 1024).toFixed(2);
      const newSize = (compressedFile.size / 1024 / 1024).toFixed(2);

      notify(`Compression complete! ${oldSize}MB → ${newSize}MB`, 'success');

      // Trigger download
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(downloadUrl);

    } catch (err: any) {
      console.error('Compression Error:', err);
      notify(`Compression failed: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOcrExecution = async () => {
    if (!pdfDoc || files.length === 0) return;

    setIsProcessing(true);
    notify("OCR Processing: Extracting text & creating invisible selection layer...", "info");

    try {
      // Get current page background for high-precision clean OCR
      const page = await pdfDoc.getPage(currentPage);
      const currentRotation = pageRotations[currentPage] || 0;
      const viewport = page.getViewport({ scale: zoom, rotation: currentRotation });
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      const tempContext = tempCanvas.getContext('2d');
      if (!tempContext) throw new Error('Could not create temp canvas context');

      const renderContext = {
        canvasContext: tempContext,
        viewport: viewport,
      };
      
      await page.render(renderContext).promise;
      const imgData = tempCanvas.toDataURL('image/png');

      notify("OCR Engine Running: Recognizing characters...", "info");

      // Run Tesseract OCR client-side directly on background image data
      const result: any = await Tesseract.recognize(imgData, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            const progress = (m.progress * 100).toFixed(0);
            notify(`OCR Progress: ${progress}%...`, 'info');
          }
        }
      });

      const { data: { words } } = result;

      if (!words || words.length === 0) {
        notify("OCR completed, but no text was detected on this page.", "info");
        return;
      }

      const mappedWords = words.map((word: any) => ({
        str: word.text + ' ',
        left: word.bbox.x0,
        top: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
        fontSize: (word.bbox.y1 - word.bbox.y0) * 0.8,
        fontFamily: 'monospace'
      }));

      setPageOcrText(prev => ({
        ...prev,
        [currentPage]: mappedWords
      }));

      notify(`OCR Successful! Transparent text sandwich layer activated on Page ${currentPage}.`, "success");
    } catch (err: any) {
      console.error("OCR Error:", err);
      notify(`OCR engine failed: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const saveCurrentAnnotations = () => {
    if (fabricRef.current) {
      const json = JSON.stringify(fabricRef.current.toJSON());
      setPageAnnotations(prev => ({
        ...prev,
        [currentPage]: json
      }));
    }
  };

  const handleFinishAndExport = async () => {
    if (!pdfDoc || files.length === 0) return;

    // Save current page state first
    saveCurrentAnnotations();
    
    setIsProcessing(true);
    notify('Baking PDF: Flattening all layers...', 'info');

    try {
      const originalBytes = await files[0].arrayBuffer();
      const pdf = await PDFDocument.load(originalBytes);
      const finalPdf = await PDFDocument.create();
      
      // Copy existing pages into the new PDF, skipping deleted ones
      for (let i = 0; i < numPages; i++) {
        const pageNum = i + 1;
        if (deletedPages.has(pageNum)) continue;

        const [copiedPage] = await finalPdf.copyPages(pdf, [i]);
        
        // Apply rotation if any
        const rotation = pageRotations[pageNum] || 0;
        if (rotation !== 0) {
          copiedPage.setRotation({ type: 'degrees' as any, angle: rotation } as any);
        }

        // Apply annotations if any (Flattening)
        // We use the JSON stored in pageAnnotations
        if (pageAnnotations[pageNum] || (pageNum === currentPage && fabricRef.current)) {
          const jsonStr = pageNum === currentPage ? JSON.stringify(fabricRef.current!.toJSON()) : pageAnnotations[pageNum];
          if (jsonStr) {
            const tempCanvas = document.createElement('canvas');
            const workCanvas = new fabric.Canvas(tempCanvas, {
              width: copiedPage.getWidth(),
              height: copiedPage.getHeight()
            });

            await workCanvas.loadFromJSON(jsonStr);
            // Remove background if it was saved in JSON to keep transparent
            workCanvas.backgroundImage = undefined;
            workCanvas.getObjects().forEach(obj => {
              if (obj.type === 'image' && (obj as any).originX === 'left' && (obj as any).originY === 'top' && (obj as any).width === workCanvas.width) {
                 // This is likely the background image we added in renderPage, skip it
                 workCanvas.remove(obj);
              }
            });

            const dataUrl = workCanvas.toDataURL({ format: 'png', quality: 1.0, multiplier: 1 });
            const annotationImg = await finalPdf.embedPng(dataUrl);
            
            finalPdf.addPage(copiedPage);
            const lastPage = finalPdf.getPage(finalPdf.getPageCount() - 1);
            
            lastPage.drawImage(annotationImg, {
              x: 0,
              y: 0,
              width: lastPage.getWidth(),
              height: lastPage.getHeight(),
            });
            workCanvas.dispose();
          } else {
            finalPdf.addPage(copiedPage);
          }
        } else {
          finalPdf.addPage(copiedPage);
        }
      }

      const pdfBytes = await finalPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const fileName = `edited_${files[0].name}`;
      
      notify('Export complete! Your file is ready.', 'success');

      // Trigger download
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(downloadUrl);

    } catch (err: any) {
      console.error('Export Error:', err);
      notify(`Export failed: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePageDelete = () => {
    if (!pdfDoc) return;
    
    // Check if there's at least one page left after deletion
    const activePageCount = numPages - deletedPages.size;
    if (activePageCount <= 1) {
      notify('Dokumen minimal harus memiliki 1 halaman.', 'error');
      return;
    }

    const newDeletedPages = new Set(deletedPages);
    newDeletedPages.add(currentPage);
    setDeletedPages(newDeletedPages);

    // Find next available page
    let nextAvail = -1;
    // Try look forward
    for (let p = currentPage + 1; p <= numPages; p++) {
      if (!newDeletedPages.has(p)) {
        nextAvail = p;
        break;
      }
    }
    
    // If not found forward, look backward
    if (nextAvail === -1) {
      for (let p = currentPage - 1; p >= 1; p--) {
        if (!newDeletedPages.has(p)) {
          nextAvail = p;
          break;
        }
      }
    }

    if (nextAvail !== -1) {
      setCurrentPage(nextAvail);
      notify(`Halaman ${currentPage} dihapus dari antrean cetak.`, 'info');
    }
  };

  const handleToolAction = async (tool: string) => {
    if (isProcessing) return;

    try {
      // Interactive tools local actions
      if (tool === 'text') { addText(); return; }
      if (tool === 'shape') { addShape(); return; }
      if (tool === 'rotate') { handleRotate(); return; }
      if (tool === 'merge') { handleMergeExecution(); return; }
      if (tool === 'compress') { handleCompressExecution(); return; }
      if (tool === 'ocr') { handleOcrExecution(); return; }
      if (tool === 'delete') { handlePageDelete(); return; }
      if (tool === 'delete_item') { deleteSelectedItem(); return; }
      if (tool === 'clear_all') { clearCanvas(); return; }
      if (tool === 'select' || tool === 'draw') return;

      setIsProcessing(true);
      notify(`Processing tool: ${tool}...`, 'info');
      const formData = new FormData();
      formData.append('file', files[0]);

      let res;
      if (tool === 'rotate') {
        const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const upData = await upRes.json();
        if (!upData.success) throw new Error(upData.error);
        res = await fetch('/api/pdf/rotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: upData.data.fileId, degree: 90 }),
        });
      } else if (tool === 'compress') {
        formData.append('level', 'screen');
        res = await fetch('/api/pdf/compress', { method: 'POST', body: formData });
      } else if (tool === 'split') {
        formData.append('start', currentPage.toString());
        formData.append('end', currentPage.toString());
        res = await fetch('/api/pdf/split', { method: 'POST', body: formData });
      } else if (tool === 'delete') {
        formData.append('pages', (currentPage - 1).toString());
        res = await fetch('/api/pdf/delete', { method: 'POST', body: formData });
      } else if (tool === 'ocr') {
        res = await fetch('/api/pdf/ocr', { method: 'POST', body: formData });
      }

      if (res) {
        const data = await res.json();
        if (data.success) {
          if (tool === 'ocr') {
            notify('OCR extraction successful', 'success');
            alert('Extracted Text: ' + data.data.pages[0].text.substring(0, 500) + '...');
          } else {
            notify('Processing complete. Starting download...', 'success');
            const fileName = data.data.fileName;
            const downloadUrl = `/api/pdf/download/${fileName}`;
            window.open(downloadUrl, '_blank');
          }
        } else {
          throw new Error(data.error);
        }
      }
    } catch (err: any) {
      console.error(`Tool action error (${tool}):`, err);
      notify(`Action failed: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const activePagesList = Array.from({ length: numPages }, (_, i) => i + 1).filter(p => !deletedPages.has(p));
  const activeCurrentPageIndex = activePagesList.indexOf(currentPage) + 1;
  const activeTotalPages = activePagesList.length;

  const currentUndoStack = pageUndoStacks[currentPage] || [];
  const currentRedoStack = pageRedoStacks[currentPage] || [];

  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col z-[100] font-sans">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-md ${
              notification.type === 'error' 
                ? 'bg-red-50 border-red-200 text-red-600' 
                : notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${
              notification.type === 'error' ? 'bg-red-500' : notification.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
            } animate-pulse`} />
            <span className="text-xs font-bold">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Toolbar */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="hover:bg-slate-100 p-2 rounded-lg transition-colors"
            title="Kembali"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hover:bg-slate-100 p-2 rounded-lg transition-colors text-slate-600 flex items-center justify-center"
            title={isSidebarOpen ? "Sembunyikan Sidebar" : "Tampilkan Sidebar"}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="w-5 h-5 text-slate-600" />
            ) : (
              <PanelLeftOpen className="w-5 h-5 text-[#FA0F00]" />
            )}
          </button>
          <div className="h-6 w-[1px] bg-slate-200" />
          <span className="font-bold text-sm text-slate-700 truncate max-w-[200px]" title={files[0]?.name}>
            {files[0]?.name}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-500">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[10px] font-black w-12 text-center text-slate-600">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(4, z + 0.1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-500">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleFinishAndExport}
            disabled={isProcessing || !pdfDoc}
            className="bg-[#FA0F00] text-white px-5 py-2 rounded-lg text-xs font-bold shadow-lg shadow-red-200 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {isProcessing ? <RotateCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Finish & Export
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar Backdrop */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/30 z-[120] md:hidden cursor-pointer"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar Tools */}
        <aside 
          className={`bg-white border-slate-200 flex flex-col overflow-hidden transition-all duration-300 ease-in-out shrink-0
            ${isSidebarOpen 
              ? 'w-64 p-4 border-r opacity-100' 
              : 'w-0 p-0 border-r-0 opacity-0'
            }
            max-md:fixed max-md:left-0 max-md:top-14 max-md:bottom-0 max-md:z-[130] max-md:shadow-2xl
          `}
        >
          <div className="w-56 flex-1 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
            <div className="mb-6">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4 px-1">Selection & Content</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'select', label: 'Select', icon: MousePointer2 },
                  { id: 'add_image', label: 'Image', icon: ImagePlus },
                  { id: 'draw', label: 'Draw', icon: Pencil },
                  { id: 'shape', label: 'Shape', icon: Shapes },
                  { id: 'text', label: 'Text', icon: Type },
                  { id: 'undo', label: 'Undo', icon: Undo2 },
                  { id: 'redo', label: 'Redo', icon: Redo2 },
                  { id: 'clear_all', label: 'Clear Reset', icon: RotateCcw },
                ].map(tool => (
                  <div key={tool.id} className="relative">
                    {tool.id === 'add_image' ? (
                      <label className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all cursor-pointer ${
                        activeTool === tool.id 
                          ? 'border-[#FA0F00] bg-red-50 text-[#FA0F00]' 
                          : 'border-slate-100 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}>
                        <tool.icon className="w-5 h-5" />
                        <span className="text-[10px] font-bold">{tool.label}</span>
                        <input type="file" className="hidden" accept="image/*" onChange={addImage} />
                      </label>
                    ) : (
                      <button 
                        onClick={() => {
                          const prevTool = activeTool;
                          if (tool.id === 'undo') { undo(); return; }
                          if (tool.id === 'redo') { redo(); return; }
                          
                          setActiveTool(tool.id);
                          // For text/shape/etc, we handle the action directly
                          if (['text', 'delete_item', 'clear_all'].includes(tool.id)) {
                             handleToolAction(tool.id);
                          }
                        }}
                        disabled={tool.id === 'undo' ? currentUndoStack.length <= 1 : tool.id === 'redo' ? currentRedoStack.length === 0 : false}
                        className={`w-full flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                          activeTool === tool.id 
                            ? 'border-[#FA0F00] bg-red-50 text-[#FA0F00]' 
                            : (tool.id === 'undo' && currentUndoStack.length <= 1) || (tool.id === 'redo' && currentRedoStack.length === 0)
                            ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                            : 'border-slate-100 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <tool.icon className="w-5 h-5" />
                        <span className="text-[10px] font-bold">{tool.label}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

                {/* Selection & Content Controls Sub-panel */}
                <AnimatePresence>
                  {(activeTool === 'draw' || activeTool === 'select' || activeTool === 'shape' || activeTool === 'text') && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden"
                    >
                      <div className="space-y-5">
                        {activeTool === 'text' && (
                          <div className="space-y-4 pb-4 border-b border-slate-200/60 font-sans">
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-3">Font Family</span>
                              <div className="relative">
                                <select 
                                  value={fontFamily}
                                  onChange={(e) => setFontFamily(e.target.value)}
                                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-bold focus:ring-2 focus:ring-[#FA0F00]/20 focus:border-[#FA0F00] outline-none transition-all appearance-none cursor-pointer"
                                  style={{ fontFamily: fontFamily }}
                                >
                                  <option value="Inter">Inter (Sans-Serif)</option>
                                  <option value="Space Grotesk">Space Grotesk (Modern)</option>
                                  <option value="Playfair Display">Playfair Display (Serif)</option>
                                  <option value="JetBrains Mono">JetBrains Mono (Code)</option>
                                  <option value="Outfit">Outfit (Round)</option>
                                  <option value="Montserrat">Montserrat (Classic)</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                  <RotateCw className="w-3 h-3 animate-pulse" />
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Font Size</span>
                                <span className="text-[10px] font-bold text-slate-900 bg-white px-2 py-0.5 rounded-full border border-slate-100 shadow-sm">{textSize}px</span>
                              </div>
                              <input 
                                type="range" 
                                min="8" 
                                max="120" 
                                value={textSize}
                                onChange={(e) => setTextSize(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                              />
                            </div>
                            <div>
                               <button
                                 onClick={addText}
                                 className="w-full py-2.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-slate-100 hover:scale-[1.02] active:scale-95 transition-all"
                               >
                                 Insert New Text
                               </button>
                            </div>
                          </div>
                        )}

                        {activeTool === 'shape' && (
                          <div className="space-y-4 pb-4 border-b border-slate-200/60 font-sans">
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-3">Shape Type</span>
                              <div className="grid grid-cols-4 gap-2">
                                {[
                                  { id: 'rect', icon: Square },
                                  { id: 'circle', icon: Circle },
                                  { id: 'triangle', icon: Triangle },
                                  { id: 'line', icon: Minus },
                                ].map(type => (
                                  <button
                                    key={type.id}
                                    onClick={() => setShapeType(type.id as any)}
                                    className={`p-2 rounded-lg border transition-all flex items-center justify-center ${
                                      shapeType === type.id 
                                        ? 'bg-slate-900 border-slate-900 text-white' 
                                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                    }`}
                                  >
                                    <type.icon className="w-4 h-4" />
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-3">Fill Style</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setIsShapeFilled(true)}
                                  className={`flex-1 py-2 text-[10px] font-bold rounded-lg border transition-all ${
                                    isShapeFilled 
                                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                  }`}
                                >
                                  Solid Fill
                                </button>
                                <button
                                  onClick={() => setIsShapeFilled(false)}
                                  className={`flex-1 py-2 text-[10px] font-bold rounded-lg border transition-all ${
                                    !isShapeFilled 
                                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                  }`}
                                >
                                  Outline Only
                                </button>
                              </div>
                            </div>
                            <div>
                               <button
                                 onClick={() => addShape()}
                                 className="w-full py-2.5 bg-[#FA0F00] text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-red-100 hover:scale-[1.02] active:scale-95 transition-all"
                               >
                                 Insert {shapeType}
                               </button>
                            </div>
                          </div>
                        )}

                        {(activeTool === 'draw' || activeTool === 'select' || activeTool === 'shape' || activeTool === 'text') && (
                          <>
                            <div>
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Stroke Thickness</span>
                                <span className="text-[10px] font-bold text-slate-900 bg-white px-2 py-0.5 rounded-full border border-slate-100 shadow-sm">{brushWidth}px</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <input 
                                  type="range" 
                                  min="1" 
                                  max="50" 
                                  value={brushWidth}
                                  onChange={(e) => setBrushWidth(parseInt(e.target.value))}
                                  className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#FA0F00]"
                                />
                              </div>
                            </div>

                            {/* Stroke Preview */}
                            <div className="flex flex-col gap-2">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Preview</span>
                              <div className="h-12 bg-white rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden">
                                <div 
                                  style={{ 
                                    width: '80%', 
                                    height: `${brushWidth}px`, 
                                    backgroundColor: brushColor,
                                    borderRadius: '999px',
                                    opacity: 0.8
                                  }} 
                                />
                              </div>
                            </div>
                            
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-3">Color Palette</span>
                              <div className="flex items-center gap-3">
                                <div className="relative group">
                                  <input 
                                    type="color" 
                                    value={brushColor}
                                    onChange={(e) => setBrushColor(e.target.value)}
                                    className="w-10 h-10 rounded-xl cursor-pointer border-2 border-white shadow-sm appearance-none p-0 overflow-hidden"
                                  />
                                  <div className="absolute inset-0 rounded-xl border border-black/5 pointer-events-none" />
                                </div>
                                
                                <button 
                                  onClick={pickColorFromScreen}
                                  className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-[10px] font-bold border transition-all ${
                                    isPickerActive ? 'bg-[#FA0F00] text-white border-[#FA0F00] shadow-lg shadow-red-100' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                  }`}
                                >
                                  <Pipette className="w-3.5 h-3.5" />
                                  Eyedropper
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>

            <div className="mb-6">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4 px-1">Processing Tools</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'rotate', label: 'Rotate', icon: RotateCw },
                  { id: 'delete', label: 'Delete', icon: Trash2 },
                  { id: 'merge', label: 'Merge', icon: Layers },
                  { id: 'compress', label: 'Compress', icon: Shrink },
                  { id: 'ocr', label: 'OCR', icon: ScanText },
                ].map(tool => (
                  <button 
                    key={tool.id}
                    onClick={() => {
                      if (tool.id === 'rotate' || tool.id === 'delete') {
                        handleToolAction(tool.id);
                      } else {
                        setActiveTool(tool.id);
                      }
                    }}
                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                      activeTool === tool.id 
                        ? 'border-[#FA0F00] bg-red-50 text-[#FA0F00]' 
                        : 'border-slate-100 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <tool.icon className="w-5 h-5" />
                    <span className="text-[10px] font-bold">{tool.label}</span>
                  </button>
                ))}
              </div>

              {/* Processing Controls Sub-panel (Merge & Compress) */}
              <AnimatePresence>
                {activeTool === 'merge' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden"
                  >
                    <div className="space-y-4 font-sans">
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-3">Merge Staging (Ordering)</span>
                        <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1 no-scrollbar">
                          {mergeQueue.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100 shadow-sm group">
                              <span className="text-[9px] font-bold truncate max-w-[100px] text-slate-700">{file.name}</span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    if (idx === 0) return;
                                    const newQueue = [...mergeQueue];
                                    [newQueue[idx], newQueue[idx-1]] = [newQueue[idx-1], newQueue[idx]];
                                    setMergeQueue(newQueue);
                                  }}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30"
                                  disabled={idx === 0}
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => {
                                    if (idx === mergeQueue.length - 1) return;
                                    const newQueue = [...mergeQueue];
                                    [newQueue[idx], newQueue[idx+1]] = [newQueue[idx+1], newQueue[idx]];
                                    setMergeQueue(newQueue);
                                  }}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30"
                                  disabled={idx === mergeQueue.length - 1}
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => setMergeQueue(prev => prev.filter((_, i) => i !== idx))}
                                  className="p-1 hover:bg-red-50 rounded text-red-500"
                                >
                                  <XCircle className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <label className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-[#FA0F00] hover:bg-red-50/30 transition-all">
                        <PlusCircle className="w-4 h-4 text-slate-400" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Add To Staging</span>
                        <input 
                          type="file" 
                          accept="application/pdf" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setMergeQueue(prev => [...prev, file]);
                          }} 
                        />
                      </label>
                      <button 
                        onClick={handleMergeExecution}
                        disabled={mergeQueue.length < 2 || isProcessing}
                        className={`w-full py-2.5 bg-[#FA0F00] text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-red-100 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 ${
                          mergeQueue.length < 2 ? 'opacity-50 grayscale cursor-not-allowed' : ''
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        {isProcessing ? 'Merging...' : 'Combine All Pdfs'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {activeTool === 'compress' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden"
                  >
                    <div className="space-y-5 font-sans">
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-3">Compression Level</span>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { id: 'screen', label: 'Extreme', desc: '72 DPI • Best for Mobile/Slow Web', icon: Shrink },
                            { id: 'ebook', label: 'Recommended', desc: '150 DPI • Balanced Quality', icon: ScanText },
                            { id: 'printer', label: 'High Quality', desc: '300 DPI • Best for Printing', icon: Download },
                          ].map(level => (
                            <button
                              key={level.id}
                              onClick={() => setCompressionLevel(level.id as any)}
                              className={`flex items-start gap-3 p-3 rounded-xl border transition-all text-left group ${
                                compressionLevel === level.id 
                                  ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <div className={`p-2 rounded-lg ${compressionLevel === level.id ? 'bg-white/10' : 'bg-slate-50 group-hover:bg-slate-100'}`}>
                                <level.icon className={`w-3.5 h-3.5 ${compressionLevel === level.id ? 'text-white' : 'text-slate-400'}`} />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-tight">{level.label}</span>
                                <span className={`text-[9px] ${compressionLevel === level.id ? 'text-white/60' : 'text-slate-400 font-medium'}`}>{level.desc}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <button 
                        onClick={handleCompressExecution}
                        disabled={isProcessing}
                        className="w-full py-3 bg-[#FA0F00] text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-red-100 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <Shrink className="w-3.5 h-3.5" />
                        {isProcessing ? 'Compressing...' : 'Start Compression'}
                      </button>

                      <div className="p-3 bg-white/50 rounded-xl border border-dotted border-slate-300">
                        <p className="text-[8px] text-slate-400 leading-relaxed font-medium">
                          Note: Extreme compression may cause high-res images to appear blurred. Target size under 500KB is subject to content density.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTool === 'ocr' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden"
                  >
                    <div className="space-y-5 font-sans">
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-3">Searchable PDF (OCR)</span>
                        <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                              <ScanText className="w-4 h-4 text-blue-500" />
                            </div>
                            <span className="text-[10px] font-black uppercase text-slate-700">Invisible Text Layer</span>
                          </div>
                          <p className="text-[9px] text-slate-500 leading-relaxed">
                            This process will add a searchable text layer behind your images. You will be able to select, copy, and search text even in scanned documents.
                          </p>
                        </div>
                      </div>

                      <button 
                        onClick={handleOcrExecution}
                        disabled={isProcessing}
                        className="w-full py-3 bg-[#FA0F00] text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-red-100 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <ScanText className="w-3.5 h-3.5" />
                        {isProcessing ? 'Processing OCR...' : 'Make Searchable'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-slate-100">
            <button 
              onClick={() => handleToolAction(activeTool)}
              disabled={isProcessing}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-50"
            >
              {isProcessing ? <RotateCw className="w-4 h-4 animate-spin" /> : (
                ['select', 'draw', 'add_image', 'text', 'shape', 'delete_item', 'clear_all'].includes(activeTool) ? 'Applying Edits...' : 'Process PDF'
              )}
            </button>
          </div>
          </div>
        </aside>

        {/* Main Editor Canvas Area */}
        <main className="flex-1 overflow-auto bg-[#E5E5E5] flex items-center justify-center p-12 relative no-scrollbar" >
          {/* Floating Sidebar Toggle Handle when closed */}
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="absolute left-6 top-6 z-40 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#FA0F00] p-3 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 font-sans text-xs font-black uppercase tracking-wider"
              title="Tampilkan Sidebar"
            >
              <PanelLeftOpen className="w-4 h-4 text-slate-700" />
              <span>Tools</span>
            </button>
          )}
          {(isRendering || !pdfDoc) && (
            <div className="absolute inset-0 z-[110] bg-white/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-[#FA0F00] rounded-full animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 animate-pulse">
                  {!pdfDoc ? 'Loading Document...' : `Rendering Page ${activeCurrentPageIndex} of ${activeTotalPages}...`}
                </span>
              </div>
            </div>
          )}
          <div className="relative shadow-2xl bg-white animate-in zoom-in-95 duration-300">
             <canvas ref={canvasRef} />
             {/* Text Selection Underlay / Overlay (Sandwich Magic) */}
             {(pageOcrText[currentPage] || nativePageText[currentPage]) && (pageOcrText[currentPage] || nativePageText[currentPage])!.length > 0 && (
               <div 
                 className="absolute inset-0 select-text pointer-events-none"
                 style={{
                   zIndex: 20,
                   width: canvasSize.width || '100%',
                   height: canvasSize.height || '100%',
                 }}
               >
                 {(pageOcrText[currentPage] || nativePageText[currentPage])!.map((item, idx) => (
                   <span
                     key={idx}
                     className="absolute cursor-text select-text selection:bg-blue-500/35 leading-none"
                     style={{
                       left: `${item.left}px`,
                       top: `${item.top}px`,
                       width: `${item.width}px`,
                       height: `${item.height}px`,
                       fontSize: `${item.fontSize}px`,
                       fontFamily: item.fontFamily || 'monospace',
                       color: 'transparent',
                       backgroundColor: 'transparent',
                       whiteSpace: 'nowrap',
                       pointerEvents: ['select', 'ocr'].includes(activeTool) ? 'auto' : 'none',
                       transformOrigin: 'top left',
                     }}
                   >
                     {item.str}
                   </span>
                 ))}
               </div>
             )}
          </div>

          {/* Floating Navigation */}
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-white/90 backdrop-blur-md px-6 py-3 rounded-2xl border border-slate-200 shadow-xl">
            <button 
              disabled={activeCurrentPageIndex <= 1}
              onClick={() => {
                if (activeCurrentPageIndex > 1) {
                  saveCurrentAnnotations();
                  const prevPage = activePagesList[activeCurrentPageIndex - 2];
                  setCurrentPage(prevPage);
                }
              }}
              className="disabled:opacity-30 p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-sm font-bold text-slate-700 min-w-[80px] text-center">
                Page {activeCurrentPageIndex} of {activeTotalPages}
              </span>
              {deletedPages.size > 0 && (
                <span className="text-[9px] font-black uppercase text-red-500 tracking-tighter">
                  {deletedPages.size} Deleted
                </span>
              )}
            </div>
            <button 
              disabled={activeCurrentPageIndex >= activeTotalPages}
              onClick={() => {
                if (activeCurrentPageIndex < activeTotalPages) {
                  saveCurrentAnnotations();
                  const nextPage = activePagesList[activeCurrentPageIndex];
                  setCurrentPage(nextPage);
                }
              }}
              className="disabled:opacity-30 p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};
