import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="font-display text-6xl font-bold text-accent">404</div>
      <p className="max-w-md text-muted">Такой страницы нет. Возможно, персонажа удалили или ссылка ведёт на чужой лист.</p>
      <Button asChild variant="primary">
        <Link href="/characters">К персонажам</Link>
      </Button>
    </div>
  );
}
