import { describe, expect, it } from "vitest";
import { apply, createGame, validateClue } from "../../src/lib/codenames/engine";
import { buildAgentPrompt } from "../../src/lib/codenames/prompts";
import { operativeSeat, spymasterSeat } from "../../src/lib/codenames/seats";
import { toolsForSeat } from "../../src/lib/codenames/tools";
import { buildPublicHistory, viewFor } from "../../src/lib/codenames/view";
import { EN_WORDS } from "../../src/lib/codenames/words/en";

function englishGame(seed = 7) {
  return createGame({ id: `en-${seed}`, seed, lang: "en", createdAt: 1 });
}

describe("English games", () => {
  it("deals English words and reports errors in English", () => {
    const { state } = englishGame();
    expect(state.lang).toBe("en");
    expect(state.board.every((card) => EN_WORDS.includes(card.word))).toBe(true);
    expect(validateClue(state, state.board[0].word, 1)?.message).toMatch(/is an unrevealed card on the board/);
    const wrong = apply(state, operativeSeat(state.turn.team), { type: "stop" });
    expect(!wrong.ok && wrong.message).toMatch(/operative|clue/i);
  });

  it("treats English plurals as the same word", () => {
    const { state } = englishGame();
    const board = state.board.map((card, index) =>
      index === 0 ? { ...card, word: "CITY", normalized: "city" } : card,
    );
    expect(validateClue({ ...state, board }, "cities", 1)?.code).toBe("clue_on_board");
  });

  it("rejects English compounds and derivations but not chance overlaps", () => {
    const { state } = englishGame();
    const withCard = (word: string) => ({
      ...state,
      board: state.board.map((card, index) =>
        index === 0 ? { ...card, word, normalized: word.toLowerCase() } : card,
      ),
    });
    expect(validateClue(withCard("LIGHTHOUSE"), "house", 1)?.code).toBe("clue_on_board");
    expect(validateClue(withCard("FARMER"), "farm", 1)?.code).toBe("clue_on_board");
    expect(validateClue(withCard("PRINCESS"), "prince", 1)?.code).toBe("clue_on_board");
    expect(validateClue(withCard("CHAIR"), "hair", 1)).toBeNull();
    expect(validateClue(withCard("WALLET"), "wall", 1)).toBeNull();
    expect(validateClue(withCard("PENGUIN"), "pen", 1)).toBeNull();
  });

  it("builds English prompts, tools and history", () => {
    const { state, events } = englishGame();
    const seat = spymasterSeat(state.turn.team);
    const view = viewFor(seat, state, buildPublicHistory(events));
    const prompt = buildAgentPrompt(seat, view);
    expect(prompt.system).toContain("CODENAMES RULES");
    expect(prompt.user).toContain("Your words (targets)");
    expect(view.history[0]).toMatch(/The game starts/);
    expect(toolsForSeat(seat, view)[0].function.description).toMatch(/Give a Codenames clue/);
  });
});
