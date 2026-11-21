export type ThemePreference = "system" | "light" | "dark";
export type ContrastPreference = "normal" | "high";
export type TextSizePreference = "md" | "lg" | "xl" | "xxl";

export type AccessibilityPrefs = {
  theme: ThemePreference;
  contrast: ContrastPreference;
  text: TextSizePreference;
};

export const STORAGE_KEY = "a11y-prefs";

export const DEFAULT_PREFS: AccessibilityPrefs = {
  theme: "system",
  contrast: "normal",
  text: "md",
};

export function readPrefs(): AccessibilityPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AccessibilityPrefs>;
    return {
      theme: stored.theme ?? DEFAULT_PREFS.theme,
      contrast: stored.contrast ?? DEFAULT_PREFS.contrast,
      text: stored.text ?? DEFAULT_PREFS.text,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: AccessibilityPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Brak dostępu do localStorage (np. tryb prywatny) – ustawienia działają tylko w tej karcie.
  }
}

export function applyPrefs(prefs: AccessibilityPrefs) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = prefs.theme === "system" ? (systemDark ? "dark" : "light") : prefs.theme;
  root.dataset.contrast = prefs.contrast;
  root.dataset.text = prefs.text;
}

export const initScript = `(function(){try{var p=Object.assign(${JSON.stringify(DEFAULT_PREFS)},JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}"));var d=document.documentElement;var t=p.theme;if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.theme=t;d.dataset.contrast=p.contrast;d.dataset.text=p.text;}catch(e){}})();`;
