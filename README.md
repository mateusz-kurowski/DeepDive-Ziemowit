# HackNation-2026-proj2

Wstępny szkic projektu dla HackNation 2026.

## Uruchomienie

```bash
npm install
npm run dev
```

Po uruchomieniu aplikacja będzie dostępna pod adresem http://localhost:3000.

## Struktura

- `apps/web` — frontend Next.js i endpointy aplikacji;
- `package.json` — skrypty uruchamiające workspace przez npm.

## Weryfikacja

```bash
curl http://localhost:3000/api/health
```

Oczekiwana odpowiedź: `{"status":"ok"}`
