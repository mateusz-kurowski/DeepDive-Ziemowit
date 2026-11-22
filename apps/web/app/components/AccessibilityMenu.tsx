"use client";

import { useEffect, useId, useRef, useState } from "react";
import { applyPrefs, DEFAULT_PREFS, readPrefs, savePrefs, STORAGE_KEY } from "../accessibility";
import type { AccessibilityPrefs } from "../accessibility";

type Option<K extends keyof AccessibilityPrefs> = { value: AccessibilityPrefs[K]; label: string; ariaLabel?: string };

const groups: { [K in keyof AccessibilityPrefs]: { legend: string; options: Option<K>[] } } = {
  text: {
    legend: "Rozmiar tekstu",
    options: [
      { value: "md", label: "A", ariaLabel: "Normalny" },
      { value: "lg", label: "A+", ariaLabel: "Większy" },
      { value: "xl", label: "A++", ariaLabel: "Duży" },
      { value: "xxl", label: "A+++", ariaLabel: "Bardzo duży" },
    ],
  },
  theme: {
    legend: "Motyw",
    options: [
      { value: "light", label: "☀ Dzienny" },
      { value: "dark", label: "☾ Nocny" },
      { value: "system", label: "Systemowy" },
    ],
  },
  contrast: {
    legend: "Kontrast",
    options: [
      { value: "normal", label: "Standardowy" },
      { value: "high", label: "Wysoki" },
    ],
  },
};

export default function AccessibilityMenu() {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(DEFAULT_PREFS);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    setPrefs(readPrefs());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = readPrefs();
      setPrefs(next);
      applyPrefs(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (prefs.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPrefs(prefs);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [prefs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function update(next: AccessibilityPrefs) {
    setPrefs(next);
    applyPrefs(next);
    savePrefs(next);
  }

  return (
    <div className="a11y">
      <button
        ref={toggleRef}
        type="button"
        className="a11y-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Dostępność"
        onClick={() => setOpen((value) => !value)}
      >
        <svg className="a11y-toggle-icon" aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="4.5" r="2.25" fill="currentColor" />
          <path d="M12 8.25c-3.15 0-5.35 1.25-6.9 2.95" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 8.25c3.15 0 5.35 1.25 6.9 2.95" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 8.5v4.25M12 12.75l-4.1 7M12 12.75l4.1 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="a11y-tooltip" role="tooltip">Dostępność</span>
      </button>
      {open && (
        <div className="a11y-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className="a11y-panel" id={panelId} ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="a11y-panel-head">
              <h2 id={titleId}>Ustawienia dostępności</h2>
              <button type="button" className="a11y-close" onClick={close} aria-label="Zamknij ustawienia">✕</button>
            </div>
            <p>Zapisują się w tej przeglądarce i obowiązują też w raporcie działki.</p>
            {(Object.keys(groups) as Array<keyof AccessibilityPrefs>).map((key) => (
              <fieldset key={key} className="a11y-group">
                <legend>{groups[key].legend}</legend>
                <div className="a11y-options">
                  {groups[key].options.map((option) => (
                    <label key={option.value} title={option.ariaLabel}>
                      <input
                        type="radio"
                        aria-label={option.ariaLabel}
                        name={`a11y-${key}`}
                        value={option.value}
                        checked={prefs[key] === option.value}
                        onChange={() => update({ ...prefs, [key]: option.value })}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button type="button" className="a11y-reset" onClick={() => update(DEFAULT_PREFS)}>
              Przywróć domyślne
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
