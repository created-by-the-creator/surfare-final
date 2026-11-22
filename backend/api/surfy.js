import { createNodeHandler } from '../server/http-node.js';
import { surfyChat } from '../server/services/surfy.js';
export default createNodeHandler(surfyChat, () => process.env, {
  maxBodyBytes: 60000, errorMessage: 'Surfy is unavailable.',
});
