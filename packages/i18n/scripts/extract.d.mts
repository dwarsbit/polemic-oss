export interface Found {
  message: string;
  plural?: { one: string; other: string };
  line: number;
}

export function sourceFiles(dir: string): string[];
export function messagesIn(source: string, fileName?: string): Found[];
export function collect(
  srcDir: string | string[],
): Map<string, { plural?: { one: string; other: string }; where: string[] }>;
export function updateCatalog(
  language: string,
  messages: ReturnType<typeof collect>,
  current?: Record<string, unknown>,
): Record<string, string | Record<string, string>>;
export function untranslated(catalog: Record<string, unknown>): number;
export function extract(options: {
  srcDir: string | string[];
  localesDir: string;
  add?: string[];
  check?: boolean;
}): {
  changed: string[];
  report: { language: string; messages: number; untranslated: number }[];
  messages: ReturnType<typeof collect>;
};
