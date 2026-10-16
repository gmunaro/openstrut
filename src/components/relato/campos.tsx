// Campos base do diálogo de relato que o components/ui não tem: área de texto e caixa
// de marcar com texto de apoio.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AreaTexto({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

/** Caixa de marcar com rótulo clicável e uma linha de apoio embaixo. */
export function Marcar({
  marcado,
  aoMudar,
  children,
  apoio,
  disabled,
}: {
  marcado: boolean;
  aoMudar: (v: boolean) => void;
  children: ReactNode;
  apoio?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={marcado}
        disabled={disabled}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className="grid gap-0.5">
        <span>{children}</span>
        {apoio && <span className="text-xs text-muted-foreground">{apoio}</span>}
      </span>
    </label>
  );
}
