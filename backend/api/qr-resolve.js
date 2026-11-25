import { createNodeHandler } from '../server/http-node.js';
import { createQrPublicTransport } from '../server/qr-public-transport.js';
import { qrResolve } from '../server/services/qr-resolve.js';
const transport = createQrPublicTransport();
export default createNodeHandler((request, env) => qrResolve(request, env, transport), () => process.env,
  { maxBodyBytes: 5000, errorMessage: 'Could not resolve the QR destination.' });
