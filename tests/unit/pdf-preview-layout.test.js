import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampPdfZoom,
  getPdfPageScale,
  selectMostVisiblePdfPage
} from '../../lib/pdf-preview-layout.js';

test('PDF page scale fits the whole page inside the viewport by default', () => {
  assert.equal(
    getPdfPageScale({
      pageWidth: 600,
      pageHeight: 800,
      availableWidth: 900,
      availableHeight: 700,
      fitMode: 'page',
      zoom: 1
    }),
    0.875
  );
});

test('PDF page scale can fit width and apply relative zoom', () => {
  assert.equal(
    getPdfPageScale({
      pageWidth: 600,
      pageHeight: 800,
      availableWidth: 900,
      availableHeight: 700,
      fitMode: 'width',
      zoom: 1.25
    }),
    1.875
  );
});

test('PDF zoom stays within the supported range', () => {
  assert.equal(clampPdfZoom(0.2), 0.75);
  assert.equal(clampPdfZoom(1.25), 1.25);
  assert.equal(clampPdfZoom(8), 2.5);
});

test('current PDF page follows the page with the largest visible ratio', () => {
  assert.equal(
    selectMostVisiblePdfPage([
      { pageNumber: 2, intersectionRatio: 0.25 },
      { pageNumber: 3, intersectionRatio: 0.8 },
      { pageNumber: 4, intersectionRatio: 0.4 }
    ], 2),
    3
  );
  assert.equal(selectMostVisiblePdfPage([], 5), 5);
});
