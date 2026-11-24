import { createNodeHandler } from '../server/http-node.js';
import { imageCheck } from '../server/services/image.js';

export default createNodeHandler(
  imageCheck,
  () => ({
    AGENT_ROUTER_API_KEY: process.env.AGENT_ROUTER_API_KEY,
    AGENTROUTER_API_KEY: process.env.AGENTROUTER_API_KEY,
    AGENT_ROUTER_BASE_URL: process.env.AGENT_ROUTER_BASE_URL,
    AGENTROUTER_BASE_URL: process.env.AGENTROUTER_BASE_URL,
    AGENT_ROUTER_MODEL: process.env.AGENT_ROUTER_MODEL,
    AGENTROUTER_MODEL: process.env.AGENTROUTER_MODEL,
    AGENT_ROUTER_IMAGE_MODEL: process.env.AGENT_ROUTER_IMAGE_MODEL,
    AGENTROUTER_IMAGE_MODEL: process.env.AGENTROUTER_IMAGE_MODEL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_IMAGE_MODEL: process.env.OPENROUTER_IMAGE_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL,
    IMAGE_ALLOWED_ORIGINS: process.env.IMAGE_ALLOWED_ORIGINS,
  }),
  { maxBodyBytes: 1100000, errorMessage: 'Could not complete image review.' },
);
