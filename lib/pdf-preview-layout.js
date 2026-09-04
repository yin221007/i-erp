export const PDF_MIN_ZOOM = 0.75;
export const PDF_MAX_ZOOM = 2.5;

export const clampPdfZoom = value => {
  const normalized = Number.isFinite(value) ? value : 1;
  return Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, normalized));
};

export const getPdfPageScale = ({
  pageWidth,
  pageHeight,
  availableWidth,
  availableHeight,
  fitMode = 'page',
  zoom = 1
}) => {
  const dimensions = [pageWidth, pageHeight, availableWidth, availableHeight];
  if (!dimensions.every(value => Number.isFinite(value) && value > 0)) return 1;

  const widthScale = Math.min(2, availableWidth / pageWidth);
  const baseScale = fitMode === 'width'
    ? widthScale
    : Math.min(widthScale, availableHeight / pageHeight);

  return baseScale * clampPdfZoom(zoom);
};

export const selectMostVisiblePdfPage = (entries, fallbackPage = 1) => {
  let selectedPage = fallbackPage;
  let selectedRatio = -1;

  for (const entry of entries) {
    if (!Number.isInteger(entry?.pageNumber) || entry.pageNumber < 1) continue;
    if (!Number.isFinite(entry?.intersectionRatio) || entry.intersectionRatio < 0) continue;
    if (entry.intersectionRatio > selectedRatio) {
      selectedPage = entry.pageNumber;
      selectedRatio = entry.intersectionRatio;
    }
  }

  return selectedPage;
};
