# Spec: Codenames IA vs IA (modo tablero)

Nov 19, 2026 · @Héctor

## Objetivo y alcance

La v1 permite ver partidas de Codenames entre modelos de IA en una vista de tablero dentro del chat existente, con avatares y un modelo seleccionable por cada rol.

- Cuatro asientos: jefe de espías y agente de cada equipo (rojo y azul), cada uno con su propio modelo.
- Partida completa automática (IA vs IA) con pausa, paso a paso y velocidad ajustable.
- Un árbitro determinista en el backend es el único dueño del estado. Ningún modelo recibe información que su rol no deba ver.
- Cada partida queda registrada para replay y para comparar modelos.

**Fuera de la v1:** jugadores humanos, multijugador en red, variante Duet (cooperativa), versión con imágenes, voz.

**Criterio de éxito:** una partida completa termina sin intervención, sin jugadas ilegales sin resolver, y es reproducible a nivel de tablero con la misma semilla.

## Reglas del juego

Se usa la variante estándar de 25 cartas en una cuadrícula de 5×5. La semilla de la partida fija las palabras, los colores y qué equipo empieza.

| Tipo de carta | Cantidad |
| --- | --- |
| Equipo que empieza | 9 |
| Equipo que va segundo | 8 |
| Neutrales | 7 |
| Asesino | 1 |

**Turno.** El jefe de espías da una pista (una palabra y un número de 0 a 9). El agente de su equipo adivina una carta cada vez, hasta un máximo de número + 1 intentos, y puede plantarse cuando quiera.

**Fin de turno.** Termina si el agente revela una carta neutral o del rival, si se planta o si agota sus intentos. Revelar el asesino pierde la partida al instante. Gana el equipo que revele todas sus cartas.

**Pista válida.** Una sola palabra, sin espacios ni guiones. No puede ser igual a una carta aún sin revelar, ni contenerla ni estar contenida en ella (comparación en minúsculas y sin tildes).

**Errores de los modelos.** Una pista o un intento ilegal se devuelve al modelo con el motivo y se permiten 3 reintentos. Si se agotan, el jefe pierde el turno o el agente se planta de forma forzada. Cada fallo se registra.

**Límite de turnos.** 40 turnos en total. Si se alcanza, gana el equipo con menos cartas restantes y el empate se declara tablas.

**Palabras.** Lista de unas 400 palabras en español (`words/es.txt`), configurable por idioma. Se sortean 25 sin repetir a partir de la semilla.

## Arquitectura

Todo cambio de estado pasa por el motor del árbitro: la UI solo observa y envía órdenes de control, y los modelos solo reciben vistas filtradas y devuelven acciones.

&#91;embedded content: arquitectura · 8 componentes\]

La UI habla con la API; el orquestador conduce la partida, consulta al motor y llama a los agentes a través de los adaptadores del chat.

- El estado es único y vive en el motor (`engine.apply(accion)`); nada más lo modifica.
- El log de eventos es la fuente de verdad: el estado se puede reconstruir reproduciéndolo.
- Los modelos son intercambiables detrás de un adaptador con la misma interfaz.
- La UI no contiene reglas del juego.

## Estado y visibilidad por rol

El árbitro guarda un único estado y genera para cada llamada a un modelo una vista filtrada con `view_for(rol, estado)`. Los modelos no guardan nada entre llamadas: cada vez reciben la vista completa de su rol más el historial público de la partida. Así se evitan filtraciones de información oculta y las partidas se pueden reproducir.

```json
{
  "id": "g_01",
  "seed": 42,
  "lang": "es",
  "starting_team": "red",
  "board": [{ "word": "MAR", "color": "blue", "revealed": false }],
  "turn": { "team": "red", "phase": "clue", "clue": null, "guesses_left": 0 },
  "status": "in_progress",
  "winner": null,
  "events": []
}
```

`board` tiene 25 elementos. `color` es `red`, `blue`, `neutral` o `assassin`. `phase` es `clue` o `guess`.

