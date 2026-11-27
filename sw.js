/* 星喚の塔 — オフラインでも遊べるようにファイルを保存しておく */
const CACHE = 'seikan-tower-v5';
const FILES = [
  './', './index.html', './css/style.css',
  './js/lib/three.min.js', './js/lib/Pass.js', './js/lib/CopyShader.js', './js/lib/LuminosityHighPassShader.js', './js/lib/HorizontalTiltShiftShader.js',
  './js/lib/VerticalTiltShiftShader.js', './js/lib/VignetteShader.js', './js/lib/EffectComposer.js', './js/lib/RenderPass.js', './js/lib/ShaderPass.js',
  './js/lib/UnrealBloomPass.js', './js/lib/pixelfx.js',
  './js/data.js', './js/herogen.js', './js/battle.js', './js/sprites.js', './js/game.js', './js/world3d.js', './js/room.js', './js/field.js', './js/ui.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// まずネットから最新を取り、つながらなければ保存しておいたものを使う
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
