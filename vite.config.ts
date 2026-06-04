import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'

// Helper to recursively find files matching a regex pattern
function findFileRegex(dir: string, pattern: RegExp, maxDepth = 3, currentDepth = 0): string | null {
  if (currentDepth > maxDepth) return null;
  if (!fs.existsSync(dir)) return null;

  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    // 1. Scan files in current directory
    for (const file of files) {
      if (file.isFile() && pattern.test(file.name)) {
        return path.join(dir, file.name);
      }
    }
    
    // 2. Scan subdirectories recursively
    for (const file of files) {
      if (file.isDirectory() && !file.name.startsWith('.')) {
        const subDir = path.join(dir, file.name);
        const found = findFileRegex(subDir, pattern, maxDepth, currentDepth + 1);
        if (found) return found;
      }
    }
  } catch {
    // Fail silently on permission/system access issues
  }
  return null;
}

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

                    const winRoots = [
                      { dir: path.join(localAppData, 'Programs'), depth: 3 },
                      { dir: path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), depth: 3 },
                      { dir: path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), depth: 3 },
                      { dir: programFiles, depth: 2 }
                    ];

                    const pattern = /^ollama(\s+app)?\.(exe|lnk)$/i;
                    let foundPath: string | null = null;
                    
                    for (const root of winRoots) {
                      foundPath = findFileRegex(root.dir, pattern, root.depth);
                      if (foundPath) break;
                    }

                    if (foundPath) {
                      launchCommand = `start "" "${foundPath}"`;
                    } else {
                      launchCommand = 'start "" "ollama app"'; // Fallback
                    }
                  } else if (process.platform === 'darwin') {
                    const home = process.env.HOME || '';
                    const macRoots = [
                      { dir: '/Applications', depth: 1 },
                      { dir: path.join(home, 'Applications'), depth: 2 }
                    ];
                    const pattern = /^Ollama\.app$/i;
                    let foundPath: string | null = null;

                    for (const root of macRoots) {
                      foundPath = findFileRegex(root.dir, pattern, root.depth);
                      if (foundPath) break;
                    }

                    if (foundPath) {
                      launchCommand = `open -a "${foundPath}"`;
                    } else {
                      launchCommand = 'open -a Ollama'; // Fallback
                    }
                  } else {
                    // Linux
                    const home = process.env.HOME || '';
                    const linuxRoots = [
                      { dir: '/usr/local/bin', depth: 1 },
                      { dir: '/usr/bin', depth: 1 },
                      { dir: path.join(home, '.local', 'bin'), depth: 2 },
                      { dir: path.join(home, 'bin'), depth: 2 }
                    ];
                    const pattern = /^ollama$/i;
                    let foundPath: string | null = null;

                    for (const root of linuxRoots) {
                      foundPath = findFileRegex(root.dir, pattern, root.depth);
                      if (foundPath) break;
                    }

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
