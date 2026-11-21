export function* parseCsvRows(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) yield row;
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value.length > 0)) yield row;
}

export function parseCsv(text) {
  const rows = [...parseCsvRows(text)];
  const headers = rows.shift();
  if (!headers) return [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [
    header.trim(),
    values[index]?.trim() ?? '',
  ])));
}
