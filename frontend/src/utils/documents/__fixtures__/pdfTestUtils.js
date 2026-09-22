export const dumpPages = (doc) =>
  Array.from({ length: doc.getNumberOfPages() }, (_, index) =>
    (doc.internal.pages[index + 1] || []).join('\n'));
export const allText = (doc) => dumpPages(doc).join('\n');
