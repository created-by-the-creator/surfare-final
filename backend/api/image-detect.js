import { createNodeHandler } from '../server/http-node.js';
import { imageDetect } from '../server/services/image-detect.js';

export default createNodeHandler(imageDetect, () => ({
  SIGHTENGINE_API_USER: process.env.SIGHTENGINE_API_USER,
  SIGHTENGINE_API_SECRET: process.env.SIGHTENGINE_API_SECRET,
  IMAGE_ALLOWED_ORIGINS: process.env.IMAGE_ALLOWED_ORIGINS,
}), { maxBodyBytes: 1100000, errorMessage: 'Could not complete online image detection.' });
