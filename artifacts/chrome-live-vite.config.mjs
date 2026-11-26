import path from 'node:path';
import {mergeConfig} from 'vite';
import base from '../frontend/vite.config.js';
export default mergeConfig(base,{
 root:path.resolve(import.meta.dirname,'../frontend'),
 server:{proxy:{'/api':'http://127.0.0.1:8791'}},
 preview:{proxy:{'/api':'http://127.0.0.1:8791'}},
});
