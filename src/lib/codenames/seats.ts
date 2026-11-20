import type { Seat, SeatRole, Team } from "./types";

export const TEAMS: Team[] = ["red", "blue"];

export const SEATS: Seat[] = [
  "red_spymaster",
  "red_operative",
  "blue_spymaster",
  "blue_operative",
];

export function otherTeam(team: Team): Team {
  return team === "red" ? "blue" : "red";
}

export function teamOfSeat(seat: Seat): Team {
  return seat.startsWith("red") ? "red" : "blue";
}

export function roleOfSeat(seat: Seat): SeatRole {
  return seat.endsWith("spymaster") ? "spymaster" : "operative";
}

export function spymasterSeat(team: Team): Seat {
  return team === "red" ? "red_spymaster" : "blue_spymaster";
}

export function operativeSeat(team: Team): Seat {
  return team === "red" ? "red_operative" : "blue_operative";
}

export function seatFor(team: Team, role: SeatRole): Seat {
  return role === "spymaster" ? spymasterSeat(team) : operativeSeat(team);
}

export function teamLabel(team: Team): string {
  return team === "red" ? "rojo" : "azul";
}
