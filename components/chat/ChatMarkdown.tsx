'use client';

import React from 'react';

/**
 * Lightweight markdown renderer for chat bubbles.
 * Handles: bold, italic, bold-italic, inline code, numbered/bullet lists,
 * and line breaks. No external dependencies — safe by construction
 * (React auto-escapes all text content, no dangerouslySetInnerHTML).
 */

// Splits a text line into inline segments: bold, italic, bold-italic, inline code, plain text
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Order matters: bold-italic (***) before bold (**) before italic (*)
  const re = /(`[^`]+`)|(\*{3}[^*]+\*{3})|(\*{2}[^*]+\*{2})|(\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // Plain text before this match
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    const m = match[0];
    if (m.startsWith('`')) {
      // Inline code
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono">
          {m.slice(1, -1)}
        </code>
      );
    } else if (m.startsWith('***')) {
      // Bold italic
      parts.push(
        <strong key={match.index}><em>{m.slice(3, -3)}</em></strong>
      );
    } else if (m.startsWith('**')) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-semibold">{m.slice(2, -2)}</strong>
      );
    } else if (m.startsWith('*')) {
      // Italic
      parts.push(
        <em key={match.index}>{m.slice(1, -1)}</em>
      );
    }

    last = match.index + m.length;
  }

  // Remaining plain text
  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts;
}

interface Props {
  content: string;
  className?: string;
}

export default function ChatMarkdown({ content, className }: Props) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line — paragraph break
    if (!trimmed) {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Numbered list: "1. text", "2. text", etc.
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const nm = lines[i].trim().match(/^(\d+)\.\s+(.+)/);
        if (!nm) break;
        items.push(
          <li key={i} className="ml-1">
            {parseInline(nm[2])}
          </li>
        );
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 my-1">
          {items}
        </ol>
      );
      continue;
    }

    // Bullet list: "- text", "* text", "+ text"
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const bm = lines[i].trim().match(/^[-*+]\s+(.+)/);
        if (!bm) break;
        items.push(
          <li key={i} className="ml-1">
            {parseInline(bm[1])}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1">
          {items}
        </ul>
      );
      continue;
    }

    // Regular paragraph line
    elements.push(
      <p key={i} className={i > 0 ? 'mt-1' : ''}>
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className={className}>{elements}</div>;
}
