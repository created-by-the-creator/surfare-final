import { createNodeHandler } from '../server/http-node.js';
import { semanticCheck } from '../server/services/semantic.js';

export default createNodeHandler(
  semanticCheck,
  () => ({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  }),
  { maxBodyBytes: 60_000, errorMessage: 'Could not complete contextual analysis.' },
);
