"use client";

import type { ReactNode } from "react";
import {
  BookOpen,
  ChevronLeft,
  Coins,
  Crown,
  Eye,
  Gauge,
  Languages,
  MessagesSquare,
  Settings,
  Shield,
  Skull,
  Sparkles,
  Target,
  Timer,
  Users,
} from "lucide-react";
import type { Theme } from "@/lib/storage";
import { useStrings, type Locale } from "@/lib/i18n";
import { IconButton, Logo } from "@/components/ui";
import { ThemeMenu } from "./effects";
import { LocaleSwitch } from "./locale-switch";

const model = (name: string) => (
  <span className="font-medium text-ink">{name}</span>
);

const ES = {
  badge: "Cómo funciona",
  settings: "Ajustes de Codenames",
  title: "Cómo funciona Codenames",
  subtitle:
    "Dos equipos, cuatro modelos y un árbitro que lo sabe todo pero solo cuenta lo que cada rol debe saber.",
  goal: {
    title: "Objetivo",
    paragraphs: [
      <>
        En el tablero hay 25 palabras. Cada equipo tiene un color oculto: rojo
        o azul. El objetivo es que el <strong>agente</strong> de tu equipo
        revele todas las palabras de su color antes que el rival.
      </>,
      <>
        Si alguien revela el <strong>asesino</strong>, ese equipo pierde al
        instante. Se puede ganar en el turno del rival si este revela tu última
        carta. Como regla de mesa, si se acaban los 40 turnos gana el equipo con
        menos cartas propias sin revelar; si empatan, son tablas.
      </>,
    ] as ReactNode[],
  },
  board: {
    title: "El tablero",
    rows: [
      ["Equipo que empieza", "9 cartas"],
      ["Equipo que va segundo", "8 cartas"],
      ["Neutrales", "7 cartas"],
      ["Asesino", "1 carta"],
    ] as Array<[string, string]>,
    note: "La semilla fija las 25 palabras, los colores y quién empieza. La misma semilla genera siempre el mismo tablero. Puedes escribir una semilla concreta o dejar que se genere al azar.",
  },
  turn: {
    title: "Un turno, paso a paso",
    steps: [
      <>
        El <strong>jefe de espías</strong> da una pista: una sola palabra y un
        número del 0 al 9 (cuántas cartas propias relaciona).
      </>,
      <>
        El <strong>agente</strong> va revelando cartas de una en una. Puede
        hacer hasta <strong>número + 1</strong> intentos; con pista{" "}
        <strong>0</strong>, intentos sin límite.
      </>,
      <>
        Si revela una carta propia, sigue. Si revela una del rival o una
        neutral, el turno termina. Si revela el asesino, pierde.
      </>,
      <>
        El agente <strong>debe</strong> intentar al menos una carta; después
        puede plantarse con <strong>stop</strong> cuando quiera.
      </>,
    ] as ReactNode[],
    note: "El agente adivina una carta por llamada: así decide si seguir o plantarse viendo el resultado de cada revelación.",
  },
  clues: {
    title: "Pistas válidas y errores",
    items: [
      "Una sola palabra, sin espacios ni guiones.",
      "Debe referirse al significado: nada de letras, rimas ni posiciones en el tablero.",
      "No puede ser una palabra sin revelar ni una forma de ella (plural incluido), ni contenerla ni estar contenida en ella. Se ignoran mayúsculas y tildes.",
      "Si una pista o una adivinanza es ilegal, el árbitro la devuelve con el motivo y el modelo tiene hasta 3 intentos.",
      "Si se agotan, el jefe pierde el turno o el agente pierde el turno de forma forzada. Cada fallo queda registrado.",
      "Un timeout de 60 s cuenta como intento fallido.",
    ],
  },
  visibility: {
    title: "Quién ve qué",
    headers: ["Rol", "Colores ocultos", "Pistas e historial"],
    rows: [
      ["Jefe de espías", "Todos", "Sí"],
      ["Agente", "Solo reveladas", "Sí"],
      ["Espectador", "Configurable (modo dios)", "Sí"],
    ] as Array<[string, string, string]>,
    note: "Cada asiento recibe solo la vista de su rol. El razonamiento de un modelo puede verse en la interfaz, pero nunca se incluye en el prompt de otro modelo.",
    human: (
      <>
        Una persona puede ocupar <strong>un asiento</strong> (jefe o agente) y
        jugar contra los modelos. Mientras juega solo ve lo que ve su rol: el
        modo dios no está disponible.
      </>
    ) as ReactNode,
  },
  language: {
    title: "Idioma",
    paragraphs: [
      <>
        La partida se puede jugar en <strong>español</strong> o en{" "}
        <strong>inglés</strong>: las palabras del tablero, los prompts de los
        modelos y la charla de mesa usan el idioma de la partida.
      </>,
      <>
        Las partidas nuevas usan el idioma actual de la interfaz. Cámbialo con
        el selector ES/EN de la cabecera antes de empezar.
      </>,
    ] as ReactNode[],
  },
  talk: {
    title: "Charla de mesa",
    text: "Cada jugada incluye una frase corta del modelo (máximo 180 caracteres) que se ve en el tablero y en el registro, y que los demás modelos leen en el historial público. Así la partida se sigue como una conversación, no como una lista de jugadas.",
    note: "Las frases son públicas; el razonamiento privado no. Si una frase menciona una palabra oculta del tablero, el árbitro la tapa con «…» para que nadie filtre información.",
  },
  controls: {
    title: "Controles de la partida",
    rows: [
      ["Reproducir / pausa", "Continúa o detiene el job"],
      ["Paso a paso", "Ejecuta una acción por clic"],
      ["Velocidad", "0,25× · 0,5× · 1× · 2×"],
      ["Modo dios", "Muestra los colores ocultos"],
      ["Abortar", "Termina la partida"],
      ["Atajos", "Espacio, → y G"],
    ] as Array<[string, string]>,
    note: "El orquestador vive en el servidor: cerrar la pestaña no detiene la partida. Al volver, la UI se reconecta al flujo de eventos.",
  },
  models: {
    title: "Modelos, avatares y presets",
    paragraphs: [
      <>
        Cada partida tiene cuatro asientos: jefe y agente de rojo y azul. Cada
        uno tiene su propio modelo, temperatura y avatar. Puedes aplicar un
        mismo modelo a los cuatro, enfrentar rojo contra azul o separar jefes de
        agentes para comparar roles.
      </>,
      <>
        Los modelos baratos de ejemplo son {model("gpt-oss-20b")},{" "}
        {model("Llama 3.1 8B")}, {model("Ling 3.0 Flash")} y{" "}
        {model("GLM 5.3 Flash")}. Todos admiten tool calling.
      </>,
      <>
        Al terminar puedes jugar una{" "}
        <strong>revancha con colores cambiados</strong>: misma semilla, modelos
        intercambiados de equipo, para comparar sin el sesgo de quién empieza.
      </>,
    ] as ReactNode[],
  },
  end: {
    title: "Final, métricas y replay",
    paragraphs: [
      "Gana el equipo que revela todas sus cartas, el rival del equipo que revela el asesino, o el equipo con menos cartas restantes al agotar los 40 turnos.",
      "Al terminar verás coste, tokens, latencia, pistas ilegales, precisión, plantadas y los modelos de cada asiento. El replay reproduce el tablero y el registro con los eventos guardados, sin volver a llamar a ningún modelo.",
    ],
    exportPrefix: "La partida también se puede exportar como JSONL desde",
  },
  risks: {
    title: "Riesgos que conviene recordar",
    items: [
      "Modelos distintos cumplen las reglas de forma distinta: las pistas ilegales son parte de la comparación.",
      "El tablero es reproducible, pero las respuestas de los modelos no lo son al 100 %; el replay sale del log, no de nuevas llamadas.",
      "El equipo que empieza tiene una carta más: por eso existen las partidas pareadas con colores intercambiados.",
      "El coste depende del modelo. Usa el tope de coste y los modelos baratos para experimentar.",
    ],
  },
  tip: (
    <>
      Para una primera partida: elige <strong>GPT-OSS 20B</strong> en los
      cuatro asientos, semilla aleatoria y velocidad 1×. Es barato, rápido y
      suele completar la partida sin sustos.
    </>
  ) as ReactNode,
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    badge: "How it works",
    settings: "Codenames settings",
    title: "How Codenames works",
    subtitle:
      "Two teams, four models and a referee who knows everything but only tells each role what it is supposed to know.",
    goal: {
      title: "Goal",
      paragraphs: [
        <>
          The board has 25 words. Each team has a hidden color: red or blue.
          The goal is for your team&apos;s <strong>operative</strong> to reveal
          all the words of its color before the rival does.
        </>,
        <>
          If someone reveals the <strong>assassin</strong>, that team loses
          instantly. You can win on the rival&apos;s turn if they reveal your
          last card. As a table rule, if the 40 turns run out, the team with
          fewer of its own cards left unrevealed wins; if tied, it is a draw.
        </>,
      ],
    },
    board: {
      title: "The board",
      rows: [
        ["Starting team", "9 cards"],
        ["Second team", "8 cards"],
        ["Neutral", "7 cards"],
        ["Assassin", "1 card"],
      ],
      note: "The seed fixes the 25 words, the colors and who starts. The same seed always produces the same board. You can type a specific seed or let one be generated at random.",
    },
    turn: {
      title: "A turn, step by step",
      steps: [
        <>
          The <strong>spymaster</strong> gives a clue: a single word and a
          number from 0 to 9 (how many of their own cards it relates to).
        </>,
        <>
          The <strong>operative</strong> reveals cards one at a time. They can
          make up to <strong>number + 1</strong> guesses; with a{" "}
          <strong>0</strong> clue, guesses are unlimited.
        </>,
        <>
          Revealing an own card lets them continue. Revealing a rival or
          neutral card ends the turn. Revealing the assassin loses the game.
        </>,
        <>
          The operative <strong>must</strong> make at least one guess; after
          that they can <strong>stop</strong> whenever they want.
        </>,
      ],
      note: "The operative guesses one card per call, so it decides whether to continue or stop after seeing the result of each reveal.",
    },
    clues: {
      title: "Valid clues and errors",
      items: [
        "A single word, with no spaces or hyphens.",
        "It must relate to meaning: no letters, rhymes or board positions.",
        "It cannot be an unrevealed word or a form of one (plurals included), nor contain it or be contained in it. Case and accents are ignored.",
        "If a clue or guess is illegal, the referee returns it with the reason and the model gets up to 3 attempts.",
        "If they run out, the spymaster loses the turn or the operative's turn is forcibly ended. Every failure is logged.",
        "A 60 s timeout counts as a failed attempt.",
      ],
    },
    visibility: {
      title: "Who sees what",
      headers: ["Role", "Hidden colors", "Clues and history"],
      rows: [
        ["Spymaster", "All", "Yes"],
        ["Operative", "Revealed only", "Yes"],
        ["Spectator", "Configurable (god mode)", "Yes"],
      ],
      note: "Each seat only receives its role's view. A model's reasoning can be shown in the interface, but it is never included in another model's prompt.",
      human: (
        <>
          A person can take <strong>one seat</strong> (spymaster or operative)
          and play against the models. While playing they only see what their
          role sees: god mode is not available.
        </>
      ),
    },
    language: {
      title: "Language",
      paragraphs: [
        <>
          Games can be played in <strong>Spanish</strong> or{" "}
          <strong>English</strong>: the board words, the model prompts and the
          table talk all use the game&apos;s language.
        </>,
        <>
          New games use the current interface language. Change it with the
          ES/EN switch in the header before starting.
        </>,
      ],
    },
    talk: {
      title: "Table talk",
      text: "Every move includes a short line from the model (180 characters max) shown on the board and in the log, which the other models read in the public history. That way the game reads like a conversation, not a list of moves.",
      note: "Lines are public; private reasoning is not. If a line mentions a hidden board word, the referee masks it with «…» so nobody leaks information.",
    },
    controls: {
      title: "Game controls",
      rows: [
        ["Play / pause", "Resumes or stops the job"],
        ["Step", "Runs one action per click"],
        ["Speed", "0.25× · 0.5× · 1× · 2×"],
        ["God mode", "Shows the hidden colors"],
        ["Abort", "Ends the game"],
        ["Shortcuts", "Space, → and G"],
      ],
      note: "The orchestrator lives on the server: closing the tab does not stop the game. When you come back, the UI reconnects to the event stream.",
    },
    models: {
      title: "Models, avatars and presets",
      paragraphs: [
        <>
          Each game has four seats: red and blue spymaster and operative. Each
          one has its own model, temperature and avatar. You can apply the same
          model to all four, pit red against blue, or split spymasters from
          operatives to compare roles.
        </>,
        <>
          The cheap example models are {model("gpt-oss-20b")},{" "}
          {model("Llama 3.1 8B")}, {model("Ling 3.0 Flash")} and{" "}
          {model("GLM 5.3 Flash")}. All of them support tool calling.
        </>,
        <>
          When the game ends you can play a{" "}
          <strong>rematch with swapped colors</strong>: same seed, models
          swapped between teams, to compare without the first-move bias.
        </>,
      ],
    },
    end: {
      title: "Ending, metrics and replay",
      paragraphs: [
        "The winner is the team that reveals all its cards, the rival of the team that reveals the assassin, or the team with fewer cards left when the 40 turns run out.",
        "At the end you will see cost, tokens, latency, illegal clues, accuracy, stops and the models in each seat. The replay reproduces the board and the log from the stored events, without calling any model again.",
      ],
      exportPrefix: "The game can also be exported as JSONL from",
    },
    risks: {
      title: "Risks worth remembering",
      items: [
        "Different models follow the rules differently: illegal clues are part of the comparison.",
        "The board is reproducible, but model answers are not 100 % so; the replay comes from the log, not from new calls.",
        "The starting team has one extra card: that is why paired games with swapped colors exist.",
        "Cost depends on the model. Use the cost cap and the cheap models to experiment.",
      ],
    },
    tip: (
      <>
        For a first game: pick <strong>GPT-OSS 20B</strong> in all four seats,
        a random seed and 1× speed. It is cheap, fast and usually finishes the
        game without surprises.
      </>
    ),
  },
};

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass lift animate-rise rounded-2xl border p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent shadow-[0_0_20px_-8px_var(--accent)]">
          {icon}
        </span>
        <h2 className="font-display text-[19px] font-semibold uppercase tracking-[0.08em] text-ink">
          {title}
        </h2>
      </div>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

function KeyValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line/80 bg-canvas/60 px-3 py-2">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <span className="text-right text-[13.5px] text-ink">{value}</span>
    </div>
  );
}

export function RulesScreen({
  onBack,
  backLabel,
  theme,
  onThemeChange,
  onOpenSettings,
}: {
  onBack: () => void;
  backLabel: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenSettings: () => void;
}) {
  const t = useStrings(STRINGS);
  return (
    <div className="relative z-10 min-h-dvh text-ink">
      <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-0 border-b px-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">{backLabel}</span>
        </button>
        <Logo size={24} />
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold tracking-tight text-ink">
            Codenames
          </span>
          <span className="hidden rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent sm:inline">
            {t.badge}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitch className="mr-1" />
          <ThemeMenu theme={theme} onChange={onThemeChange} />
          <IconButton label={t.settings} onClick={onOpenSettings}>
            <Settings size={16} />
          </IconButton>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-3 pb-20 pt-7 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="animate-float grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-team-red via-accent to-team-blue text-white shadow-[0_10px_30px_-8px_var(--accent)]">
            <BookOpen size={20} />
          </span>
          <div>
            <h1 className="text-gradient font-display text-4xl font-bold uppercase tracking-[0.06em]">
              {t.title}
            </h1>
            <p className="mt-0.5 text-[14.5px] text-muted">{t.subtitle}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <Section icon={<Target size={16} />} title={t.goal.title}>
            {t.goal.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </Section>

          <Section icon={<Users size={16} />} title={t.board.title}>
            <div className="grid gap-2 sm:grid-cols-2">
              {t.board.rows.map(([label, value]) => (
                <KeyValue key={label} label={label} value={value} />
              ))}
            </div>
            <p>{t.board.note}</p>
          </Section>

          <Section icon={<Crown size={16} />} title={t.turn.title}>
            <ol className="list-decimal space-y-2 pl-5">
              {t.turn.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
            <p className="rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13.5px] text-muted">
              {t.turn.note}
            </p>
          </Section>

          <Section icon={<Shield size={16} />} title={t.clues.title}>
            <ul className="list-disc space-y-1.5 pl-5">
              {t.clues.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section icon={<Eye size={16} />} title={t.visibility.title}>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-[13.5px]">
                <thead className="bg-canvas/70 text-left text-[12px] uppercase tracking-wide text-faint">
                  <tr>
                    {t.visibility.headers.map((header) => (
                      <th key={header} className="px-3 py-2">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-ink-soft">
                  {t.visibility.rows.map(([role, colors, history]) => (
                    <tr key={role} className="border-t border-line">
                      <td className="px-3 py-2 font-medium text-ink">{role}</td>
                      <td className="px-3 py-2">{colors}</td>
                      <td className="px-3 py-2">{history}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{t.visibility.note}</p>
            <p>{t.visibility.human}</p>
          </Section>

          <Section icon={<Languages size={16} />} title={t.language.title}>
            {t.language.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </Section>

          <Section icon={<MessagesSquare size={16} />} title={t.talk.title}>
            <p>{t.talk.text}</p>
            <p className="rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13.5px] text-muted">
              {t.talk.note}
            </p>
          </Section>

          <Section icon={<Gauge size={16} />} title={t.controls.title}>
            <div className="grid gap-2 sm:grid-cols-2">
              {t.controls.rows.map(([label, value]) => (
                <KeyValue key={label} label={label} value={value} />
              ))}
            </div>
            <p>{t.controls.note}</p>
          </Section>

          <Section icon={<Sparkles size={16} />} title={t.models.title}>
            {t.models.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </Section>

          <Section icon={<Timer size={16} />} title={t.end.title}>
            {t.end.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p className="rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13.5px] text-muted">
              {t.end.exportPrefix}{" "}
              <code className="break-all rounded bg-code px-1 py-0.5 font-mono text-[12px]">
                /api/codenames/games/&lt;id&gt;/replay?format=jsonl
              </code>
              .
            </p>
          </Section>

          <Section icon={<Skull size={16} />} title={t.risks.title}>
            <ul className="list-disc space-y-1.5 pl-5">
              {t.risks.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <div className="flex items-center gap-2 rounded-2xl border border-accent/25 bg-accent-soft p-4">
            <Coins size={18} className="shrink-0 text-accent" />
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              {t.tip}
            </p>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="btn-glow btn-shine mx-auto mt-2 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-semibold text-accent-ink"
          >
            <ChevronLeft size={16} />
            {backLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
