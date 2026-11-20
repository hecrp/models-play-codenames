# Models play Codenames

Partidas de **Codenames** entre modelos de IA (y, si quieres, contigo en un asiento), con **Next.js 16**, **React 19**, **Tailwind CSS 4** y la **API de OpenRouter**. La interfaz y el juego (palabras, prompts y charla de mesa) están en **español e inglés**.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local     # en Windows: Copy-Item .env.example .env.local
# edita .env.local y pega tu clave de https://openrouter.ai/keys
pnpm dev
```

Abre http://localhost:3000 (la antigua ruta `/codenames` redirige ahí).

También puedes pegar la clave en **Ajustes → API key de OpenRouter**: se guarda en `localStorage` y se envía solo a tu servidor en la cabecera `x-openrouter-key`.

## Funcionalidad

- **Cuatro asientos**: jefe y agente de rojo y azul, cada uno con modelo, temperatura y avatar. Presets: mismo modelo, rojo vs azul, jefes vs agentes.
- **Juega tú**: puedes ocupar un asiento. Como jefe escribes la pista; como agente haces clic en una carta o la escribes (sin importar mayúsculas ni tildes; si no coincide, `deepseek/deepseek-v4-flash` intenta interpretarla y te pide confirmación). Mientras juegas no hay modo dios y el servidor no envía los colores ocultos.
- **Idiomas**: selector ES/EN en la cabecera. Las partidas nuevas se crean en el idioma de la interfaz (banco de palabras, reglas, prompts, mensajes del árbitro e historial).
- **Reglas oficiales**: pista de una palabra + número (0 = intentos ilimitados), hasta número + 1 intentos, al menos un intento por turno, plurales y derivados prohibidos, victoria en el turno del rival. Regla de mesa: límite de 40 turnos.
- **Charla de mesa**: cada jugada incluye una frase corta (`say`) que se ve en la interfaz y viaja en el historial público; las palabras ocultas se tapan con «…».
- **Controles**: reproducir, pausa, modo manual (siguiente jugada / terminar turno), velocidad 0,25×–2×, modo dios y abortar.
- **Replay** sin volver a llamar a los modelos, exportable con `?format=jsonl`.
- **Persistencia**: SQLite nativo de Node en `data/codenames/codenames.db` (ignorado por git).
- **Resiliencia**: reintentos con backoff y `Retry-After` ante 429/5xx; si OpenRouter sigue fallando, la partida se pausa en vez de perder turnos.

## Endpoints

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `GET`  | `/api/models` | Catálogo de modelos de OpenRouter (con fallback). |
| `POST` | `/api/codenames/games` | Crea una partida (asientos, semilla, idioma). |
| `GET`  | `/api/codenames/games` | Lista las partidas recientes. |
| `GET`  | `/api/codenames/games/[id]` | Estado de espectador + estado del runtime. |
| `GET`  | `/api/codenames/games/[id]/events` | SSE reanudable con `Last-Event-ID`. |
| `POST` | `/api/codenames/games/[id]/control` | `pause`, `resume`, `step`, `step_turn`, `abort`, `speed`. |
| `POST` | `/api/codenames/games/[id]/human` | Jugada de la persona (`action`) o interpretación de una carta escrita (`resolve`). |
| `GET`  | `/api/codenames/games/[id]/replay` | Eventos completos; `?format=jsonl` para exportar. |

Cabeceras opcionales: `x-openrouter-key` (clave desde Ajustes) y `x-locale` (`es`/`en`, idioma de los mensajes de error).

Variables de entorno:

- `OPENROUTER_API_KEY` (recomendada)
- `OPENROUTER_SITE_URL` (por defecto `http://localhost:3000`)
- `OPENROUTER_SITE_NAME` (por defecto `Models play Codenames`)
- `CODENAMES_MAX_ACTIVE` (por defecto `2`)
- `CODENAMES_DATA_DIR` (por defecto `./data/codenames`)
- `CODENAMES_RESOLVER_MODEL` (por defecto `deepseek/deepseek-v4-flash`)

## Partidas por consola

```bash
# Simulación sin tokens: 1.000 partidas con agentes aleatorios
pnpm codenames:simulate 1000

# Partida real con un modelo barato
pnpm codenames:play --model=openai/gpt-oss-20b --seed=42 --max-cost=0.05
```

## Tests

```bash
pnpm test        # motor, vistas, orquestador, simulación, inglés, humano y OpenRouter
pnpm typecheck
pnpm build
```

## Notas y límites

- **Seguridad en producción**: con `OPENROUTER_API_KEY` definida, cualquiera que alcance la URL puede crear partidas y consumir saldo. Añade autenticación y límites antes de desplegarlo públicamente.
- La clave enviada desde el navegador se guarda **solo en memoria** durante la partida; no se escribe en la base de datos ni en los eventos.
- **Una sola instancia**: el orquestador vive en el proceso Node. Reiniciar el servidor interrumpe la partida, pero estado y eventos están en SQLite y se puede reanudar. En serverless o con varias réplicas haría falta un worker/cola.
- **Node 24+**: se usa `node:sqlite`, sin dependencias nativas.
- `cacheComponents` está activo en `next.config.ts`; los `GET` de catálogo y partidas fuerzan render dinámico.
