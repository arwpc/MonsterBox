/**
 * Shared SSH invocation for the fleet-audio tools.
 *
 * WHY THIS EXISTS: earcheck.mjs and apply-volumes.mjs both shelled out to a bare
 * `ssh`, so they only worked from a node that already held outbound key trust.
 * Fleet key trust is DIRECTIONAL: only some nodes hold outbound keys to the rest.
 * Run either tool from a node without that trust and it reported healthy, serving
 * peers as "OFFLINE -- no ssh/shell reachability" and "UNREACHABLE". That is the
 * worst failure mode these tools have: an ear-check exists to tell you a node is
 * silent, and instead it told you the node was gone.
 *
 * deploy-to-animatronic.sh already solved this: take the password from
 * MONSTERBOX_SSH_PASSWORD (canonical) or SSH_PASS, hand it to sshpass via the
 * SSHPASS env var so it never lands on a command line or in `ps` output, and fall
 * back to key auth when no password is set.
 *
 * NOTE ON BatchMode: it is set ONLY on the key path. BatchMode=yes disables
 * password authentication outright, so setting it alongside sshpass would
 * reintroduce exactly the failure this module removes.
 */

const password = () => process.env.MONSTERBOX_SSH_PASSWORD || process.env.SSH_PASS || '';

const BASE_OPTS = ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=8'];

/** True when a password is available, i.e. we do not need pre-deployed keys. */
export const hasPassword = () => password().length > 0;

/** Env to pass to the child so sshpass -e can read the password. */
export function sshEnv() {
  const pass = password();
  return pass ? { ...process.env, SSHPASS: pass } : process.env;
}

/**
 * Build an ssh invocation. Returns { file, args } for execFileSync/spawn.
 * Pair it with sshEnv() as the child's `env`.
 */
export function sshArgv(target, remoteCmd, extraOpts = []) {
  const opts = [...BASE_OPTS, ...extraOpts];
  return hasPassword()
    ? { file: 'sshpass', args: ['-e', 'ssh', ...opts, target, remoteCmd] }
    : { file: 'ssh', args: ['-o', 'BatchMode=yes', ...opts, target, remoteCmd] };
}

/** Same, for scp. `src`/`dst` are passed through verbatim. */
export function scpArgv(src, dst, extraOpts = []) {
  const opts = [...BASE_OPTS, ...extraOpts];
  return hasPassword()
    ? { file: 'sshpass', args: ['-e', 'scp', ...opts, src, dst] }
    : { file: 'scp', args: ['-o', 'BatchMode=yes', ...opts, src, dst] };
}