| Quién | Ve los colores | Ve pistas y revelaciones | Nota |
| --- | --- | --- | --- |
| Jefe de espías | Todos | Sí | Recibe la lista de palabras sin revelar de cada color |
| Agente | Solo cartas ya reveladas | Sí | No ve el razonamiento de nadie |
| Espectador (UI) | Configurable (modo dios) | Sí | Por defecto ve todos los colores |

El razonamiento opcional de cada modelo se muestra en la UI, pero nunca se incluye en el prompt de otro modelo.

## Protocolo de turnos y contratos

Cada acción de un modelo es una llamada a una herramienta con esquema estricto (tool calling con herramienta forzada). El árbitro valida la acción, aplica el cambio o devuelve un error con código y deja reintentar, hasta 3 veces.

Las llamadas son estrictamente secuenciales y el agente adivina una carta por llamada: así decide si seguir o plantarse viendo el resultado de cada carta. Cada llamada tiene un timeout de 60 s, y un timeout cuenta como intento fallido.

&#91;embedded content: flujo de un turno · 2 decisiones, 2 finales\]

La pista se reintenta hasta 3 veces; después, el agente adivina carta a carta hasta que el resultado cambia el turno o termina la partida.

**Acciones de los modelos**

| Rol | Herramienta | Argumentos |
| --- | --- | --- |
| Jefe de espías | `give_clue` | `word` (string), `number` (entero 0–9), `reasoning` (opcional, máx. 300 caracteres) |
| Agente | `guess` | `word` (string, una carta sin revelar), `reasoning` (opcional) |
| Agente | `stop` | `reasoning` (opcional) |

**Errores del árbitro**

```json
{ "ok": false, "code": "clue_on_board", "message": "MAR está en el tablero", "attempts_left": 2 }
```

Códigos: `clue_on_board`, `clue_not_single_word`, `number_out_of_range`, `word_not_on_board`, `word_already_revealed`, `wrong_phase`, `timeout`.

**Eventos hacia la UI** (SSE, con `id` incremental para reanudar con `Last-Event-ID`)

```json
{ "id": 17, "type": "guess_made", "seat": "red_operative",
  "data": { "word": "MAR", "color": "blue", "result": "opponent" } }
```

Tipos: `game_started`, `turn_started`, `thinking` (empieza o termina, por asiento), `clue_given`, `guess_made`, `turn_ended` (con motivo), `agent_error`, `game_over` (con ganador y motivo).

## Agentes IA y selección de modelos

Cada partida tiene cuatro asientos y cada uno se configura por separado. Los prompts viven en ficheros versionados (`prompts/v1/spymaster.md`, `prompts/v1/operative.md`) y la versión usada queda registrada en la partida.

```json
{ "seat": "red_spymaster", "model_id": "<id del selector de modelos>",
  "temperature": 0.7, "avatar_id": "zorro", "display_name": "Zorro" }
```

**Presets de configuración**

- Un mismo modelo en los cuatro asientos (línea base).
- Rojo contra azul con modelos distintos.
- Modelo A de jefe de espías con modelo B de agente en el mismo equipo, para medir cada rol por separado.
- Partida pareada: se repite la misma semilla intercambiando colores y asientos, para comparar sin sesgo de tablero.

Temperatura por defecto: 0,7 para el jefe de espías y 0,3 para el agente. Ambas son editables.

**Esqueleto del prompt del jefe de espías**

```text
Eres el JEFE DE ESPÍAS del equipo {team} en Codenames.
Solo tú ves los colores. Tu agente solo ve las palabras.
Tus palabras: {own_words}
Palabras del rival: {opponent_words}
Neutrales: {neutral_words}
ASESINO (si tu agente lo revela, perdéis): {assassin_word}
Historial público: {history}
Da UNA pista: una sola palabra y un número.
Conecta varias palabras tuyas y evita las del rival y, sobre todo, el asesino.
Responde únicamente con la herramienta give_clue.
```

**Esqueleto del prompt del agente**

```text
Eres el AGENTE del equipo {team} en Codenames.
Cartas sin revelar: {unrevealed_words}
Cartas reveladas y su color: {revealed_with_colors}
Pista actual: {clue} {number}. Intentos restantes: {guesses_left}.
Historial público: {history}
Elige una carta con guess o plántate con stop. Plantarse es una jugada válida.
```

