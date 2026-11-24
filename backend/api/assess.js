import { createNodeHandler } from '../server/http-node.js';
import { semanticCheck } from '../server/services/semantic.js';

export default createNodeHandler(
  semanticCheck,
  () => ({
    AGENT_ROUTER_API_KEY: process.env.AGENT_ROUTER_API_KEY,
    AGENTROUTER_API_KEY: process.env.AGENTROUTER_API_KEY,
    AGENT_ROUTER_BASE_URL: process.env.AGENT_ROUTER_BASE_URL,
    AGENTROUTER_BASE_URL: process.env.AGENTROUTER_BASE_URL,
    AGENT_ROUTER_MODEL: process.env.AGENT_ROUTER_MODEL,
    AGENTROUTER_MODEL: process.env.AGENTROUTER_MODEL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  }),
  { maxBodyBytes: 60_000, errorMessage: 'Could not complete contextual analysis.' },
);
