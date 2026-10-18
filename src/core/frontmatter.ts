import { parse } from 'yaml';

export interface Frontmatter {
  name?: string;
  description?: string;
}

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export function readFrontmatter(markdown: string): Frontmatter {
  const match = FRONTMATTER.exec(markdown);
  if (!match) return {};
  try {
    const data: unknown = parse(match[1]);
    if (!data || typeof data !== 'object') return {};
    const record = data as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
    return { name: str(record.name), description: str(record.description) };
  } catch {
    return {};
  }
}
