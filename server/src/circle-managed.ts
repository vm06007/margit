import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { redis } from './redis.js';
import { encryptToken, decryptToken } from './crypto.js';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
export const circleStorage = { get: <T>(key: string) => redis.get<T>(key) };
const prefix = 'margit:circle-managed:';
const chain = 'ARC-TESTNET';
const ttl = 28 * 86400;
export type CircleIdentity = { address: `0x${string}`; buyer: `0x${string}` };
const addressPattern = /^0x[0-9a-f]{40}$/i;

// The official CLI runs without a shell, in a new private home for every command.
// Only encrypted state is kept between commands. The host's Circle login is never used.
async function command<T>(session: string, args: string[]): Promise<T> {
  const key = prefix + session;
  const lock = key + ':busy';
  const token = randomUUID();
  if (!await redis.set(lock, token, { nx: true, ex: 120 })) throw new Error('Circle wallet is busy. Please wait and try again.');
  const home = await mkdtemp(join(tmpdir(), 'margit-circle-'));
  try {
    const cli = require.resolve('@circle-fin/cli');
    if (!(await readFile(cli, 'utf8')).includes('margit: per-session file storage')) throw new Error('Circle wallet setup is unavailable. Run the dependency setup first.');
    const stored = await circleStorage.get<string>(key);
    if (stored) {
      const files = JSON.parse(decryptToken(stored)) as Record<string, string>;
      for (const [name, value] of Object.entries(files)) {
        if (name.startsWith('/') || name.split('/').includes('..')) throw new Error('Invalid Circle session.');
        const path = join(home, name);
        await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
        await writeFile(path, Buffer.from(value, 'base64'), { mode: 0o600 });
      }
    }
    const env = { PATH: process.env.PATH, CIRCLE_CLI_HOME: home, CIRCLE_ACCEPT_TERMS: '1', CIRCLE_TELEMETRY_DISABLED: '1' };
    let stdout: string;
    try {
      ({ stdout } = await exec(process.execPath, [cli, ...args, '--output', 'json'], { env, timeout: 90000, maxBuffer: 1024 * 1024 }));
    } catch {
      // CLI failures can contain tokens, signatures and paid request bodies.
      throw new Error('Circle could not complete this request. Check your verification code or reconnect if your session expired.');
    }
    const files: Record<string, string> = {};
    async function snapshot(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await snapshot(path);
        else if (entry.isFile()) files[relative(home, path)] = (await readFile(path)).toString('base64');
      }
    }
    await snapshot(home);
    await redis.set(key, encryptToken(JSON.stringify(files)), { ex: ttl });
    return JSON.parse(stdout).data as T;
  } finally {
    await rm(home, { recursive: true, force: true });
    await redis.eval('if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end', [lock], [token]);
  }
}
export async function startCircleLogin(session: string, email: string, acceptedTerms: boolean) {
  if (!acceptedTerms) throw new Error('Please accept Circle’s terms to connect.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  if (!await redis.set(prefix + session + ':otp-rate', '1', { nx: true, ex: 60 })) throw new Error('Wait a minute before requesting another code.');
  const result = await command<{ message: string }>(session, ['wallet', 'login', email, '--testnet', '--init']);
  const request = result.message.match(/--request ([a-f0-9-]{36})/i)?.[1];
  if (!request) throw new Error('Circle did not return a login request.');
  await redis.set(prefix + session + ':request', request, { ex: 600 });
  await redis.del(prefix + session + ':otp-attempts');
}
export async function finishCircleLogin(session: string, otp: string) {
  if (!/^(?:[a-z0-9]{3}-)?\d{6}$/i.test(otp)) throw new Error('Enter the code from Circle’s email.');
  const attempts = await redis.incr(prefix + session + ':otp-attempts');
  if (attempts === 1) await redis.expire(prefix + session + ':otp-attempts', 600);
  if (attempts > 5) throw new Error('Too many verification attempts. Request a new code.');
  const request = await circleStorage.get<string>(prefix + session + ':request');
  if (!request) throw new Error('Request a new verification code.');
  await command(session, ['wallet', 'login', '--request', request, '--otp', otp, '--testnet']);
  await redis.del(prefix + session + ':request');
  return circleIdentity(session);
}
export async function circleIdentity(session: string): Promise<CircleIdentity> {
  const wallets = await command<{ wallets: { address: string }[] }>(session, ['wallet', 'list', '--type', 'agent', '--chain', chain]);
  const address = wallets.wallets[0]?.address;
  if (!address || !addressPattern.test(address)) throw new Error('No Circle wallet is available on Arc testnet.');
  const gateway = await command<{ backingEOA: string }>(session, ['gateway', 'balance', '--address', address, '--chain', chain]);
  if (!addressPattern.test(gateway.backingEOA)) throw new Error('Circle payment account is unavailable.');
  const identity = { address: address as `0x${string}`, buyer: gateway.backingEOA as `0x${string}` };
  await redis.set(prefix + session + ':identity', identity, { ex: ttl });
  return identity;
}
export async function getCircleIdentity(session: string) {
  const identity = await circleStorage.get<CircleIdentity>(prefix + session + ':identity');
  if (!identity) throw new Error('Connect your Circle Agent Wallet first.');
  return identity;
}
export async function circleGatewayBalance(session: string, address: string) {
  const result = await command<{ total: string }>(session, ['gateway', 'balance', '--address', address, '--chain', chain]);
  return result.total;
}
export async function circleSign(session: string, address: string, data: string): Promise<`0x${string}`> {
  const result = await command<{ signature: string }>(session, ['wallet', 'sign', 'typed-data', data, '--address', address, '--chain', chain]);
  if (!/^0x[0-9a-f]+$/i.test(result.signature)) throw new Error('Circle did not return a signature.');
  return result.signature as `0x${string}`;
}
export async function circleDeposit(session: string, address: string, amount: string) {
  const result = await command<{ depositTxHash: string }>(session, ['gateway', 'deposit', '--address', address, '--chain', chain, '--amount', amount, '--method', 'direct']);
  if (!/^0x[0-9a-f]{64}$/i.test(result.depositTxHash)) throw new Error('Deposit needs reconciliation. Do not retry.');
  return result;
}
export async function disconnectCircle(session: string) {
  if (await redis.get(prefix + session + ':busy')) throw new Error('Wait for the current Circle operation to finish.');
  await redis.del(prefix + session, prefix + session + ':identity', prefix + session + ':request');
}
