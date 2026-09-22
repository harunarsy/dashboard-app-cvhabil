// Palet monokrom print-first (spec §4) — tanpa aksen berwarna, tanpa gradient.
export const MONO = {
  ink: [17, 17, 17],
  sub: [90, 90, 90],
  faint: [150, 150, 150],
  rule: [190, 190, 190],
  headFill: [232, 232, 232],
  zebra: [248, 248, 248],
  white: [255, 255, 255],
};

// Profil per ukuran kertas. A5/A6 diisi Task 8/9 dengan bentuk kontrak yang sama.
export const DOCUMENT_PROFILES = {
  A4: {
    paper: 'a4',
    orientation: 'p',
    margin: 12,
    baseFontSize: 10,
    titleFontSize: 14,
    tableCellPadding: 1.8,
    showParties2Col: true,
    maxProcurementRefs: Infinity,
    batchMetaMode: 'always',
    showTaxRef: true,
    signatureCount: 3,
    recommendedItems: 12,
  },
};
