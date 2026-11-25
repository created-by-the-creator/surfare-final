import { verify } from '../server/services/reputation.js';
import { semanticCheck } from '../server/services/semantic.js';
import { imageCheck } from '../server/services/image.js';
import { imageDetect } from '../server/services/image-detect.js';
import { feedback } from '../server/services/feedback.js';
import { detect } from '../server/services/detect.js';
import { surfyChat } from '../server/services/surfy.js';
import { recoveryGuide } from '../server/services/recovery-guide.js';
import { extensionApi } from '../server/services/extension.js';
import { qrResolve } from '../server/services/qr-resolve.js';
export default {
  async fetch(request, env) {
    // This runtime has no DNS-pinned Node transport; fail closed instead of using fetch.
    if (new URL(request.url).pathname === '/api/qr-resolve') return qrResolve(request, env);
    if (new URL(request.url).pathname === '/api/recovery-guide') return recoveryGuide(request, env);
    if (new URL(request.url).pathname === '/api/extension') return extensionApi(request, env);
    if (new URL(request.url).pathname === '/api/surfy') return surfyChat(request, env);
    if (new URL(request.url).pathname === '/api/detect') return detect(request, env);
    if (new URL(request.url).pathname === '/api/feedback') return feedback(request, env);
    if (new URL(request.url).pathname === '/api/verify') return verify(request, env);
    if (new URL(request.url).pathname === '/api/assess') return semanticCheck(request, env);
    if (new URL(request.url).pathname === '/api/image-assess') return imageCheck(request, env);
    if (new URL(request.url).pathname === '/api/image-detect') return imageDetect(request, env);
    if (new URL(request.url).pathname.startsWith('/api/'))
      return Response.json({ error: 'Not found' }, { status: 404 });
    return env.ASSETS ? env.ASSETS.fetch(request) : Response.json({ error: 'Not found' }, { status: 404 });
  },
};
