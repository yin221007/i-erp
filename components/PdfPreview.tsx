import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { APP_VERSION } from '../lib/version';

GlobalWorkerOptions.workerSrc = `${pdfWorkerUrl}?v=${APP_VERSION}`;

interface PdfPreviewProps {
  src: string;
  title: string;
}

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

const getPreviewErrorMessage = (error: unknown) => {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return '该 PDF 已加密，请下载后使用密码打开';
  if (name === 'InvalidPDFException') return 'PDF 文件格式异常，无法在线预览';
  if (name === 'MissingPDFException') return 'PDF 文件不存在或已被移除';
  return 'PDF 加载失败，请检查网络后重试，或直接下载查看';
};

const PdfPreview: React.FC<PdfPreviewProps> = ({ src, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSequenceRef = useRef(0);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateWidth = () => setContainerWidth(container.clientWidth);
    updateWidth();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateWidth);
    observer?.observe(container);
    window.addEventListener('resize', updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setDocument(null);
    setPageNumber(1);
    setZoom(1);
    setErrorMessage('');
    setIsLoading(true);

    try {
      loadingTask = getDocument({
        url: src,
        withCredentials: true,
        isEvalSupported: false,
        useSystemFonts: true
      });
      void loadingTask.promise.then(pdf => {
        if (disposed) {
          void pdf.destroy();
          return;
        }
        setDocument(pdf);
        setIsLoading(false);
      }).catch(error => {
        if (disposed) return;
        setErrorMessage(getPreviewErrorMessage(error));
        setIsLoading(false);
      });
    } catch (error) {
      setErrorMessage(getPreviewErrorMessage(error));
      setIsLoading(false);
    }

    return () => {
      disposed = true;
      renderSequenceRef.current += 1;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [src, retryKey]);

  useEffect(() => {
    if (!document || !containerWidth || !canvasRef.current) return undefined;

    const sequence = renderSequenceRef.current + 1;
    renderSequenceRef.current = sequence;
    let renderTask: RenderTask | null = null;
    let cancelled = false;

    const renderPage = async () => {
      setIsRendering(true);
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled || renderSequenceRef.current !== sequence) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, containerWidth - 24);
        const fitScale = Math.min(2, availableWidth / baseViewport.width);
        const cssViewport = page.getViewport({ scale: fitScale * zoom });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: fitScale * zoom * pixelRatio });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        renderTask = page.render({
          canvas,
          viewport: renderViewport,
          background: '#ffffff'
        });
        await renderTask.promise;
        page.cleanup();
      } catch (error) {
        if (cancelled || (error instanceof Error && error.name === 'RenderingCancelledException')) return;
        setErrorMessage(getPreviewErrorMessage(error));
      } finally {
        if (!cancelled && renderSequenceRef.current === sequence) setIsRendering(false);
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, document, pageNumber, zoom]);

  const pageCount = document?.numPages || 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-slate-200 shadow-xl dark:bg-slate-950" aria-label={`${title} PDF 预览`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 sm:px-4">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setZoom(value => Math.max(MIN_ZOOM, value - ZOOM_STEP))} disabled={!document || zoom <= MIN_ZOOM} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" aria-label="缩小 PDF"><ZoomOut className="h-4 w-4" /></button>
          <span className="min-w-12 text-center text-[10px] font-black text-slate-500">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(value => Math.min(MAX_ZOOM, value + ZOOM_STEP))} disabled={!document || zoom >= MAX_ZOOM} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" aria-label="放大 PDF"><ZoomIn className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPageNumber(value => Math.max(1, value - 1))} disabled={!document || pageNumber <= 1} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" aria-label="上一页"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-16 text-center text-[10px] font-black text-slate-600 dark:text-slate-300">{pageCount ? `${pageNumber} / ${pageCount}` : '- / -'}</span>
          <button type="button" onClick={() => setPageNumber(value => Math.min(pageCount, value + 1))} disabled={!document || pageNumber >= pageCount} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" aria-label="下一页"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto p-2 sm:p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        {(isLoading || isRendering) && !errorMessage && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-100/75 backdrop-blur-[1px] dark:bg-slate-900/75">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-600 shadow-lg dark:bg-slate-800 dark:text-slate-200"><Loader2 className="h-5 w-5 animate-spin text-primary-600" />{isLoading ? '正在加载 PDF' : '正在绘制页面'}</div>
          </div>
        )}

        {errorMessage ? (
          <div className="flex min-h-full items-center justify-center p-5 text-center">
            <div className="max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-800">
              <AlertCircle className="mx-auto h-10 w-10 text-orange-500" />
              <p className="mt-4 text-sm font-black text-slate-800 dark:text-white">{errorMessage}</p>
              <button type="button" onClick={() => setRetryKey(value => value + 1)} className="mx-auto mt-5 flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-xs font-black text-white hover:bg-primary-700"><RefreshCw className="h-4 w-4" />重新加载</button>
            </div>
          </div>
        ) : (
          <canvas ref={canvasRef} className="mx-auto block max-w-none rounded-sm bg-white shadow-lg" aria-label={`${title} 第 ${pageNumber} 页`} />
        )}
      </div>
    </div>
  );
};

export default PdfPreview;
