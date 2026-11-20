/** Official expert rule: a clue with number 0 allows unlimited guesses. */
export const UNLIMITED_GUESSES = 25;

export function guessesForClue(number: number): number {
  return number === 0 ? UNLIMITED_GUESSES : number + 1;
}
