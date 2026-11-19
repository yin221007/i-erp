import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const androidActivityUrl = new URL(
  '../../apps/android/app/src/main/java/cn/i2000/ierp/MainActivity.kt',
  import.meta.url
);
const androidDownloadBridgeUrl = new URL(
  '../../apps/android/app/src/main/java/cn/i2000/ierp/ui/NativeDownloadBridge.kt',
  import.meta.url
);
const androidWorkspaceUrl = new URL(
  '../../apps/android/app/src/main/java/cn/i2000/ierp/ui/WebWorkspace.kt',
  import.meta.url
);
const macWorkspaceUrl = new URL(
  '../../apps/macos/Sources/IERPMac/BrowserWorkspaceView.swift',
  import.meta.url
);

function androidBootstrap(source) {
  return source.match(/val pageBootstrapScript = """([\s\S]*?)"""\.trimIndent\(\)/)?.[1]
    .replaceAll("${'$'}", '$');
}

const trustedOrigin = 'https://ierp.example.test:10888';

async function androidDownloadBootstrap() {
  return androidBootstrap(await readFile(androidWorkspaceUrl, 'utf8'))
    .replace('${BuildConfig.IERP_ORIGIN}', trustedOrigin)
    .replace('/* IERP_DOWNLOAD_TOKEN */ null', "'sample-token'");
}

function installAndroidDownloadTestPage(script, window) {
  const HTMLAnchorElement = class {
    click() { this.usedBrowserClick = true; }
    hasAttribute(name) { return name === 'download' && this.download !== undefined; }
  };
  const originalClick = HTMLAnchorElement.prototype.click;
  const URL = {
    createObjectURL: () => `blob:${trustedOrigin}/test`,
    revokeObjectURL() {}
  };
  runInNewContext(script, {
    window, HTMLAnchorElement, URL, Blob,
    document: { querySelectorAll: () => [] },
    MutationObserver: class { observe() {} }
  });
  return { HTMLAnchorElement, originalClick, URL };
}

test('Android shell handles every system inset and native blob downloads', async () => {
  const source = [
    await readFile(androidActivityUrl, 'utf8'),
    await readFile(androidDownloadBridgeUrl, 'utf8')
  ].join('\n');

  assert.match(source, /params\.leftMargin\s*=\s*bars\.left/);
  assert.match(source, /params\.rightMargin\s*=\s*bars\.right/);
  assert.match(source, /WindowInsetsCompat\.Type\.displayCutout\(\)/);
  assert.match(source, /addJavascriptInterface\([^,]+,\s*"IERPDownloads"\)/);
  assert.match(source, /setDestinationInExternalPublicDir/);
  assert.match(source, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
});

test('native WebView bootstrap scripts remain valid JavaScript', async () => {
  const [androidSource, macSource] = await Promise.all([
    readFile(androidWorkspaceUrl, 'utf8'),
    readFile(macWorkspaceUrl, 'utf8')
  ]);
  const androidScript = androidBootstrap(androidSource);
  const macScript = macSource.match(
    /static let loginPersistenceScript = """([\s\S]*?)"""/
  )?.[1];

  assert.ok(androidScript, 'Android bootstrap script is missing');
  assert.ok(macScript, 'macOS login script is missing');
  assert.doesNotThrow(() => new Function(androidScript));
  assert.doesNotThrow(() => new Function(macScript));
});

test('Android grants blob download access only to the iERP main document', async () => {
  const script = await androidDownloadBootstrap();

  for (const [pageOrigin, isTopFrame, expected] of [
    [trustedOrigin, true, true],
    [trustedOrigin, false, false],
    ['https://other.example.test:10888', true, false],
    ['https://ierp.example.test:443', true, false]
  ]) {
    const window = { fetch() {}, location: { origin: pageOrigin }, IERPDownloads: {} };
    window.top = isTopFrame ? window : {};
    const { HTMLAnchorElement, originalClick } = installAndroidDownloadTestPage(script, window);
    assert.equal(HTMLAnchorElement.prototype.click !== originalClick, expected);
  }
});

test('Android exports the original Blob even when the page revokes its URL immediately', async () => {
  const script = await androidDownloadBootstrap();
  const events = [];
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const window = {
    fetch() { throw new Error('Blob URL fetch disabled'); },
    alert: finish,
    btoa,
    location: { origin: trustedOrigin },
    crypto: { randomUUID: () => 'download-id' },
    IERPDownloads: {
      begin(...args) { events.push(args); return true; },
      append(...args) { events.push(args); return true; },
      finish(...args) { events.push(args); finish(); return true; },
      abort: finish
    }
  };
  window.top = window;
  const { HTMLAnchorElement, URL } = installAndroidDownloadTestPage(script, window);
  const link = new HTMLAnchorElement();
  link.href = URL.createObjectURL(new Blob(['项目,1'], { type: 'text/csv' }));
  link.click();
  assert.equal(link.usedBrowserClick, true);
  link.download = '工程.csv';
  link.click();
  URL.revokeObjectURL(link.href);

  await done;
  assert.deepEqual(events, [
    ['sample-token', 'download-id', '工程.csv', 'text/csv', '8'],
    ['sample-token', 'download-id', Buffer.from('项目,1').toString('base64')],
    ['sample-token', 'download-id']
  ]);
});
