export type PdfFitMode = 'page' | 'width';

export interface PdfPageScaleOptions {
  pageWidth: number;
  pageHeight: number;
  availableWidth: number;
  availableHeight: number;
  fitMode?: PdfFitMode;
  zoom?: number;
}

export interface PdfPageVisibility {
  pageNumber: number;
  intersectionRatio: number;
}

export const PDF_MIN_ZOOM: number;
export const PDF_MAX_ZOOM: number;
export function clampPdfZoom(value: number): number;
export function getPdfPageScale(options: PdfPageScaleOptions): number;
export function selectMostVisiblePdfPage(entries: PdfPageVisibility[], fallbackPage?: number): number;
