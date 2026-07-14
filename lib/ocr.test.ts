import { describe, it, expect } from 'vitest';

function cleanOcrText(text: string): string {
  return text.replace(/^```markdown\s*/i, '')
             .replace(/^```\s*/, '')
             .replace(/```$/, '')
             .trim();
}

describe('OCR Text Sanitization', () => {
  it('should strip markdown codeblocks correctly', () => {
    const input = '```markdown\nThis is extracted text\n```';
    expect(cleanOcrText(input)).toBe('This is extracted text');
  });

  it('should strip generic codeblocks correctly', () => {
    const input = '```\nAnother document content\n```';
    expect(cleanOcrText(input)).toBe('Another document content');
  });

  it('should handle clean text without codeblocks', () => {
    const input = 'Standard text content without blocks';
    expect(cleanOcrText(input)).toBe('Standard text content without blocks');
  });
});
