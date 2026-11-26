// Estudaí — guarda a "casca" do app para abrir rápido e funcionar sem internet
// (a IA continua precisando de internet).
const CACHE = "estudai-v14";
const ARQUIVOS = ["/", "/index.html", "/manifest.json", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // rede primeiro (pega atualizações), cache se estiver sem internet
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});

// Avisos no celular (enviados pelo Supabase, função estudai-lembretes)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Estudaí", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Estudaí", {
    body: d.body || "Tem atividade chegando na sua agenda.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || "estudai",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ("focus" in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
