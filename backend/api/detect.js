import { createNodeHandler } from '../server/http-node.js';
import { detect } from '../server/services/detect.js';
export default createNodeHandler(
  detect,
  () => process.env,
  { maxBodyBytes: 60000, errorMessage: 'Could not complete detection.' },
);
