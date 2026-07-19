import { create } from "zustand"

interface EditorDocument {
	id: string | null
	title: string
	content: string
	status: "draft" | "published"
}

interface EditorStore extends EditorDocument {
	savedTitle: string
	savedContent: string
	setTitle: (title: string) => void
	setContent: (content: string) => void
	loadDocument: (document: EditorDocument) => void
	markSaved: (id?: string | null) => void
	clear: () => void
	isDirty: () => boolean
}

const emptyDocument: EditorDocument = { id: null, title: "", content: "", status: "draft" }

export const useEditorStore = create<EditorStore>((set, get) => ({
	...emptyDocument,
	savedTitle: "",
	savedContent: "",
	setTitle: (title) => set({ title }),
	setContent: (content) => set({ content }),
	loadDocument: (document) => set({ ...document, savedTitle: document.title, savedContent: document.content }),
	markSaved: (id) => set((state) => ({ id: id === undefined ? state.id : id, savedTitle: state.title, savedContent: state.content })),
	clear: () => set({ ...emptyDocument, savedTitle: "", savedContent: "" }),
	isDirty: () => {
		const state = get()
		return state.title !== state.savedTitle || state.content !== state.savedContent
	},
}))
