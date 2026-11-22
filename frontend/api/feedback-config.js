export const config = { runtime: 'edge' };

function firstValue(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return '';
}

export default function handler() {
  return Response.json(
    {
      publicKey: firstValue(['EMAILJS_PUBLIC_KEY', 'VITE_EMAILJS_PUBLIC_KEY']),
      serviceId: firstValue(['EMAILJS_SERVICE_ID', 'VITE_EMAILJS_SERVICE_ID']),
      templateId: firstValue(['EMAILJS_TEMPLATE_ID', 'VITE_EMAILJS_TEMPLATE_ID']),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
