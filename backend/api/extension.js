import { createNodeHandler } from '../server/http-node.js';
import { extensionApi } from '../server/services/extension.js';
export default createNodeHandler(extensionApi, () => process.env, {
  maxBodyBytes: 1100000, errorMessage: 'Could not complete the extension check.',
});
