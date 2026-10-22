// -----------------------------------------------------------------------------
// From the answers of the Komga API to the few fields the integration uses.
// Every parser accepts a missing or odd answer and returns something usable:
// a server mid-update must not crash the reading loop.
// -----------------------------------------------------------------------------

const number = (value) =>
  value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Komga ids: short Crockford base32 strings (TSID). */
const ID = /^[0-9A-Za-z]{1,32}$/;
const id = (value) => (typeof value === 'string' && ID.test(value) ? value : null);

/**
 * A date of Komga ("2026-10-22T10:53:03Z", UTC; older servers may omit the Z).
 * @returns {number|null} epoch milliseconds
 */
export function parseDate(value) {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  const zoned = /(Z|[+-]\d\d:?\d\d)$/i.test(raw);
  const at = Date.parse(zoned ? raw : `${raw}Z`);
  return Number.isFinite(at) ? at : null;
}

export function parseLibraries(answer) {
  return (Array.isArray(answer) ? answer : [])
    .map((library) => ({ id: id(library?.id), name: text(library?.name) }))
    .filter((library) => library.id !== null && library.name);
}

const libraryName = (libraries, libraryId) =>
  libraries.find((library) => library.id === libraryId)?.name ?? '';

/** A series (SeriesDto). */
export function parseSeries(entry, libraries = []) {
  const seriesId = id(entry?.id);
  if (seriesId === null) {
    return null;
  }
  const books = Math.max(0, number(entry.booksCount) ?? 0);
  const booksRead = Math.max(0, number(entry.booksReadCount) ?? 0);
  return {
    id: seriesId,
    title: text(entry.metadata?.title) || text(entry.name) || seriesId,
    libraryId: id(entry.libraryId),
    library: libraryName(libraries, entry.libraryId),
    books,
    booksRead,
    finished: books > 0 && booksRead >= books,
    createdAt: parseDate(entry.created),
  };
}

/** A book (BookDto), with the reading progress of the account. */
export function parseBook(entry, libraries = []) {
  const bookId = id(entry?.id);
  if (bookId === null) {
    return null;
  }
  const pages = Math.max(0, number(entry.media?.pagesCount) ?? 0);
  const progress =
    entry.readProgress && typeof entry.readProgress === 'object' ? entry.readProgress : null;
  const page = Math.min(pages || Infinity, Math.max(0, number(progress?.page) ?? 0));
  return {
    id: bookId,
    title: text(entry.metadata?.title) || text(entry.name) || bookId,
    seriesId: id(entry.seriesId),
    series: text(entry.seriesTitle),
    libraryId: id(entry.libraryId),
    library: libraryName(libraries, entry.libraryId),
    pages,
    page,
    progress: pages > 0 ? Math.min(100, Math.round((page / pages) * 100)) : 0,
    completed: progress?.completed === true,
    createdAt: parseDate(entry.created),
    readAt: parseDate(progress?.readDate),
  };
}

export const parseSeriesList = (list, libraries) =>
  (Array.isArray(list) ? list : []).map((entry) => parseSeries(entry, libraries)).filter(Boolean);

export const parseBookList = (list, libraries) =>
  (Array.isArray(list) ? list : []).map((entry) => parseBook(entry, libraries)).filter(Boolean);
