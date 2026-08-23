const { execFile, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { performance } = require('perf_hooks');

const rounds = 3;
const requestsPerRound = 25;
const serverPath = path.join(__dirname, '..', 'server.js');

function requestHealth(port) {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`health status ${res.statusCode}`));
        resolve(performance.now() - startedAt);
      });
    });
    req.on('timeout', () => req.destroy(new Error('health timeout')));
    req.on('error', reject);
  });
}

async function waitUntilHealthy(child, port, startedAt) {
  const deadline = Date.now() + 10000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      await requestHealth(port);
      return performance.now() - startedAt;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw new Error(`startup timeout: ${lastError?.message || 'unknown'}`);
}

function readRssKb(pid) {
  return new Promise((resolve, reject) => {
    execFile('ps', ['-o', 'rss=', '-p', String(pid)], (error, stdout) => {
      if (error) return reject(error);
      resolve(Number.parseInt(stdout.trim(), 10));
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGINT');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

async function runRound(runtime, roundIndex) {
  const port = 5200 + runtime.offset * 10 + roundIndex;
  const logs = [];
  const startedAt = performance.now();
  const child = spawn(runtime.bin, [serverPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  try {
    const startupMs = await waitUntilHealthy(child, port, startedAt);
    const rssKb = await readRssKb(child.pid);
    const latencies = [];
    for (let i = 0; i < requestsPerRound; i += 1) latencies.push(await requestHealth(port));
    return {
      startupMs,
      rssKb,
      latencyAvgMs: latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
      latencyP95Ms: percentile(latencies, 0.95),
    };
  } catch (error) {
    throw new Error(`${runtime.name} round ${roundIndex + 1}: ${error.message}\n${logs.join('').slice(-2000)}`);
  } finally {
    await stopChild(child);
  }
}

async function runRuntime(runtime) {
  const samples = [];
  for (let i = 0; i < rounds; i += 1) samples.push(await runRound(runtime, i));
  const average = (key) => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
  return {
    runtime: runtime.name,
    rounds,
    startupAvgMs: average('startupMs'),
    rssAvgMb: average('rssKb') / 1024,
    healthLatencyAvgMs: average('latencyAvgMs'),
    healthLatencyP95AvgMs: average('latencyP95Ms'),
    samples,
  };
}

(async () => {
  const runtimes = [
    { name: `Node ${process.version}`, bin: process.execPath, offset: 0 },
    { name: 'Bun 1.4.0', bin: 'bun', offset: 1 },
  ];
  const results = [];
  for (const runtime of runtimes) results.push(await runRuntime(runtime));
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
