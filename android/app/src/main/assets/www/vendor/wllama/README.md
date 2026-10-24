# vendor/wllama

Yerel yapay zekâ motoru: [wllama](https://github.com/ngxson/wllama) 3.12.0 (MIT) —
llama.cpp'nin WebAssembly derlemesi. Bu klasör `tools/fetch-local-ai.sh` ile doldurulur
(motor dosyaları boyutlu olduğu ve paket yöneticisinden geldiği için depoya elle konmadı).

Klasör boşsa uygulama motoru ilk kullanımda jsDelivr CDN'den alır
(`js/providers/local.js` → `ENGINE_URLS`); dolduktan sonra internetsiz de çalışır.

Beklenen dosyalar: `index.js` (+ yanındaki modüller) ve `wllama.wasm`.
