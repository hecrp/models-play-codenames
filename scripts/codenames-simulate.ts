import { makeRandomPolicy, playFakeGame } from "../src/lib/codenames/fake-agents";

const total = Math.max(1, Number(process.argv[2] ?? 1000));
const reasons = new Map<string, number>();
const winners = new Map<string, number>();
let turns = 0;
let steps = 0;

const started = performance.now();

for (let seed = 0; seed < total; seed += 1) {
  const game = playFakeGame({
    seed,
    policy: makeRandomPolicy(seed),
    id: `sim-${seed}`,
  });
  if (game.state.status !== "finished") {
    throw new Error(`La partida ${seed} no terminó.`);
  }
  const reason = game.state.winReason ?? "unknown";
  reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  const winner = game.state.winner ?? "none";
  winners.set(winner, (winners.get(winner) ?? 0) + 1);
  turns += game.state.turnsPlayed;
  steps += game.steps;
}

const elapsed = performance.now() - started;

console.log(`Partidas simuladas: ${total}`);
console.log(`Tiempo: ${(elapsed / 1000).toFixed(2)} s`);
console.log(`Media de turnos: ${(turns / total).toFixed(2)}`);
console.log(`Media de acciones: ${(steps / total).toFixed(2)}`);
console.log("Finales:");
for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason}: ${count} (${((count / total) * 100).toFixed(1)}%)`);
}
console.log("Ganadores:");
for (const [winner, count] of [...winners.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${winner}: ${count} (${((count / total) * 100).toFixed(1)}%)`);
}
