import TipTMention from "@tiptap/extension-mention";
import type { MentionOptions, MentionNodeAttrs } from "@tiptap/extension-mention";

export const Mention = TipTMention.extend({
  addOptions() {
    return {
      ...(this.parent?.() ?? {}),
    } as MentionOptions<any, MentionNodeAttrs>;
  },

  addAttributes() {
    return {
      ...this.parent?.(),

      category: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-category"),
        renderHTML: (attributes) => {
          if (!attributes.category) {
            return {};
          }
          return {
            "data-category": attributes.category,
          };
        },
      },

      content: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-content"),
        renderHTML: (attributes) => {
          if (!attributes.content) {
            return {};
          }
          return {
            "data-content": attributes.content,
          };
        },
      },
    };
  },
});
