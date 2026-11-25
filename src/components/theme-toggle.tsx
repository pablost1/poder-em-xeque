"use client";

import { useEffect, useLayoutEffect, useState } from "react";

type Pref = "system" | "light" | "dark";
const KEY = "theme";

function effective(pref: Pref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function readPref(): Pref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const OPTIONS: { value: Pref; label: string; icon: string }[] = [
  { value: "system", label: "Sistema", icon: "◐" },
  { value: "light", label: "Claro", icon: "☀" },
  { value: "dark", label: "Escuro", icon: "☾" },
];

/** Seletor de tema com três opções. O script inline do layout aplica o tema salvo antes da primeira pintura. */
export function ThemeToggle() {
  // Servidor e primeira renderização do cliente concordam em "system"; o valor real é lido no layout effect.
  const [pref, setPref] = useState<Pref>("system");

  useLayoutEffect(() => {
    const p = readPref();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do tema salvo, só possível no cliente
    setPref(p);
    // O Strict Mode do React (dev) pode apagar atributos definidos pelo script inline; reaplica.
    document.documentElement.setAttribute("data-theme", effective(p));
  }, []);

  // Acompanha mudanças do sistema operacional enquanto estiver em "system".
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => document.documentElement.setAttribute("data-theme", effective("system"));
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);

  function choose(next: Pref) {
    setPref(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* sem armazenamento: a escolha vale só para esta visita */
    }
    document.documentElement.setAttribute("data-theme", effective(next));
  }

  return (
    <div role="group" aria-label="Tema de cores" className="inline-flex rounded-full border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => choose(o.value)}
          aria-pressed={pref === o.value}
          title={o.label}
          className={`h-8 w-8 rounded-full text-sm leading-none transition-colors ${
            pref === o.value ? "bg-brand-solid text-on-brand" : "text-muted hover:bg-surface-2"
          }`}
        >
          <span aria-hidden>{o.icon}</span>
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
