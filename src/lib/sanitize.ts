import sanitizeHtml from "sanitize-html";

/** Allow-list for rich text written in the admin editor (product descriptions, pages, FAQ). */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "h4",
      "a",
      "blockquote",
      "hr",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: /^https?:/.test(attribs.href ?? "")
          ? { ...attribs, target: "_blank", rel: "noopener noreferrer" }
          : attribs,
      }),
    },
  }).trim();
}
