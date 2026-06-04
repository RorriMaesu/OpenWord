import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'

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
                  let launchCommand = '';
                  
                  if (process.platform === 'win32') {
                    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
                    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
                    const programData = process.env.ProgramData || 'C:\\ProgramData';
                    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

                    const winPaths = [
                      path.join(localAppData, 'Programs', 'Ollama', 'ollama app.exe'),
                      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Ollama.lnk'),
                      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Ollama', 'Ollama.lnk'),
                      path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Ollama.lnk'),
                      path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Ollama', 'Ollama.lnk'),
                      path.join(programFiles, 'Ollama', 'ollama.exe')
                    ];

                    const foundPath = winPaths.find(p => fs.existsSync(p));
                    if (foundPath) {
                      launchCommand = `start "" "${foundPath}"`;
                    } else {
                      launchCommand = 'start "" "ollama app"'; // Fallback
                    }
                  } else if (process.platform === 'darwin') {
                    const home = process.env.HOME || '';
                    const macPaths = [
                      '/Applications/Ollama.app',
                      path.join(home, 'Applications', 'Ollama.app')
                    ];
                    const foundPath = macPaths.find(p => fs.existsSync(p));
                    if (foundPath) {
                      launchCommand = `open -a "${foundPath}"`;
                    } else {
                      launchCommand = 'open -a Ollama'; // Fallback
                    }
                  } else {
                    // Linux
                    const home = process.env.HOME || '';
                    const linuxPaths = [
                      '/usr/local/bin/ollama',
                      '/usr/bin/ollama',
                      path.join(home, '.local', 'bin', 'ollama'),
                      path.join(home, 'bin', 'ollama')
                    ];
                    const foundPath = linuxPaths.find(p => fs.existsSync(p));
                    if (foundPath) {
                      launchCommand = `nohup "${foundPath}" serve > /dev/null 2>&1 &`;
                    } else {
                      launchCommand = 'ollama serve &'; // Fallback
                    }
                  }

                  exec(launchCommand, (err) => {
                    if (err && process.platform === 'win32' && launchCommand !== 'start "" "ollama"') {
                      exec('start "" "ollama"');
                    }
                  });

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, message: `Launch command triggered: ${launchCommand}` }));
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
