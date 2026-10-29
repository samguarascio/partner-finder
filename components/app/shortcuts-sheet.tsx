"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Shortcut } from "./shortcut";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "General",
    items: [
      ["Run the next step", "mod+enter"],
      ["Focus the URL box", "/"],
      ["Close, clear, or blur", "escape"],
      ["Show shortcuts", "mod+k"],
    ],
  },
  {
    title: "Partners",
    items: [
      ["Move down / up", "j k"],
      ["Open or close the email", "enter"],
      ["Draft the email", "e"],
      ["Regenerate the email", "r"],
      ["Copy the email", "c"],
      ["Not a fit", "x"],
      ["Open LinkedIn search", "l"],
      ["Open website", "w"],
    ],
  },
  {
    title: "List",
    items: [
      ["Filter to category 1–9", "1"],
      ["Show all categories", "0"],
      ["Find more", "f"],
      ["Export CSV", "shift+e"],
    ],
  },
];

export function ShortcutsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[420px]! gap-0 border border-border bg-popover p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border px-5 py-4">
          <DialogTitle className="text-[14px] font-medium">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">Every keyboard shortcut in Partner Finder</DialogDescription>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-2">
          {GROUPS.map((g) => (
            <div key={g.title} className="py-2">
              <h4 className="mb-1 text-[12px] font-medium text-tertiary-foreground">{g.title}</h4>
              {g.items.map(([label, keys]) => (
                <div key={label} className="flex h-8 items-center justify-between text-[13px] text-[#d0d6e0]">
                  {label}
                  {keys === "j k" ? (
                    <span className="flex gap-1">
                      <Shortcut keys="j" />
                      <Shortcut keys="k" />
                    </span>
                  ) : keys === "1" ? (
                    <span className="flex items-center gap-1 text-[11px] text-tertiary-foreground">
                      <Shortcut keys="1" /> to <Shortcut keys="9" />
                    </span>
                  ) : (
                    <Shortcut keys={keys} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
