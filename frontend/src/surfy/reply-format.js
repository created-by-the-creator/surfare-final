// Presentation only: keep every finding and caveat, without rendering provider HTML.
export function formatSurfyReply(value, language = 'en') {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { lead: '', points: [] };
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/u);
    if (!line) { flush(); continue; }
    if (bullet) { flush(); blocks.push({ type: 'bullet', text: bullet[1] }); }
    else if (/^\s{2,}\S/.test(raw) && blocks.at(-1)?.type === 'bullet' && !paragraph.length) blocks.at(-1).text += ` ${line}`;
    else paragraph.push(line.replace(/^#{1,6}\s+/, ''));
  }
  flush();
  let segmenter;
  try { if (typeof Intl.Segmenter === 'function') segmenter = new Intl.Segmenter(language, { granularity: 'sentence' }); } catch { /* Keep whole text if locale is unsupported. */ }
  const sentences = text => segmenter ? [...segmenter.segment(text)].map(item => item.segment.trim()).filter(Boolean) : [text];
  const points = [];
  let lead = '';
  blocks.forEach((block, index) => {
    if (block.type === 'bullet') points.push(block.text);
    else {
      const parts = sentences(block.text);
      if (index === 0) lead = parts.shift() || '';
      points.push(...parts);
    }
  });
  return { lead, points };
}
