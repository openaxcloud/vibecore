import { describe, expect, it } from 'vitest';

import { detectServerRuntime, isDetectionError, type ServerRuntimePlan } from './server-runtime-detect.js';

const plan = (pkg: object, topLevelFiles: string[] = []): ServerRuntimePlan => {
  const d = detectServerRuntime({ packageJson: JSON.stringify(pkg), topLevelFiles });
  if (isDetectionError(d)) throw new Error(`expected a plan, got error: ${d.error}`);
  return d;
};

describe('detectServerRuntime — frameworks', () => {
  it('Express API: uses the start script and imposes PORT via env', () => {
    const p = plan({ dependencies: { express: '^4.18.0' }, scripts: { start: 'node server.js' } });
    expect(p.framework).toBe('express');
    expect(p.startCommand).toBe('node server.js');
    expect(p.buildCommand).toBeNull();
    expect(p.staticHint).toBe(false);
  });

  it('Express without a start script falls back to a conventional entry file', () => {
    const p = plan({ dependencies: { express: '^4' } }, ['package.json', 'server.js']);
    expect(p.framework).toBe('express');
    expect(p.startCommand).toBe('node server.js');
  });

  it('Express with neither start nor entry file → clear NO_START_COMMAND error', () => {
    const d = detectServerRuntime({ packageJson: JSON.stringify({ dependencies: { express: '^4' } }), topLevelFiles: ['package.json'] });
    expect(isDetectionError(d)).toBe(true);
    if (isDetectionError(d)) expect(d.code).toBe('NO_START_COMMAND');
  });

  it('Next.js: build + `next start` with a -p $PORT flag', () => {
    const p = plan({ dependencies: { next: '^14', react: '^18', 'react-dom': '^18' }, scripts: { build: 'next build', start: 'next start' } });
    expect(p.framework).toBe('nextjs');
    expect(p.buildCommand).toBe('next build');
    expect(p.startCommand).toContain('next start');
    expect(p.startCommand).toContain('$PORT');
  });

  it('Next.js keeps an explicit port flag the user already set', () => {
    const p = plan({ dependencies: { next: '^14' }, scripts: { start: 'next start -p 8080' } });
    expect(p.startCommand).toBe('next start -p 8080');
  });

  it('NestJS: nest build + node dist/main', () => {
    const p = plan({ dependencies: { '@nestjs/core': '^10', '@nestjs/common': '^10' }, scripts: {} });
    expect(p.framework).toBe('nestjs');
    expect(p.buildCommand).toBe('nest build');
    expect(p.startCommand).toBe('node dist/main.js');
  });

  it('Fastify: HTTP server via its start script', () => {
    const p = plan({ dependencies: { fastify: '^4' }, scripts: { start: 'node index.js' } });
    expect(p.framework).toBe('fastify');
    expect(p.startCommand).toBe('node index.js');
  });

  it('generic Node app: main field → node <main>', () => {
    const p = plan({ main: 'dist/entry.js', scripts: {} });
    expect(p.framework).toBe('node');
    expect(p.startCommand).toBe('node dist/entry.js');
  });
});

describe('detectServerRuntime — static SPA guard', () => {
  it('Vite React SPA (no server dep, no start) → STATIC_ONLY error with a static hint', () => {
    const d = detectServerRuntime({
      packageJson: JSON.stringify({ dependencies: { react: '^18', 'react-dom': '^18' }, devDependencies: { vite: '^5' }, scripts: { build: 'vite build' } }),
      topLevelFiles: ['package.json', 'vite.config.ts', 'index.html'],
    });
    expect(isDetectionError(d)).toBe(true);
    if (isDetectionError(d)) {
      expect(d.code).toBe('STATIC_ONLY');
      expect(d.staticHint).toBe(true);
    }
  });

  it('CRA SPA (react-scripts, no server) → STATIC_ONLY', () => {
    const d = detectServerRuntime({ packageJson: JSON.stringify({ dependencies: { 'react-scripts': '5.0.1' } }) });
    expect(isDetectionError(d)).toBe(true);
    if (isDetectionError(d)) expect(d.code).toBe('STATIC_ONLY');
  });

  it('Vite app WITH an Express server + start script is a real server deploy (not static)', () => {
    const p = plan({ dependencies: { express: '^4', vite: '^5' }, scripts: { build: 'vite build', start: 'node server.js' } });
    expect(p.framework).toBe('express');
    expect(p.buildCommand).toBe('vite build');
    expect(p.startCommand).toBe('node server.js');
  });
});

describe('detectServerRuntime — errors are clear, never silent', () => {
  it('no package.json', () => {
    const d = detectServerRuntime({ packageJson: null });
    expect(isDetectionError(d) && d.code).toBe('NO_PACKAGE_JSON');
  });

  it('invalid JSON', () => {
    const d = detectServerRuntime({ packageJson: '{ not json' });
    expect(isDetectionError(d) && d.code).toBe('INVALID_PACKAGE_JSON');
  });

  it('empty object with nothing to start', () => {
    const d = detectServerRuntime({ packageJson: '{}', topLevelFiles: ['package.json'] });
    expect(isDetectionError(d) && d.code).toBe('NO_START_COMMAND');
  });
});

describe('detectServerRuntime — package manager', () => {
  it('picks pnpm/yarn/bun by lockfile, defaults to npm --legacy-peer-deps', () => {
    expect(plan({ dependencies: { express: '^4' }, scripts: { start: 'node s.js' } }, ['pnpm-lock.yaml']).install.command).toBe('pnpm');
    expect(plan({ dependencies: { express: '^4' }, scripts: { start: 'node s.js' } }, ['yarn.lock']).install.command).toBe('yarn');
    const npm = plan({ dependencies: { express: '^4' }, scripts: { start: 'node s.js' } }, ['package-lock.json']);
    expect(npm.install.command).toBe('npm');
    expect(npm.install.args).toContain('--legacy-peer-deps');
  });
});
