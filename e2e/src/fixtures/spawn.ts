import { spawn } from 'node:child_process';

export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

export function spawnServer(
  serverPath: string,
  fixtureDir: string,
  env: NodeJS.ProcessEnv,
): Promise<{ port: number; kill: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [serverPath, fixtureDir], {
      env: { ...process.env, ...env },
    });
    const onData = (chunk: Buffer) => {
      const match = chunk.toString().match(/listening:(\d+)/);
      if (match) {
        child.stdout?.off('data', onData);
        resolve({ port: Number(match[1]), kill: () => child.kill('SIGTERM') });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== null && code !== 0) reject(new Error(`server exited early with code ${code}`));
    });
  });
}
