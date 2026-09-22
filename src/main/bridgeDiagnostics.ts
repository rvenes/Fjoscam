import type { BridgeHealth } from '../shared/types.js';

// go2rtc may print complete credential-bearing sources. Never forward raw
// stdout/stderr, even to the general sanitizer: arbitrary camera response text
// can carry an unlabelled secret. Only fixed diagnostic categories leave here.
export function bridgeDiagnostics(report: (reason: NonNullable<BridgeHealth['reason']>) => void): (chunk: Buffer) => void {
  let line = '';
  let discarded = false;
  return (chunk) => {
    for (const part of chunk.toString('utf8').split(/(\n)/)) {
      if (part === '\n') {
        if (!discarded) {
          if (/address already in use|only one usage of each socket address|bind:.*in use/i.test(line)) report('port-in-use');
          else if (/permission denied|access is denied/i.test(line)) report('permission-denied');
        }
        line = ''; discarded = false;
      } else if (!discarded) {
        if (line.length + part.length > 4096) { line = ''; discarded = true; }
        else line += part;
      }
    }
  };
}
