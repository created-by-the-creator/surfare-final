import { createNodeHandler } from '../server/http-node.js';
import { detect } from '../server/services/detect.js';
export default createNodeHandler(
  detect,
  () => ({ GOOGLE_SAFE_BROWSING_API_KEY: process.env.GOOGLE_SAFE_BROWSING_API_KEY }),
  { maxBodyBytes: 60000, errorMessage: 'Could not complete detection.' },
);
