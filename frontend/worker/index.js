// URL lookups have been removed, including for previously deployed clients.
export default { fetch() { return Response.json({ unavailable: true, matched: false }, { status: 410 }); } };
