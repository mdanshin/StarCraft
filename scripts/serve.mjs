import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.md':'text/plain; charset=utf-8'};
const server = http.createServer((req,res)=>{
  try {
    const rel = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(root, '.' + (rel==='/'?'/index.html':rel));
    if (!file.startsWith(root+path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(file).pipe(res);
  } catch {res.writeHead(400);res.end('Bad request');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('KOPRULU: FRONTLINE → http://localhost:'+server.address().port));
