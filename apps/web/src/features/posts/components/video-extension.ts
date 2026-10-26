import { mergeAttributes, Node } from "@tiptap/core";

// Node video cho trình soạn thảo: xuất <video controls preload="metadata" src="…">. Server vẫn lọc lại khi lưu
// (chỉ giữ video thuộc kho lưu trữ của hệ thống).
export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes, { controls: "", preload: "metadata", playsinline: "" })];
  },

  addCommands() {
    return {
      setVideo:
        (src: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { src } }),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      setVideo: (src: string) => ReturnType;
    };
  }
}
