"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLinks, type NavItem } from "@/components/NavLinks";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
        className="rounded-md p-2 hover:bg-secondary"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-16 z-20 border-b border-border bg-background p-4 shadow-lg">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
