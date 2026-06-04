import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import http from 'http'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ollama-launcher',
      configureServer(server) {
        server.middlewares.use('/api/ollama-control', (req, res, next) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                if (data.action === 'launch') {
                  const isWindows = process.platform === 'win32';
                  if (isWindows) {
                    exec('start "" "ollama"');
                  } else if (process.platform === 'darwin') {
                    exec('open -a Ollama');
                  } else {
                    exec('ollama serve &');
                  }
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, message: 'Launch command triggered' }));
                  return;
                }
              } catch (e: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
                return;
              }
            });
            return;
          }

          if (req.method === 'GET') {
            const checkOllama = () => {
              return new Promise<boolean>((resolve) => {
                const options = {
                  hostname: '127.0.0.1',
                  port: 11434,
                  path: '/',
                  method: 'GET',
                  timeout: 800,
                };
                const request = http.request(options, (response) => {
                  resolve(response.statusCode === 200 || response.statusCode === 404 || response.statusCode === 403);
                });
                request.on('error', () => resolve(false));
                request.on('timeout', () => {
                  request.destroy();
                  resolve(false);
                });
                request.end();
              });
            };

            checkOllama().then((isRunning) => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ running: isRunning }));
            });
            return;
          }

          next();
        });
      }
    }
  ],
  base: '/OpenWord/',
})
