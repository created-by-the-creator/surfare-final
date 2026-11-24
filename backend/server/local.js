import { createServer } from 'node:http';
import { createNodeHandler } from './http-node.js';
import { detect } from './services/detect.js';
import { semanticCheck } from './services/semantic.js';
import { verify, checkUrl } from './services/reputation.js';
import { imageCheck } from './services/image.js';
import { imageDetect } from './services/image-detect.js';
import { feedback } from './services/feedback.js';
import { surfyChat } from './services/surfy.js';
import { extensionApi } from './services/extension.js';

export function createDetectorServer(environment = () => process.env) {
  const routes = new Map([
    ['/api/extension', [extensionApi, 1100000]],
    ['/api/detect', [detect, 60000]],
    ['/api/assess', [semanticCheck, 60000]],
    ['/api/verify', [verify, 20000]],
    ['/api/check-url', [checkUrl, 20000]],
    ['/api/image-assess', [imageCheck, 1100000]],
    ['/api/image-detect', [imageDetect, 1100000]],
    ['/api/feedback', [feedback, 12000]],
    ['/api/surfy', [surfyChat, 60000]],
  ].map(([path, [service, maxBodyBytes]]) => [path, createNodeHandler(service, environment, {
    maxBodyBytes, errorMessage: 'Could not complete the check.', protocol: 'http:',
  })]));
  return createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const handler = routes.get(path);
    if (handler) return void handler(request, response);
    const healthy = path === '/api/health' && request.method === 'GET';
    response.writeHead(healthy ? 200 : 404, {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(healthy ? { status: 'ok' } : { error: 'Not found' }));
  });
}
