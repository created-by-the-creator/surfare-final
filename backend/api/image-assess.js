import { createNodeHandler } from '../server/http-node.js';
import { imageCheck } from '../server/services/image.js';

export default createNodeHandler(
  imageCheck,
  () => ({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_IMAGE_MODEL: process.env.OPENROUTER_IMAGE_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL,
    IMAGE_ALLOWED_ORIGINS: process.env.IMAGE_ALLOWED_ORIGINS,
  }),
  { maxBodyBytes: 1100000, errorMessage: 'Could not complete image review.' },
);
