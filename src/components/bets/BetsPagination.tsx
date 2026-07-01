import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/** Paginação com ir para primeira/última página e salto direto para uma página. */
export function BetsPagination({
  page,
  totalPages,
  onGoTo,
  className,
}: {
  page: number;
  totalPages: number;
  onGoTo: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className ?? ""}`}>
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onGoTo(1)} aria-label="Primeira página">
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onGoTo(page - 1)}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
      </Button>

      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>Página</span>
        <Select value={String(page)} onValueChange={(v) => onGoTo(Number(v))}>
          <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            {pages.map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <span>de {totalPages}</span>
      </div>

      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onGoTo(page + 1)}>
        Próximo <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onGoTo(totalPages)} aria-label="Última página">
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
