const DEFAULT_MODEL = "eburon/eburon";

export function getSelectedModel(): string {
  if (typeof window !== "undefined") {
    const storedModel = localStorage.getItem("selectedModel");
    if (storedModel && storedModel !== "null" && storedModel !== "undefined") {
      return storedModel;
    }
    return DEFAULT_MODEL;
  }

  return DEFAULT_MODEL;
}