Los prompts incluyen siempre las reglas completas en el mensaje de sistema, sin depender de que el modelo conozca el juego.

**Avatares.** Un catálogo de unos 12 avatares ilustrados en SVG, con aro de color por equipo. Cada asiento tiene un avatar por defecto y el usuario puede cambiarlo. Opcionalmente se muestra una insignia pequeña con el nombre del modelo junto al avatar.

## UI de tablero

La vista de juego pone el tablero de 5×5 en el centro, un panel por equipo a los lados, el log de la partida debajo y los controles arriba.

&#91;embedded content: wireframe de la vista de juego\]

La barra superior lleva el turno, la pista y los controles; el tablero va en el centro, cada equipo tiene su panel con avatares y el log ocupa la franja inferior.

**Pantalla de configuración.** Antes de empezar: cuatro tarjetas de asiento (jefe de espías y agente de cada equipo) con selector de avatar, desplegable de modelo (el mismo del chat) y temperatura. Además, campos de semilla e idioma, un botón de preset rápido y «Iniciar partida».

**Cartas**

| Estado | Aspecto |
| --- | --- |
| Oculta | Papel claro con la palabra en mayúsculas |
| Oculta, modo dios | Igual, con un borde y una marca en la esquina del color real |
| Elegida | Se eleva y se resalta un instante antes de girar |
| Revelada | Gira en 3D (400 ms) y queda rellena: rojo, azul, beige (neutral) o negro (asesino) |

Cada color lleva además un icono distinto, para no depender solo del color.

**Avatares.** Círculo con aro del color del equipo. El asiento que juega se resalta y el resto se atenúa. Mientras el modelo responde, aparece un globo con tres puntos sobre su avatar, y después un globo con la pista o la jugada.

**Controles.** Reproducir y pausa, paso a paso (una acción por clic), velocidad de 0,5×, 1× o 2× (pausa entre acciones), modo dios y abortar. El banner de pista muestra la palabra, el número y los intentos restantes.

**Log inferior.** Reutiliza el componente de mensajes del chat: cada evento es un mensaje con el avatar de quien lo emite. El razonamiento del modelo aparece plegado bajo «ver razonamiento».

**Final de partida.** Una capa con el ganador, el motivo y un resumen de métricas, con los botones «Ver replay», «Revancha con colores cambiados» y «Nueva partida».

**Responsive y accesibilidad.** Desde 1024 px, tres columnas. Por debajo de 768 px, el tablero arriba, los equipos en una fila compacta y el log plegado. Se respeta `prefers-reduced-motion` (sin giro 3D, cambio instantáneo), los controles se manejan con teclado y cada color cumple contraste WCAG AA.

## Integración con el chat existente

El juego es una vista nueva junto al chat y reutiliza su selector de modelos y sus adaptadores de proveedor. La partida se ejecuta como un trabajo en el backend, de modo que cerrar la pestaña no la interrumpe y la UI puede reconectarse.

**Se reutiliza del chat:** el registro de modelos (el mismo del selector), los adaptadores de proveedor con tool calling, las claves y límites de uso, el tema visual y el componente de log de mensajes.

**Módulo nuevo `codenames/`** (se asume backend en Python; el frontend es el que ya tienes):

- `engine.py`: lógica pura y determinista, sin I/O. Estado, reglas, validación y `view_for`.
- `agents.py`: construye los prompts y llama al modelo mediante el adaptador existente.
- `orchestrator.py`: bucle de partida, reintentos, timeouts, pausa, paso y velocidad, emisión de eventos.
- `store.py`: persistencia de partidas y eventos.
- `api.py`: endpoints.

