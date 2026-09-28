// Command wrapper: returns successCount, treating any throw as failure.
export function runCmd(target, command) {
  try {
    const r = target.runCommand(command);
    return r?.successCount ?? 0;
  } catch {
    return 0;
  }
}
