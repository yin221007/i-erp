import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  clampPdfZoom,
  getPdfPageScale,
  selectMostVisiblePdfPage,
  type PdfFitMode
} from '../lib/pdf-preview-layout.js';
import { APP_VERSION } from '../lib/version';

GlobalWorkerOptions.workerSrc = `${pdfWorkerUrl}?v=${APP_VERSION}`;

interface PdfPreviewProps {
  src: string;
  title: string;
}

interface PdfPageCanvasProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  scrollRoot: HTMLDivElement | null;
  containerWidth: number;
  containerHeight: number;
  fitMode: PdfFitMode;
  zoom: number;
  title: string;
}

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;
const DEFAULT_PAGE_WIDTH = 595;
const DEFAULT_PAGE_HEIGHT = 842;
const MAX_CANVAS_DIMENSION = 4096;
const MAX_CANVAS_PIXELS = 16_000_000;

const getPreviewErrorMessage = (error: unknown) => {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return '该 PDF 已加密，请下载后使用密码打开';
  if (name === 'InvalidPDFException') return 'PDF 文件格式异常，无法在线预览';
  if (name === 'MissingPDFException') return 'PDF 文件不存在或已被移除';
  return 'PDF 加载失败，请检查网络后重试，或直接下载查看';
};

const getCanvasPixelRatio = (width: number, height: number) => {
  const deviceRatio = Math.min(window.devicePixelRatio || 1, 2);
  const dimensionRatio = Math.min(
    MAX_CANVAS_DIMENSION / Math.max(1, width),
    MAX_CANVAS_DIMENSION / Math.max(1, height)
  );
  const pixelRatio = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height));
  return Math.max(0.1, Math.min(deviceRatio, dimensionRatio, pixelRatio));
};

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  document,
  pageNumber,
  scrollRoot,
  containerWidth,
  containerHeight,
  fitMode,
  zoom,
  title
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSequenceRef = useRef(0);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [pageRetryKey, setPageRetryKey] = useState(0);

  const availableWidth = Math.max(1, containerWidth - 24);
  const availableHeight = Math.max(1, containerHeight - 24);
  const baseViewport = page?.getViewport({ scale: 1 });
  const pageWidth = baseViewport?.width || DEFAULT_PAGE_WIDTH;
  const pageHeight = baseViewport?.height || DEFAULT_PAGE_HEIGHT;
  const scale = getPdfPageScale({
    pageWidth,
    pageHeight,
    availableWidth,
    availableHeight,
    fitMode,
    zoom
  });
  const displayWidth = Math.max(1, Math.floor(pageWidth * scale));
  const displayHeight = Math.max(1, Math.floor(pageHeight * scale));

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || shouldRender) return undefined;

    if (typeof IntersectionObserver === 'undefined' || !scrollRoot) {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, {
      root: scrollRoot,
      rootMargin: '125% 0px',
      threshold: 0
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [scrollRoot, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return undefined;

    let disposed = false;
    let loadedPage: PDFPageProxy | null = null;
    setRenderError('');
    void document.getPage(pageNumber).then(nextPage => {
      if (disposed) {
        nextPage.cleanup();
        return;
      }
      loadedPage = nextPage;
      setPage(nextPage);
    }).catch(() => {
      if (!disposed) setRenderError('该页加载失败');
    });

    return () => {
      disposed = true;
      loadedPage?.cleanup();
    };
  }, [document, pageNumber, pageRetryKey, shouldRender]);

  useEffect(() => {
    if (!page || !canvasRef.current) return undefined;

    const sequence = renderSequenceRef.current + 1;
    renderSequenceRef.current = sequence;
    let renderTask: RenderTask | null = null;
    let cancelled = false;

    const renderPage = async () => {
      setIsRendering(true);
      setRenderError('');
      try {
        const cssViewport = page.getViewport({ scale });
        const pixelRatio = getCanvasPixelRatio(cssViewport.width, cssViewport.height);
        const renderViewport = page.getViewport({ scale: scale * pixelRatio });
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
      } catch (error) {
        if (cancelled || (error instanceof Error && error.name === 'RenderingCancelledException')) return;
        setRenderError('该页绘制失败');
      } finally {
        if (!cancelled && renderSequenceRef.current === sequence) setIsRendering(false);
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [page, scale]);

  return (
    <div
      ref={wrapperRef}
      data-pdf-page-number={pageNumber}
      className="relative shrink-0 overflow-hidden rounded-sm bg-white shadow-lg"
      style={{ width: displayWidth, height: displayHeight }}
      aria-label={`${title} 第 ${pageNumber} 页`}
    >
      {shouldRender && !renderError && (
        <canvas
          ref={canvasRef}
          className="block max-w-none bg-white"
          aria-label={`${title} 第 ${pageNumber} 页内容`}
        />
      )}
      {(!shouldRender || isRendering) && !renderError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/85 text-slate-400">
          {shouldRender ? <Loader2 className="h-5 w-5 animate-spin text-primary-600" /> : <span className="text-[10px] font-black">第 {pageNumber} 页</span>}
        </div>
      )}
      {renderError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-4 text-center text-xs font-black text-orange-600">
          <AlertCircle className="h-6 w-6" />
          {renderError}
          <button
            type="button"
            onClick={() => {
              setRenderError('');
              setPage(null);
              setPageRetryKey(value => value + 1);
            }}
            className="rounded-xl bg-primary-600 px-3 py-2 text-[10px] font-black text-white hover:bg-primary-700"
          >
            重试此页
          </button>
        </div>
      )}
    </div>
  );
};

const PdfPreview: React.FC<PdfPreviewProps> = ({ src, title }) => {
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [fitMode, setFitMode] = useState<PdfFitMode>('page');
  const [zoom, setZoom] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    setScrollRoot(node);
  }, []);

  useEffect(() => {
    if (!scrollRoot) return undefined;

    const updateSize = () => {
      setContainerSize({
        width: scrollRoot.clientWidth,
        height: scrollRoot.clientHeight
      });
    };
    updateSize();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateSize);
    observer?.observe(scrollRoot);
    window.addEventListener('resize', updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [scrollRoot]);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setDocument(null);
    setCurrentPage(1);
    setFitMode('page');
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
      if (loadingTask) void loadingTask.destroy();
    };
  }, [src, retryKey]);

  const pageCount = document?.numPages || 0;

  useEffect(() => {
    if (!scrollRoot || !document || typeof IntersectionObserver === 'undefined') return undefined;

    const visibility = new Map<number, number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const pageNumber = Number((entry.target as HTMLElement).dataset.pdfPageNumber);
        if (Number.isInteger(pageNumber)) visibility.set(pageNumber, entry.intersectionRatio);
      });
      setCurrentPage(previous => selectMostVisiblePdfPage(
        Array.from(visibility, ([pageNumber, intersectionRatio]) => ({ pageNumber, intersectionRatio })),
        previous
      ));
    }, {
      root: scrollRoot,
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
    });

    scrollRoot.querySelectorAll<HTMLElement>('[data-pdf-page-number]').forEach(page => observer.observe(page));
    return () => observer.disconnect();
  }, [document, pageCount, scrollRoot]);

  const selectFitMode = (mode: PdfFitMode) => {
    setFitMode(mode);
    setZoom(1);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-slate-200 shadow-xl dark:bg-slate-950" aria-label={`${title} PDF 预览`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-800 sm:px-4">
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setZoom(value => clampPdfZoom(value - ZOOM_STEP))} disabled={!document || zoom <= MIN_ZOOM} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" aria-label="缩小 PDF"><ZoomOut className="h-4 w-4" /></button>
          <span className="min-w-11 text-center text-[10px] font-black text-slate-500">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(value => clampPdfZoom(value + ZOOM_STEP))} disabled={!document || zoom >= MAX_ZOOM} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" aria-label="放大 PDF"><ZoomIn className="h-4 w-4" /></button>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-700" aria-label="PDF 显示方式">
          <button type="button" onClick={() => selectFitMode('page')} disabled={!document} aria-pressed={fitMode === 'page'} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black transition-colors disabled:opacity-30 ${fitMode === 'page' ? 'bg-white text-primary-700 shadow-sm dark:bg-slate-800 dark:text-primary-300' : 'text-slate-500 dark:text-slate-300'}`}>整页</button>
          <button type="button" onClick={() => selectFitMode('width')} disabled={!document} aria-pressed={fitMode === 'width'} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black transition-colors disabled:opacity-30 ${fitMode === 'width' ? 'bg-white text-primary-700 shadow-sm dark:bg-slate-800 dark:text-primary-300' : 'text-slate-500 dark:text-slate-300'}`}>适宽</button>
        </div>

        <span className="min-w-12 text-right text-[10px] font-black text-slate-600 dark:text-slate-300">{pageCount ? `${currentPage} / ${pageCount}` : '- / -'}</span>
      </div>

      <div ref={setContainerRef} className="relative min-h-0 flex-1 overflow-auto p-2 sm:p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        {isLoading && !errorMessage && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/75 backdrop-blur-[1px] dark:bg-slate-900/75">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-600 shadow-lg dark:bg-slate-800 dark:text-slate-200"><Loader2 className="h-5 w-5 animate-spin text-primary-600" />正在加载 PDF</div>
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
        ) : document && containerSize.width > 0 && containerSize.height > 0 ? (
          <div className="flex w-max min-w-full flex-col items-center gap-3 pb-1 sm:gap-5">
            {Array.from({ length: pageCount }, (_, index) => (
              <PdfPageCanvas
                key={index + 1}
                document={document}
                pageNumber={index + 1}
                scrollRoot={scrollRoot}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                fitMode={fitMode}
                zoom={zoom}
                title={title}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PdfPreview;