**API**

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/games` | Crea una partida con la configuración de asientos y la semilla; devuelve el id |
| GET | `/games` | Lista las partidas |
| GET | `/games/{id}` | Estado actual en vista de espectador |
| GET | `/games/{id}/events` | Flujo SSE reanudable con `Last-Event-ID` |
| POST | `/games/{id}/control` | `pause`, `resume`, `step`, `abort` y velocidad |
| GET | `/games/{id}/replay` | Eventos completos para reproducir la partida |

**Persistencia.** Tabla `games` (id, seed, config, status, winner, creada) y tabla `events` (game\_id, seq, type, seat, data, uso de tokens, latencia, fecha). SQLite basta para empezar.

**Límites.** Máximo 2 partidas simultáneas por usuario, configurable.

**Tests.** El motor se prueba con `pytest`. Además, se incluyen agentes falsos (aleatorio y guionizado) para recorrer todos los finales posibles sin gastar tokens.

## Logging, replays y métricas

Cada evento se guarda con modelo, versión del prompt, respuesta cruda, tokens de entrada y salida, y latencia. Con eso la UI puede reproducir cualquier partida sin llamar a ningún modelo, y se puede exportar todo como JSONL.

| Métrica | Definición | Para qué sirve |
| --- | --- | --- |
| Victoria | Equipo ganador y motivo (cartas, asesino, límite de turnos) | Comparar modelos |
| Pistas ilegales | Intentos fallidos por asiento | Fiabilidad al seguir reglas |
| Cartas por pista | Media del número dado y media de aciertos | Calidad del jefe de espías |
| Precisión del agente | Porcentaje de cartas propias, rivales, neutrales y asesino | Calidad del agente |
| Plantadas | Veces que el agente se planta antes de agotar intentos | Prudencia |
| Coste y latencia | Tokens y segundos por partida y por asiento | Presupuesto |

Para comparar dos modelos se usan al menos 50 partidas pareadas (misma semilla con colores y asientos intercambiados) y se reporta el porcentaje de victorias con su intervalo de confianza. Una sola partida no demuestra nada.

## Fases y criterios de aceptación

Cada fase termina con una puerta: no se empieza la siguiente hasta cumplirla.

1. **Motor y agentes falsos.** Reglas, validación, `view_for` y semilla. *Puerta:* `pytest` en verde, 1.000 partidas simuladas con agentes aleatorios terminan sin error y la misma semilla genera siempre el mismo tablero.
2. **Orquestador con modelos reales, por consola.** Sin UI, con tool calling y reintentos. *Puerta:* 10 partidas completas sin intervención y ningún turno que se pierda por un fallo no recuperable.
3. **API, SSE y persistencia.** *Puerta:* una UI de prueba se desconecta a mitad de partida, se reconecta y recibe todos los eventos que se perdió.
4. **UI de tablero.** Configurador de asientos, tablero, avatares, banner de pista y controles. *Puerta:* una partida completa se ve de principio a fin y pausa, paso a paso y velocidad funcionan.
5. **Replay y pulido.** Replay, animaciones, modo dios, responsive y accesibilidad. *Puerta:* el replay coincide evento a evento con la partida en vivo y los controles se manejan solo con teclado.
6. **Evaluación pareada.** Lanzador de lotes y panel de métricas. *Puerta:* un lote de 50 partidas pareadas termina y exporta resultados.

## Decisiones abiertas y riesgos

**Por decidir**

- [ ] Stack: la spec asume backend en Python y el frontend web que ya tienes. Confirmar y adaptar `api.py` y la capa de eventos.
- [ ] Idioma de las palabras: español por defecto, ¿hace falta también inglés?
- [ ] Razonamiento de los modelos: ¿visible por defecto o detrás de un interruptor?
- [ ] Tope de coste por partida, con aborto automático al superarlo. Orden de magnitud aproximado: unas 40 llamadas por partida (8–12 turnos, una pista y unos 3 intentos por turno), con prompts de 1–2 mil tokens.
- [ ] Variante con imágenes para modelos multimodales: fuera de la v1.

**Riesgos**

| Riesgo | Mitigación |
| --- | --- |
| Modelos que incumplen la regla de la pista (subcadenas, varias palabras, traducciones) | Validación estricta, error con código y 3 reintentos |
| Resultados no deterministas aunque haya semilla | Reproducible el tablero y el log de eventos; el replay sale del log, no de nuevas llamadas |
| Partidas lentas por llamadas secuenciales | Timeout de 60 s, indicador de «pensando» y control de velocidad |
| Ventaja del equipo que empieza (9 cartas frente a 8) | Partidas pareadas con colores intercambiados |
| Filtración de información oculta a un modelo | Modelos sin estado y `view_for` como única vía de entrada de datos |
