import { spawn } from 'node:child_process';

export type CanaryResult = { ok: true } | { ok: false; reason: string; stderr: string };

const STDERR_CAP = 500;

export function runCanary(cmd: string[], timeoutMs: number): Promise<CanaryResult> {
  return new Promise((resolve) => {
    const [binary, ...args] = cmd;
    if (binary === undefined) {
      resolve({ ok: false, reason: 'canary cmd is empty', stderr: '' });
      return;
    }

    let resolved = false;
    const finish = (result: CanaryResult): void => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const signal = AbortSignal.timeout(timeoutMs);
    let stderr = '';

    let child;
    try {
      child = spawn(binary, args, { signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({ ok: false, reason: `canary spawn failed: ${msg}`, stderr: '' });
      return;
    }

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length >= STDERR_CAP) return;
      const remaining = STDERR_CAP - stderr.length;
      stderr += chunk.toString('utf8').slice(0, remaining);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        finish({ ok: false, reason: `canary command not found: ${binary}`, stderr });
        return;
      }
      if (signal.aborted) {
        finish({ ok: false, reason: `canary timed out after ${timeoutMs}ms`, stderr });
        return;
      }
      finish({ ok: false, reason: `canary error: ${err.message}`, stderr });
    });

    child.on('close', (code) => {
      if (signal.aborted) {
        finish({ ok: false, reason: `canary timed out after ${timeoutMs}ms`, stderr });
        return;
      }
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      finish({ ok: false, reason: `canary exited with code ${code}`, stderr });
    });
  });
}
