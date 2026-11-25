export const config = { runtime: 'edge' };
export default function handler() {
  return Response.json({ unavailable: true, matched: false }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
