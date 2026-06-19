import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { BOOKMAKERS, getBookmaker } from "@/lib/bookmakers";
import { BookmakerLogo } from "./BookmakerLogo";
import { cn } from "@/lib/utils";

export function BookmakerSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);

  const known = useMemo(() => getBookmaker(value), [value]);
  const isCustom = customMode || (!!value && !known);

  if (isCustom) {
    return (
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nome da casa"
          autoFocus
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
        >
          Lista
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            {value ? (
              <>
                <BookmakerLogo name={value} size="xs" />
                <span className="truncate">{value}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Selecione a casa…</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar casa…" />
          <CommandList>
            <CommandEmpty>Nenhuma casa encontrada.</CommandEmpty>
            <CommandGroup>
              {BOOKMAKERS.map((b) => (
                <CommandItem
                  key={b.slug}
                  value={b.name}
                  onSelect={() => {
                    onChange(b.name);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <BookmakerLogo name={b.name} size="xs" />
                  <span className="flex-1">{b.name}</span>
                  <Check
                    className={cn(
                      "h-4 w-4",
                      value?.toLowerCase() === b.name.toLowerCase() ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup>
              <CommandItem
                value="__custom__"
                onSelect={() => {
                  setCustomMode(true);
                  setOpen(false);
                }}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <Pencil className="h-4 w-4" />
                <span>Outra casa…</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}