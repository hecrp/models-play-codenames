import type { Language, Seat } from "./types";

export interface AvatarDefinition {
  id: string;
  name: string;
  nameEn: string;
}

export const AVATARS: AvatarDefinition[] = [
  { id: "zorro", name: "Zorro", nameEn: "Fox" },
  { id: "buho", name: "Búho", nameEn: "Owl" },
  { id: "pulpo", name: "Pulpo", nameEn: "Octopus" },
  { id: "gato", name: "Gato", nameEn: "Cat" },
  { id: "rana", name: "Rana", nameEn: "Frog" },
  { id: "pinguino", name: "Pingüino", nameEn: "Penguin" },
  { id: "koala", name: "Koala", nameEn: "Koala" },
  { id: "dragon", name: "Dragón", nameEn: "Dragon" },
  { id: "lobo", name: "Lobo", nameEn: "Wolf" },
  { id: "tortuga", name: "Tortuga", nameEn: "Turtle" },
  { id: "abeja", name: "Abeja", nameEn: "Bee" },
  { id: "cangrejo", name: "Cangrejo", nameEn: "Crab" },
];

export function avatarName(avatar: AvatarDefinition, lang: Language): string {
  return lang === "en" ? avatar.nameEn : avatar.name;
}

export const DEFAULT_SEAT_AVATARS: Record<Seat, string> = {
  red_spymaster: "zorro",
  red_operative: "buho",
  blue_spymaster: "pulpo",
  blue_operative: "gato",
};

export function avatarById(id: string): AvatarDefinition | undefined {
  return AVATARS.find((avatar) => avatar.id === id);
}

export function isAvatarId(id: string): boolean {
  return AVATARS.some((avatar) => avatar.id === id);
}
