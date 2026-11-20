import { CodenamesApp } from "@/components/codenames/codenames-app";
import { LocaleProvider } from "@/lib/i18n";

export default function Home() {
  return (
    <LocaleProvider>
      <CodenamesApp />
    </LocaleProvider>
  );
}
