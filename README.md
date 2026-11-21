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

### Moduł meteorologiczny

Frontend ma formularz współrzędnych i daty. Dane pobiera endpoint `POST /api/weather`.

```bash
curl -X POST http://localhost:3000/api/weather \
  -H 'Content-Type: application/json' \
  -d '{"latitude":52.23,"longitude":21.01,"date":"2026-11-21"}'
```

Odpowiedź zawiera bieżące wskaźniki 30-dniowe oraz `historicalSummary`:
porównanie opadów i temperatury z dziesięcioletnim okresem historycznym.
Gdy dostawca archiwum zwróci limit lub awarię, moduł wyświetla jawny status
`unavailable` i nie prezentuje danych jako dostępnych.
