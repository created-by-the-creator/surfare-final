import { createNodeHandler } from '../server/http-node.js';
import { recoveryGuide } from '../server/services/recovery-guide.js';
export default createNodeHandler(recoveryGuide, () => process.env, { maxBodyBytes: 12000, errorMessage: 'Guide AI unavailable.' });
