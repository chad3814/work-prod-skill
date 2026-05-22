export type CommandIO = { stdin: string; argv: string[]; configDir?: string };
export type CommandResult = { exitCode: number; stdout: string; stderr: string };
