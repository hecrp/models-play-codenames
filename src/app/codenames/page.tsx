import { permanentRedirect } from "next/navigation";

// Codenames used to live here while the app also had a chat; keep old links working.
export default function LegacyCodenamesPage() {
  permanentRedirect("/");
}
