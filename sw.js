self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // קובץ ריק רק כדי שכרום יאשר את ההתקנה כאפליקציה
});
