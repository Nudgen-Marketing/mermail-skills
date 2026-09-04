export function normalizeMarkdown(markdown) {
  return markdown.replace(/\r\n?/gu, "\n");
}

export function parseFrontmatter(markdown) {
  return normalizeMarkdown(markdown).match(/^---\n([\s\S]*?)\n---/);
}
