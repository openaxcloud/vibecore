import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { chromium } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

const MARK = `
  <svg viewBox="0 0 96 96" aria-hidden="true">
    <defs>
      <linearGradient id="ecode-brand-disc" x1="8" y1="8" x2="88" y2="88" gradientUnits="userSpaceOnUse">
        <stop stop-color="#ff7a1a" />
        <stop offset="1" stop-color="#f26207" />
      </linearGradient>
      <filter id="ecode-brand-shadow" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#050914" flood-opacity=".28" />
      </filter>
    </defs>
    <circle cx="48" cy="48" r="40" fill="url(#ecode-brand-disc)" filter="url(#ecode-brand-shadow)" />
    <circle cx="48" cy="48" r="39.5" fill="none" stroke="#fff" stroke-opacity=".16" />
    <path d="M34 27v42M34 27h22M34 48h17M34 69h22" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    <path d="m62 38 11 10-11 10" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;

function wordmarkDocument({ dark, styled }) {
  const foreground = dark ? '#f7f9fc' : '#0a0f1c';
  const codeColor = styled ? '#f26207' : foreground;

  return `<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 893px; height: 312px; margin: 0; background: transparent; }
      body { display: flex; align-items: center; justify-content: center; }
      .lockup { display: flex; align-items: center; gap: 28px; }
      svg { width: 154px; height: 154px; overflow: visible; }
      .wordmark {
        color: ${foreground};
        font-family: "Helvetica Neue", Helvetica, sans-serif;
        font-size: 112px;
        font-weight: 700;
        letter-spacing: -6px;
        line-height: 1;
      }
      .wordmark span { color: ${codeColor}; }
    </style>
    <div class="lockup">${MARK}<div class="wordmark">E<span>-Code</span></div></div>`;
}

function iconDocument() {
  return `<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 180px; height: 180px; margin: 0; background: transparent; }
      body { display: grid; place-items: center; }
      svg { width: 180px; height: 180px; }
    </style>
    ${MARK}`;
}

function socialDocument() {
  return `<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
      body {
        position: relative;
        color: #f8fafc;
        background:
          radial-gradient(circle at 82% 18%, rgba(242, 98, 7, .24), transparent 28%),
          radial-gradient(circle at 16% 96%, rgba(0, 153, 255, .12), transparent 34%),
          #080d19;
        font-family: "Helvetica Neue", Helvetica, sans-serif;
      }
      body::before {
        position: absolute;
        inset: 0;
        content: "";
        opacity: .2;
        background-image:
          linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px);
        background-size: 56px 56px;
        mask-image: linear-gradient(90deg, transparent, #000 45%, #000);
      }
      .frame {
        position: absolute;
        inset: 28px;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 30px;
        background: linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
        box-shadow: 0 32px 90px rgba(0,0,0,.34);
      }
      .content { position: absolute; inset: 76px 82px; display: flex; flex-direction: column; }
      .brand { display: flex; align-items: center; gap: 18px; }
      .brand svg { width: 72px; height: 72px; overflow: visible; }
      .brand-name { font-size: 44px; font-weight: 700; letter-spacing: -2px; }
      .eyebrow {
        margin-left: auto;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 999px;
        padding: 10px 16px;
        color: #bdc7d8;
        font-size: 18px;
        letter-spacing: .02em;
      }
      h1 {
        width: 900px;
        margin: 78px 0 18px;
        font-size: 72px;
        line-height: 1.02;
        letter-spacing: -4.4px;
      }
      h1 span { color: #ff7a1a; }
      p { width: 760px; margin: 0; color: #aeb9ca; font-size: 25px; line-height: 1.45; }
      .signal { display: flex; gap: 10px; margin-top: auto; }
      .signal span { width: 42px; height: 6px; border-radius: 99px; background: rgba(255,255,255,.14); }
      .signal span:first-child { width: 92px; background: #f26207; }
    </style>
    <div class="frame"></div>
    <main class="content">
      <div class="brand">${MARK}<div class="brand-name">E-Code</div><div class="eyebrow">AI application development platform</div></div>
      <h1>Build, ship and scale apps <span>with AI.</span></h1>
      <p>Production-grade agents, real workspaces and deployment controls in one collaborative IDE.</p>
      <div class="signal"><span></span><span></span><span></span></div>
    </main>`;
}

function desktopIconDocument(size) {
  const corner = Math.round(size * 0.21);
  const inset = Math.round(size * 0.07);
  const markSize = Math.round(size * 0.65);

  return `<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body { width: ${size}px; height: ${size}px; margin: 0; background: transparent; overflow: hidden; }
      body { display: grid; place-items: center; }
      .tile {
        width: ${size - inset * 2}px;
        height: ${size - inset * 2}px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: ${corner}px;
        background:
          radial-gradient(circle at 72% 18%, rgba(242,98,7,.24), transparent 32%),
          linear-gradient(145deg, #111a2d, #080d19 72%);
        box-shadow: 0 ${Math.round(size * 0.035)}px ${Math.round(size * 0.06)}px rgba(2,6,23,.32);
      }
      .tile svg { width: ${markSize}px; height: ${markSize}px; overflow: visible; }
    </style>
    <div class="tile">${MARK}</div>`;
}

function createPngIco(images) {
  const headerSize = 6;
  const directorySize = images.length * 16;
  let imageOffset = headerSize + directorySize;
  const header = Buffer.alloc(headerSize + directorySize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach(({ png, size }, index) => {
    const entryOffset = headerSize + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += png.length;
  });

  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function capture(page, html, output, options = {}) {
  const path = resolve(repoRoot, output);
  await mkdir(dirname(path), { recursive: true });
  await page.setViewportSize(options.viewport ?? { width: 893, height: 312 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({
    path,
    omitBackground: options.omitBackground ?? false,
    quality: options.quality,
    type: options.type,
  });
}

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  await capture(page, wordmarkDocument({ dark: true, styled: false }), 'public/logo-dark.png', {
    omitBackground: true,
    type: 'png',
  });
  await capture(page, wordmarkDocument({ dark: false, styled: false }), 'public/logo-light.png', {
    omitBackground: true,
    type: 'png',
  });
  await capture(page, wordmarkDocument({ dark: true, styled: true }), 'public/logo-dark-styled.png', {
    omitBackground: true,
    type: 'png',
  });
  await capture(page, wordmarkDocument({ dark: false, styled: true }), 'public/logo-light-styled.png', {
    omitBackground: true,
    type: 'png',
  });
  await capture(page, iconDocument(), 'public/apple-touch-icon-precomposed.png', {
    viewport: { width: 180, height: 180 },
    omitBackground: true,
    type: 'png',
  });
  await capture(page, socialDocument(), 'public/social_preview_index.jpg', {
    viewport: { width: 1200, height: 630 },
    quality: 92,
    type: 'jpeg',
  });
  await capture(page, socialDocument(), 'public/assets/og-default.png', {
    viewport: { width: 1200, height: 630 },
    type: 'png',
  });

  const desktopPngPath = resolve(repoRoot, 'assets/icons/icon.png');
  await capture(page, desktopIconDocument(512), 'assets/icons/icon.png', {
    viewport: { width: 512, height: 512 },
    omitBackground: true,
    type: 'png',
  });

  const icoImages = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(desktopIconDocument(size), { waitUntil: 'load' });
    const png = await page.screenshot({ omitBackground: true, type: 'png' });
    icoImages.push({ png, size });
  }

  await writeFile(resolve(repoRoot, 'assets/icons/icon.ico'), createPngIco(icoImages));
  await execFileAsync('/usr/bin/sips', [
    '-s',
    'format',
    'icns',
    desktopPngPath,
    '--out',
    resolve(repoRoot, 'assets/icons/icon.icns'),
  ]);
} finally {
  await browser.close();
}
