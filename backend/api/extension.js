import { createNodeHandler } from '../server/http-node.js';
import { extensionApi } from '../server/services/extension.js';
import { createQrPublicTransport } from '../server/qr-public-transport.js';
const qrTransport = createQrPublicTransport();
export default createNodeHandler((request, env) => extensionApi(request, env, fetch, qrTransport), () => process.env, {
  maxBodyBytes: 1100000, errorMessage: 'Could not complete the extension check.',
});
