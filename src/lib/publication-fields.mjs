/** Consolidate legacy DOI/publisher destinations into one editable paper URL. */
export function publicationFields(row) {
  if (row.type || row.journal !== undefined || row.booktitle !== undefined) {
    const doi = row.doi?.trim();
    const link = doi ? (/^https?:\/\//i.test(doi) ? doi : `https://doi.org/${doi}`) : row.url || row.ee || row.link;
    return {...row, ...(link ? {link} : {})};
  }
  const {doi,links,link,...rest}=row;
  const doiUrl=doi?.trim() ? (/^https?:\/\//i.test(doi.trim()) ? doi.trim() : `https://doi.org/${doi.trim()}`) : undefined;
  const destination=link || doiUrl || links?.find(item=>item.label==='DOI')?.url || links?.find(item=>item.label==='出版資訊')?.url;
  return {...rest,...(destination ? {link:destination} : {})};
}

/** Assemble display text at render time, keeping the stored journal fields separate. */
export function publicationDisplay(row) {
  const data = publicationFields(row);
  const authors = Array.isArray(data.authors) ? data.authors.join(' and ') : data.authors;
  const sourceVenue = data.venue ?? '';
  const indexes = data.indexes ?? [...new Set([...sourceVenue.matchAll(/\((SCIE|SSCI|ESCI|SCI|EI)\)/gi)].map(m => m[1].toUpperCase()))];
  const stripIndexes = value => value.replace(/,?\s*\((?:SCIE|SSCI|ESCI|SCI|EI)\)/gi, '').trim();
  const venue = data.type || data.journal !== undefined || data.booktitle !== undefined ? [
    data.journal || data.booktitle || data.howPublished,
    data.editors?.length && `edited by ${data.editors.join(' and ')}`,
    data.series, data.volume && `vol. ${data.volume}`, data.issue && `no. ${data.issue}`,
    data.pages && `pp. ${data.pages}`,
    data.type !== 'journal' && data.publisher,
    data.type !== 'journal' && (data.location || data.address),
    data.eventDate || data.month, data.year, stripIndexes(data.note ?? ''),
  ].filter(Boolean).join(', ') : stripIndexes(sourceVenue);
  const doi = data.doi || data.link?.match(/^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i)?.[1];
  return {data, authors, indexes, venue, doi};
}
