import { spawn, type IPty } from 'tauri-pty';
import { tauriBridge } from '../api/tauri-bridge';

export interface SpawnOptions {
  command?: string;
  args?: string[];
  cwd: string;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
}

export async function spawnPty(options: SpawnOptions): Promise<IPty> {
  const env = await tauriBridge.getPtyEnv();
  const shell = env['SHELL'] ?? '/bin/zsh';

  let file: string;
  let args: string[];

  if (options.command) {
    const fullCmd = options.args?.length
      ? `exec ${options.command} ${options.args.join(' ')}`
      : `exec ${options.command}`;
    file = shell;
    args = ['-l', '-c', fullCmd];
  } else {
    file = shell;
    args = ['-l'];
  }

  const pty = spawn(file, args, {
    cwd: options.cwd,
    cols: options.cols,
    rows: options.rows,
    env,
  });

  pty.onData(options.onData);
  pty.onExit(({ exitCode }) => options.onExit(exitCode));

  return pty;
}

export function resizePty(pty: IPty, cols: number, rows: number): void {
  try {
    pty.resize(cols, rows);
  } catch {
    // PTY may have already exited
  }
}

export function writeToPty(pty: IPty, data: string): void {
  try {
    pty.write(data);
  } catch {
    // PTY may have already exited
  }
}

export function killPty(pty: IPty): void {
  try {
    pty.kill();
  } catch {
    // PTY may have already exited
  }
}
