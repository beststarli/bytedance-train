"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
	MessageSquare,
	Trash2,
	Send,
	Mic,
	Sparkles,
	FileText,
	ImageIcon,
	Pencil,
	PenLine,
	WandSparkles,
	ArrowRight,
	FolderOpen,
	Bold,
	Italic,
	Heading1,
	Heading2,
	Quote,
	List,
	Link2,
	Code2,
	FolderPlus,
	Loader2,
	Square,
	RotateCcw,
	Upload,
	X,
	Check,
	CopyPlus,
	Paperclip,
} from 'lucide-react'
import { useAuthStore } from '@/store/userStore'
import { createChat, deleteChat, generateChatStream, getChatMessages, getChats, importMessageImage, renameChat, uploadAiAttachment } from '@/api/chats'
import { getMaterials, uploadMaterial } from '@/api/materials'
import { getPrompts } from '@/api/prompts'
import { saveWork } from '@/api/works'
import { cn, createClientId, fileAsDataUrl, resolveAssetUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { clearTaskProgress, emitTaskProgress } from '@/components/taskProgress'
import { useEditorStore } from '@/store/editorStore'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { removeLocalDraft, useDraftAutosave } from '@/hooks/useDraftAutosave'

interface Chat {
	id: string
	title: string
	created_at: string
	updated_at: string
}

interface Message {
	id: string
	role: 'user' | 'assistant'
	content: string
	created_at: string
}

interface Prompt {
	id: string
	title: string
	description: string
	content: string
	category: string
	icon: string
	model_type?: string
	is_active?: boolean
}

interface Material {
	id: string
	filename: string
	url: string
	type: string
	source_url?: string | null
}

interface ImageAttachment {
	id: string
	url: string
	filename: string
	source: 'generated' | 'material' | 'upload'
}

interface FloatingSelection {
	text: string
	x: number
	y: number
	source: 'assistant' | 'editor'
}

interface ChatGenerationState {
	sending: boolean
	thinkingStage: string
	generationType: 'text' | 'image'
}

interface BrowserSpeechRecognition {
	continuous: boolean
	interimResults: boolean
	lang: string
	start: () => void
	stop: () => void
	onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
	onerror: (() => void) | null
	onend: (() => void) | null
}

const iconMap: Record<string, React.ElementType> = {
	FileText, ImageIcon, WandSparkles, Sparkles,
}

const promptCategoryMeta: Record<string, { title: string; description: string; icon: React.ElementType }> = {
	writing: { title: '文章写作', description: '标题、结构与正文创作', icon: FileText },
	article: { title: '文章创作', description: '标题、结构与正文创作', icon: FileText },
	image: { title: '图片生成', description: '配图描述与视觉灵感', icon: ImageIcon },
	image_edit: { title: '图片修改', description: '基于参考图调整画面', icon: WandSparkles },
	optimize: { title: '内容优化', description: '润色、改写与观点整理', icon: Sparkles },
	general: { title: '通用优化', description: '润色、改写与观点整理', icon: Sparkles },
}

const promptCategoryDefinitions = [
	{ id: 'writing', aliases: ['writing', 'article'], ...promptCategoryMeta.writing },
	{ id: 'image', aliases: ['image'], ...promptCategoryMeta.image },
	{ id: 'image_edit', aliases: ['image_edit'], ...promptCategoryMeta.image_edit },
	{ id: 'optimize', aliases: ['optimize', 'general'], ...promptCategoryMeta.optimize },
]

function promptBelongsToCategory(prompt: Prompt, categoryId: string | null) {
	if (!categoryId) return false
	return promptCategoryDefinitions.find((category) => category.id === categoryId)?.aliases.includes(prompt.category) ?? false
}

function resizeInputTextarea(el: HTMLTextAreaElement) {
	el.style.height = 'auto'
	el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

function renderInlineMarkdown(text: string) {
	return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
		if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
		if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-muted px-1 py-0.5 text-[.9em]">{part.slice(1, -1)}</code>
		return <React.Fragment key={index}>{part}</React.Fragment>
	})
}

function GeneratedImageFigure({
	imageUrl,
	alt,
	onImportImage,
	onInsertImage,
	onReferenceImage,
	importing,
	imported,
}: {
	imageUrl: string
	alt: string
	onImportImage?: (url: string) => void
	onInsertImage?: (url: string) => void
	onReferenceImage?: (url: string, alt: string) => void
	importing?: boolean
	imported?: boolean
}) {
	const [loaded, setLoaded] = useState(false)

	return (
		<figure className="group relative my-2 aspect-square w-[min(420px,70vw)] max-w-full overflow-hidden rounded-xl border bg-muted/30">
			{!loaded && (
				<div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-white to-red-50">
					<div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/80 to-transparent" />
					<div className="relative flex flex-col items-center gap-2 text-muted-foreground">
						<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-card shadow-sm">
							<ImageIcon className="h-5 w-5 text-red-400" />
						</span>
						<span className="text-[11px]">正在加载生成图片…</span>
					</div>
				</div>
			)}
			<img
				src={imageUrl}
				alt={alt}
				onLoad={() => setLoaded(true)}
				onError={() => setLoaded(true)}
				className={cn('h-full w-full object-contain transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
			/>
			{loaded && (onInsertImage || onImportImage || onReferenceImage) && (
				<div className="absolute bottom-3 right-3 flex items-center gap-2">
					{onReferenceImage && (
						<button
							type="button"
							onClick={() => onReferenceImage(imageUrl, alt)}
							className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/20 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:border-red-400 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
						>
							<Paperclip className="h-3.5 w-3.5" />
							引用修改
						</button>
					)}
					{onInsertImage && (
						<button
							type="button"
							onClick={() => onInsertImage(imageUrl)}
							className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-red-600"
						>
							<FileText className="h-3.5 w-3.5" />
							插入正文
						</button>
					)}
					{onImportImage && (
						<button
							type="button"
							disabled={importing || imported}
							onClick={() => onImportImage(imageUrl)}
							className="inline-flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-2 text-xs font-medium text-white shadow-sm backdrop-blur transition hover:bg-black/85 disabled:cursor-default disabled:bg-emerald-600/90"
						>
							{importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
							{importing ? '添加中…' : imported ? '已添加素材库' : '添加到素材库'}
						</button>
					)}
				</div>
			)}
		</figure>
	)
}

function MarkdownContent({
	content,
	onImportImage,
	onInsertImage,
	onReferenceImage,
	importingUrls,
	importedUrls,
}: {
	content: string
	onImportImage?: (url: string) => void
	onInsertImage?: (url: string) => void
	onReferenceImage?: (url: string, alt: string) => void
	importingUrls?: Set<string>
	importedUrls?: Set<string>
}) {
	return <div className="space-y-2">{content.split('\n').map((line, index) => {
		const image = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
		const legacyImage = line.trim().match(/^(https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?)$/i)
		const imageUrl = image?.[2] || legacyImage?.[1]
		if (imageUrl) {
			return (
				<GeneratedImageFigure
					key={index}
					imageUrl={imageUrl}
					alt={image?.[1] || 'AI 生成图片'}
					onImportImage={onImportImage}
					onInsertImage={onInsertImage}
					onReferenceImage={onReferenceImage}
					importing={importingUrls?.has(imageUrl)}
					imported={importedUrls?.has(imageUrl)}
				/>
			)
		}
		if (line.startsWith('### ')) return <h3 key={index} className="pt-2 text-base font-bold">{renderInlineMarkdown(line.slice(4))}</h3>
		if (line.startsWith('## ')) return <h2 key={index} className="pt-2 text-lg font-bold">{renderInlineMarkdown(line.slice(3))}</h2>
		if (line.startsWith('# ')) return <h1 key={index} className="pt-2 text-xl font-bold">{renderInlineMarkdown(line.slice(2))}</h1>
		if (/^[-*]\s/.test(line)) return <div key={index} className="flex gap-2"><span className="text-red-500">•</span><span>{renderInlineMarkdown(line.slice(2))}</span></div>
		const ordered = line.match(/^(\d+)\.\s(.*)$/)
		if (ordered) return <div key={index} className="flex gap-2"><span className="font-semibold text-red-500">{ordered[1]}.</span><span>{renderInlineMarkdown(ordered[2])}</span></div>
		if (!line.trim()) return <div key={index} className="h-1" />
		return <p key={index}>{renderInlineMarkdown(line)}</p>
	})}</div>
}

function articleFromAssistantMessage(content: string) {
	const trimmed = content.trim()
	if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(trimmed)) {
		return { title: '', content: `![AI 生成图片](${trimmed})` }
	}
	const lines = trimmed.split('\n')
	const titleIndex = lines.findIndex((line) => /^#\s+/.test(line.trim()))
	const title = titleIndex >= 0 ? lines[titleIndex].trim().replace(/^#\s+/, '').trim() : ''
	if (titleIndex >= 0) lines.splice(titleIndex, 1)
	return { title, content: lines.join('\n').trim() }
}

function escapeHtml(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderEditorInline(value: string) {
	return escapeHtml(value)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function markdownToEditorHtml(content: string) {
	if (!content) return ''
	const lines = content.split('\n')
	return lines.map((line, index) => {
		const image = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
		if (image) {
			const figure = `<figure contenteditable="false" data-image-node="true" data-image-alt="${escapeHtml(image[1])}" data-image-url="${escapeHtml(image[2])}"><img src="${escapeHtml(resolveAssetUrl(image[2]))}" alt=""><button type="button" data-remove-image="true" aria-label="删除图片" title="删除图片">×</button></figure>`
			// contenteditable=false 的块节点不能承载光标；末尾图片后必须保留可编辑落点。
			return index === lines.length - 1 ? `${figure}<p><br></p>` : figure
		}
		if (line.startsWith('## ')) return `<h2>${renderEditorInline(line.slice(3))}</h2>`
		if (line.startsWith('# ')) return `<h1>${renderEditorInline(line.slice(2))}</h1>`
		if (line.startsWith('> ')) return `<blockquote>${renderEditorInline(line.slice(2))}</blockquote>`
		if (/^[-*]\s/.test(line)) return `<ul><li>${renderEditorInline(line.slice(2))}</li></ul>`
		return line ? `<p>${renderEditorInline(line)}</p>` : '<p><br></p>'
	}).join('')
}

function editorInlineToMarkdown(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
	if (!(node instanceof HTMLElement)) return ''
	if (node.dataset.imageNode === 'true') {
		return `\n![${node.dataset.imageAlt || ''}](${node.dataset.imageUrl || ''})\n`
	}
	const content = Array.from(node.childNodes).map(editorInlineToMarkdown).join('')
	if (node.tagName === 'STRONG' || node.tagName === 'B') return `**${content}**`
	if (node.tagName === 'EM' || node.tagName === 'I') return `*${content}*`
	if (node.tagName === 'CODE') return `\`${content}\``
	if (node.tagName === 'A') return `[${content}](${node.getAttribute('href') || ''})`
	if (node.tagName === 'BR') return '\n'
	return content
}

function editorHtmlToMarkdown(editor: HTMLDivElement) {
	return Array.from(editor.childNodes).map((node) => {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
		if (!(node instanceof HTMLElement)) return ''
		if (node.dataset.imageNode === 'true') return `![${node.dataset.imageAlt || ''}](${node.dataset.imageUrl || ''})`
		const content = editorInlineToMarkdown(node).replace(/\n+$/, '')
		if (node.tagName === 'H1') return `# ${content}`
		if (node.tagName === 'H2') return `## ${content}`
		if (node.tagName === 'BLOCKQUOTE') return `> ${content}`
		if (node.tagName === 'UL' || node.tagName === 'OL') {
			return Array.from(node.querySelectorAll(':scope > li')).map((item, index) =>
				node.tagName === 'OL' ? `${index + 1}. ${editorInlineToMarkdown(item)}` : `- ${editorInlineToMarkdown(item)}`
			).join('\n')
		}
		return content
	}).join('\n').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function createCaretParagraph() {
	const paragraph = document.createElement('p')
	paragraph.append(document.createElement('br'))
	return paragraph
}

function placeCaretInside(node: HTMLElement) {
	const range = document.createRange()
	range.selectNodeContents(node)
	range.collapse(true)
	const selection = window.getSelection()
	selection?.removeAllRanges()
	selection?.addRange(range)
}

function ensureEditableCaretAfter(imageNode: Element) {
	const existing = imageNode.nextElementSibling
	const paragraph = existing instanceof HTMLParagraphElement
		? existing
		: createCaretParagraph()
	if (paragraph !== existing) imageNode.after(paragraph)
	placeCaretInside(paragraph)
	return paragraph
}

function insertEditorImageAtRange(editor: HTMLDivElement, range: Range, imageNode: Element) {
	range.deleteContents()
	range.insertNode(imageNode)
	if (imageNode.parentElement !== editor) {
		let topLevelParent = imageNode.parentElement
		while (topLevelParent?.parentElement && topLevelParent.parentElement !== editor) {
			topLevelParent = topLevelParent.parentElement
		}
		if (topLevelParent?.parentElement === editor) topLevelParent.after(imageNode)
	}
	return ensureEditableCaretAfter(imageNode)
}

function InlineArticleEditor({
	content,
	onChange,
	editorRef,
	fillHeight = false,
	disabled = false,
	onTextSelection,
	onImageUploaded,
	onImageUploadStateChange,
}: {
	content: string
	onChange: (content: string) => void
	editorRef: React.MutableRefObject<HTMLDivElement | null>
	fillHeight?: boolean
	disabled?: boolean
	onTextSelection?: (selection: FloatingSelection | null) => void
	onImageUploaded?: (material: Material) => void
	onImageUploadStateChange?: (uploading: boolean) => void
}) {
	const lastContentRef = useRef(content)

	useEffect(() => {
		const editor = editorRef.current
		if (!editor || content === lastContentRef.current) return
		editor.innerHTML = markdownToEditorHtml(content)
		editor.dataset.empty = content.trim() ? 'false' : 'true'
		lastContentRef.current = content
	}, [content, editorRef])

	const syncContent = useCallback(() => {
		if (!editorRef.current) return
		const nextContent = editorHtmlToMarkdown(editorRef.current)
		editorRef.current.dataset.empty = nextContent ? 'false' : 'true'
		lastContentRef.current = nextContent
		onChange(nextContent)
	}, [editorRef, onChange])

	const insertDroppedMaterial = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault()
		if (disabled) return
		const raw = event.dataTransfer.getData('application/x-creator-material')
		if (!raw || !editorRef.current) return
		try {
			const material = JSON.parse(raw) as Material
			if (material.type !== 'image') return
			const markdown = `![${material.filename}](${material.url})`
			const holder = document.createElement('div')
			holder.innerHTML = markdownToEditorHtml(markdown)
			const materialNode = holder.firstElementChild
			if (!materialNode) return
			const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
			const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY) || window.getSelection()?.getRangeAt(0)
			let caretParagraph: HTMLParagraphElement
			if (range && editorRef.current.contains(range.commonAncestorContainer)) {
				caretParagraph = insertEditorImageAtRange(editorRef.current, range, materialNode)
			} else {
				editorRef.current.append(materialNode)
				caretParagraph = ensureEditableCaretAfter(materialNode)
			}
			syncContent()
			editorRef.current.focus()
			placeCaretInside(caretParagraph)
		} catch {
			// 忽略非素材拖拽数据
		}
	}

	const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
		if (disabled || !editorRef.current) return
		const imageFiles = Array.from(event.clipboardData.items)
			.filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
			.map((item) => item.getAsFile())
			.filter((file): file is File => !!file)
		if (!imageFiles.length) return

		event.preventDefault()
		const editor = editorRef.current
		const selection = window.getSelection()
		const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null
		const insertionRange = selectedRange && editor.contains(selectedRange.commonAncestorContainer)
			? selectedRange.cloneRange()
			: document.createRange()
		if (!selectedRange || !editor.contains(selectedRange.commonAncestorContainer)) {
			insertionRange.selectNodeContents(editor)
			insertionRange.collapse(false)
		}

		onImageUploadStateChange?.(true)
		emitTaskProgress({
			title: imageFiles.length > 1 ? `正在上传 ${imageFiles.length} 张粘贴图片` : '正在上传粘贴图片',
			status: 'running',
			message: '上传完成后会自动插入正文',
		})
		let caretParagraph: HTMLParagraphElement | null = null
		try {
			for (const [index, file] of imageFiles.entries()) {
				if (file.size > 10 * 1024 * 1024) throw new Error(`第 ${index + 1} 张图片超过 10MB`)
				const data = await fileAsDataUrl(file)
				const uploaded = await uploadMaterial<{ material: Material }>({
					filename: file.name || `clipboard-${Date.now()}-${index + 1}.png`,
					data,
					type: 'image',
				})
				const material = uploaded.material
				const holder = document.createElement('div')
				holder.innerHTML = markdownToEditorHtml(`![${material.filename}](${material.url})`)
				const imageNode = holder.firstElementChild
				if (!imageNode) throw new Error('无法创建正文图片节点')
				if (caretParagraph) {
					caretParagraph.before(imageNode)
				} else {
					caretParagraph = insertEditorImageAtRange(editor, insertionRange, imageNode)
				}
				onImageUploaded?.(material)
				// 多图粘贴中途失败时，已成功上传的图片仍应进入正文状态。
				syncContent()
			}
			editor.focus()
			if (caretParagraph) placeCaretInside(caretParagraph)
			clearTaskProgress()
		} catch (error) {
			emitTaskProgress({
				title: '粘贴图片上传失败',
				status: 'error',
				message: error instanceof Error ? error.message : '请稍后重试',
			})
		} finally {
			onImageUploadStateChange?.(false)
		}
	}

	return (
		<div
			ref={(node) => {
				editorRef.current = node
				if (node && !node.innerHTML) {
					node.innerHTML = markdownToEditorHtml(content)
					node.dataset.empty = content.trim() ? 'false' : 'true'
				}
			}}
			contentEditable={!disabled}
			suppressContentEditableWarning
			role="textbox"
			aria-multiline="true"
			aria-disabled={disabled}
			data-placeholder="从这里开始写作，也可以将素材拖入正文…"
			data-empty={content.trim() ? 'false' : 'true'}
			className={cn(
				"article-rich-editor px-4 pb-4 text-justify text-sm leading-7 outline-none",
				fillHeight
					? "scrollBar-hidden min-h-0 flex-1 overflow-y-auto"
					: "min-h-[420px]",
				disabled && "cursor-not-allowed bg-muted/25 text-muted-foreground",
			)}
			onInput={() => { if (!disabled) syncContent() }}
			onPaste={(event) => { void handlePaste(event) }}
			onMouseUp={() => {
				if (disabled || !onTextSelection) return
				const selection = window.getSelection()
				if (!selection || selection.isCollapsed || !selection.rangeCount || !editorRef.current?.contains(selection.anchorNode)) {
					onTextSelection(null)
					return
				}
				const text = selection.toString().trim()
				if (!text) return onTextSelection(null)
				const rect = selection.getRangeAt(0).getBoundingClientRect()
				onTextSelection({ text, x: rect.left + rect.width / 2, y: rect.top - 10, source: 'editor' })
			}}
			onClick={(event) => {
				if (disabled) return
				const target = event.target as HTMLElement
				const removeButton = target.closest('[data-remove-image="true"]')
				if (removeButton) {
					removeButton.closest('[data-image-node="true"]')?.remove()
					syncContent()
					return
				}
				const imageNode = target.closest('[data-image-node="true"]')
				if (imageNode) {
					const caretParagraph = ensureEditableCaretAfter(imageNode)
					editorRef.current?.focus()
					placeCaretInside(caretParagraph)
				}
			}}
			onDragOver={(event) => {
				if (disabled) return
				event.preventDefault()
				event.dataTransfer.dropEffect = 'copy'
			}}
			onDrop={insertDroppedMaterial}
		/>
	)
}

function MaterialShelf({ materials, onInsert }: { materials: Material[]; onInsert: (material: Material) => void }) {
	return (
		<section className="shrink-0 bg-card px-4 py-3">
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center gap-2 text-xs font-semibold"><FolderOpen className="h-3.5 w-3.5 text-red-500" />素材库</div>
				<span className="text-[10px] text-muted-foreground">拖到输入框作为 AI 参考，拖到写作台插入正文；点击可快速插入正文</span>
			</div>
			<div className="flex min-h-20 gap-3 overflow-x-auto pb-1">
				{materials.length ? materials.map((material) => (
					<button
						key={material.id}
						type="button"
						onClick={() => onInsert(material)}
						disabled={material.type !== 'image'}
						title={`插入 ${material.filename}`}
						draggable={material.type === 'image'}
						onDragStart={(event) => {
							event.dataTransfer.setData('application/x-creator-material', JSON.stringify(material))
							event.dataTransfer.effectAllowed = 'copy'
						}}
						className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-md border bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{material.type === 'image'
							? <img src={material.url} alt={material.filename} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
							: <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">仅支持图片</span>}
					</button>
				)) : <div className="flex h-20 items-center text-xs text-muted-foreground">素材库暂无内容，可前往侧栏“素材库”上传。</div>}
			</div>
		</section>
	)
}

interface CreatePageProps {
	initialMode?: 'manual' | 'ai'
	onNavigate?: (menu: string) => void
}

export default function CreatePage({ initialMode, onNavigate }: CreatePageProps) {
	const user = useAuthStore((s) => s.user)
	const [chats, setChats] = useState<Chat[]>([])
	const [activeChatId, setActiveChatId] = useState<string | null>(null)
	const [messages, setMessages] = useState<Message[]>([])
	const [prompts, setPrompts] = useState<Prompt[]>([])
	const [materials, setMaterials] = useState<Material[]>([])
	const [importingImageUrls, setImportingImageUrls] = useState<Set<string>>(new Set())
	const [inputValue, setInputValue] = useState('')
	const [modelType, setModelType] = useState<string | undefined>(undefined)
	const [loadingChats, setLoadingChats] = useState(true)
	const [generationStates, setGenerationStates] = useState<Record<string, ChatGenerationState>>({})
	const [creationMode, setCreationMode] = useState<'manual' | 'ai' | null>(initialMode || 'ai')
	const { id: editingWorkId, title: draftTitle, content: draftContent, setTitle: setDraftTitle, setContent: setDraftContent, markSaved, clear: clearEditor } = useEditorStore()
	const [publishing, setPublishing] = useState(false)
	const [uploadingPastedImage, setUploadingPastedImage] = useState(false)
	const [showClearEditorDialog, setShowClearEditorDialog] = useState(false)
	const [clearingEditor, setClearingEditor] = useState(false)
	const [deleteChatTarget, setDeleteChatTarget] = useState<Chat | null>(null)
	const [renamingChat, setRenamingChat] = useState<Chat | null>(null)
	const [renameValue, setRenameValue] = useState('')
	const [selectedPromptCategory, setSelectedPromptCategory] = useState<string | null>(null)
	const [attachments, setAttachments] = useState<ImageAttachment[]>([])
	const [composerDragActive, setComposerDragActive] = useState(false)
	const [uploadingAttachment, setUploadingAttachment] = useState(false)
	const [listening, setListening] = useState(false)
	const [floatingSelection, setFloatingSelection] = useState<FloatingSelection | null>(null)
	const [interruptedMessageIds, setInterruptedMessageIds] = useState<Record<string, string | null>>({})
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const attachmentInputRef = useRef<HTMLInputElement>(null)
	const draftEditorRef = useRef<HTMLDivElement>(null)
	const activeChatIdRef = useRef<string | null>(null)
	const messagesRef = useRef<Message[]>([])
	const messagesByChatRef = useRef<Map<string, Message[]>>(new Map())
	const generationStatesRef = useRef<Record<string, ChatGenerationState>>({})
	const streamAbortByChatRef = useRef<Map<string, AbortController>>(new Map())
	const currentUserMessageIdByChatRef = useRef<Map<string, string>>(new Map())

	useEffect(() => {
		if (initialMode) setCreationMode(initialMode)
	}, [initialMode])
	const requestCounterByChatRef = useRef<Map<string, number>>(new Map())
	const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
	const composingRef = useRef(false)
	const requestCounter = useRef(0)
	const activeGeneration = activeChatId ? generationStates[activeChatId] : undefined
	const sending = activeGeneration?.sending ?? false
	const thinkingStage = activeGeneration?.thinkingStage ?? ''
	const activeGenerationType = activeGeneration?.generationType ?? 'text'
	const interruptedMessageId = activeChatId ? interruptedMessageIds[activeChatId] ?? null : null
	const promptCategories = promptCategoryDefinitions
	const importedImageUrls = useMemo(
		() => new Set(materials.map((material) => material.source_url).filter((url): url is string => Boolean(url))),
		[materials],
	)
	useDraftAutosave(user?.id)

	const updateChatGeneration = useCallback((chatId: string, next: ChatGenerationState) => {
		generationStatesRef.current = { ...generationStatesRef.current, [chatId]: next }
		setGenerationStates(generationStatesRef.current)
	}, [])

	const setInterruptedMessageForChat = useCallback((chatId: string, messageId: string | null) => {
		setInterruptedMessageIds((current) => ({ ...current, [chatId]: messageId }))
	}, [])

	// 加载聊天列表 + prompt 模板
	useEffect(() => {
		let cancelled = false
		requestCounter.current += 1
		streamAbortByChatRef.current.forEach((controller) => controller.abort())
		activeChatIdRef.current = null
		messagesRef.current = []
		messagesByChatRef.current.clear()
		generationStatesRef.current = {}
		streamAbortByChatRef.current.clear()
		currentUserMessageIdByChatRef.current.clear()
		requestCounterByChatRef.current.clear()
		setGenerationStates({})
		setInterruptedMessageIds({})
		setChats([])
		setActiveChatId(null)
		setMessages([])
		setPrompts([])
		setMaterials([])
		setInputValue('')
		setModelType(undefined)
		setSelectedPromptCategory(null)
		setDeleteChatTarget(null)
		setRenamingChat(null)
		setAttachments([])
		setFloatingSelection(null)
		setLoadingChats(!!user)
		if (!user) return
		Promise.all([
			getChats<Chat>(),
			getPrompts<Prompt>(),
			getMaterials<Material>(),
		]).then(([chatItems, promptItems, materialItems]) => {
			if (cancelled) return
			setChats(chatItems)
			setPrompts(promptItems)
			setMaterials(materialItems)
		}).catch(() => {
			if (!cancelled) {
				setChats([])
				setPrompts([])
				setMaterials([])
			}
		}).finally(() => { if (!cancelled) setLoadingChats(false) })
		return () => { cancelled = true }
	}, [user?.id])

	useEffect(() => () => {
		streamAbortByChatRef.current.forEach((controller) => controller.abort())
		speechRecognitionRef.current?.stop()
	}, [])

	useEffect(() => {
		activeChatIdRef.current = activeChatId
	}, [activeChatId])

	useEffect(() => {
		messagesRef.current = messages
	}, [messages])

	// 切换聊天时加载消息
	useEffect(() => {
		if (!activeChatId) {
			messagesRef.current = []
			setMessages([])
			return
		}
		// 生成中的会话直接恢复独立缓存，避免其他会话消息覆盖流式占位与进度。
		if (generationStatesRef.current[activeChatId]?.sending) {
			const cachedMessages = messagesByChatRef.current.get(activeChatId) || []
			messagesRef.current = cachedMessages
			setMessages(cachedMessages)
			return
		}
		let cancelled = false
		getChatMessages<Message>(activeChatId)
			.then((chatMessages) => {
				if (!cancelled) {
					messagesByChatRef.current.set(activeChatId, chatMessages)
					messagesRef.current = chatMessages
					setMessages(chatMessages)
				}
			})
		return () => {
			cancelled = true
		}
	}, [activeChatId])

	// 回到新对话起始页；首次发送时再创建服务端会话，避免产生空对话。
	const handleNewChat = useCallback(() => {
		if (!user) return
		activeChatIdRef.current = null
		messagesRef.current = []
		setActiveChatId(null)
		setMessages([])
		setInputValue('')
		setModelType(undefined)
		setSelectedPromptCategory(null)
		requestAnimationFrame(() => inputRef.current?.focus())
	}, [user])

	// 删除聊天
	const handleDeleteChat = useCallback(async () => {
		if (!deleteChatTarget) return
		await deleteChat(deleteChatTarget.id)
		setChats((prev) => prev.filter((c) => c.id !== deleteChatTarget.id))
		if (activeChatId === deleteChatTarget.id) {
			activeChatIdRef.current = null
			messagesRef.current = []
			setActiveChatId(null)
			setMessages([])
		}
		messagesByChatRef.current.delete(deleteChatTarget.id)
		streamAbortByChatRef.current.get(deleteChatTarget.id)?.abort()
		streamAbortByChatRef.current.delete(deleteChatTarget.id)
		currentUserMessageIdByChatRef.current.delete(deleteChatTarget.id)
		requestCounterByChatRef.current.delete(deleteChatTarget.id)
		const nextGenerationStates = { ...generationStatesRef.current }
		delete nextGenerationStates[deleteChatTarget.id]
		generationStatesRef.current = nextGenerationStates
		setGenerationStates(nextGenerationStates)
		setInterruptedMessageIds((current) => {
			const next = { ...current }
			delete next[deleteChatTarget.id]
			return next
		})
		setDeleteChatTarget(null)
	}, [activeChatId, deleteChatTarget])

	const startRenameChat = useCallback((chat: Chat) => {
		setRenamingChat(chat)
		setRenameValue(chat.title)
	}, [])

	const saveChatRename = useCallback(async () => {
		if (!renamingChat || !renameValue.trim()) return
		try {
			const chat = await renameChat<Chat>(renamingChat.id, renameValue.trim())
			setChats((current) => current.map((item) => item.id === chat.id ? chat : item))
			setRenamingChat(null)
			emitTaskProgress({ title: '会话已重命名', status: 'success' })
		} catch (error) {
			emitTaskProgress({ title: '重命名失败', status: 'error', message: error instanceof Error ? error.message : '请稍后重试' })
		}
	}, [renameValue, renamingChat])

	const addAttachment = useCallback((attachment: ImageAttachment) => {
		setAttachments((current) => current.some((item) => item.url === attachment.url)
			? current
			: [...current, attachment].slice(-4))
		setModelType('image')
		requestAnimationFrame(() => inputRef.current?.focus())
	}, [])

	const handleComposerMaterialDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault()
		setComposerDragActive(false)
		const raw = event.dataTransfer.getData('application/x-creator-material')
		if (!raw) return
		try {
			const material = JSON.parse(raw) as Material
			if (material.type !== 'image') {
				emitTaskProgress({ title: 'AI 图片参考仅支持图片素材', status: 'error' })
				return
			}
			addAttachment({ id: material.id, url: material.url, filename: material.filename, source: 'material' })
		} catch {
			emitTaskProgress({ title: '无法读取该素材', status: 'error' })
		}
	}, [addAttachment])

	const handleLocalAttachment = useCallback(async (file?: File) => {
		if (!file) return
		if (!file.type.startsWith('image/')) {
			emitTaskProgress({ title: '请选择图片文件', status: 'error' })
			return
		}
		setUploadingAttachment(true)
		try {
			const data = await fileAsDataUrl(file)
			const attachment = await uploadAiAttachment<{ url: string; filename: string }>({ filename: file.name, data })
			addAttachment({ id: createClientId(), ...attachment, source: 'upload' })
		} catch (error) {
			emitTaskProgress({ title: '图片上传失败', status: 'error', message: error instanceof Error ? error.message : '请稍后重试' })
		} finally {
			setUploadingAttachment(false)
			if (attachmentInputRef.current) attachmentInputRef.current.value = ''
		}
	}, [addAttachment])

	const toggleVoiceInput = useCallback(() => {
		if (listening) {
			speechRecognitionRef.current?.stop()
			return
		}
		const SpeechRecognition = (window as unknown as {
			SpeechRecognition?: new () => BrowserSpeechRecognition
			webkitSpeechRecognition?: new () => BrowserSpeechRecognition
		}).SpeechRecognition || (window as unknown as {
			webkitSpeechRecognition?: new () => BrowserSpeechRecognition
		}).webkitSpeechRecognition
		if (!SpeechRecognition) {
			emitTaskProgress({ title: '当前浏览器不支持语音输入', status: 'error', message: '请使用最新版 Chrome 或 Edge' })
			return
		}
		const recognition = new SpeechRecognition()
		recognition.lang = 'zh-CN'
		recognition.continuous = true
		recognition.interimResults = true
		let committed = ''
		recognition.onresult = (event) => {
			let interim = ''
			for (let index = event.resultIndex; index < event.results.length; index += 1) {
				const result = event.results[index]
				if (!result?.[0]) continue
				if (result.isFinal) committed += result[0].transcript
				else interim += result[0].transcript
			}
			setInputValue((current) => {
				const base = current.replace(/\n?\[语音输入中：.*\]$/, '')
				return `${base}${committed}${interim ? `\n[语音输入中：${interim}]` : ''}`
			})
			if (committed) committed = ''
		}
		recognition.onerror = () => {
			setListening(false)
			emitTaskProgress({ title: '语音识别中断', status: 'error', message: '请检查麦克风权限后重试' })
		}
		recognition.onend = () => {
			setListening(false)
			setInputValue((current) => current.replace(/\n?\[语音输入中：.*\]$/, ''))
		}
		speechRecognitionRef.current = recognition
		setListening(true)
		recognition.start()
	}, [listening])

	const stopGeneration = useCallback(() => {
		const chatId = activeChatIdRef.current
		if (!chatId || !generationStatesRef.current[chatId]?.sending) return
		setInterruptedMessageForChat(chatId, currentUserMessageIdByChatRef.current.get(chatId) || null)
		streamAbortByChatRef.current.get(chatId)?.abort()
	}, [setInterruptedMessageForChat])

	const insertSelectedText = useCallback(() => {
		if (!floatingSelection) return
		if (floatingSelection.source === 'assistant') {
			setDraftContent(`${draftContent}${draftContent.trim() ? '\n\n' : ''}${floatingSelection.text}`)
			emitTaskProgress({ title: '选中内容已插入写作台', status: 'success' })
		} else {
			setInputValue((current) => `${current}${current.trim() ? '\n\n' : ''}${floatingSelection.text}`)
			setCreationMode('ai')
			requestAnimationFrame(() => inputRef.current?.focus())
		}
		window.getSelection()?.removeAllRanges()
		setFloatingSelection(null)
	}, [draftContent, floatingSelection, setDraftContent])

	const referenceGeneratedImage = useCallback((url: string, alt: string) => {
		addAttachment({ id: createClientId(), url, filename: alt || 'AI 生成图片', source: 'generated' })
		emitTaskProgress({ title: '已引用生成图片', status: 'success', message: '在输入框描述你希望修改的内容' })
	}, [addAttachment])

	const captureAssistantSelection = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		const selection = window.getSelection()
		const container = event.currentTarget
		if (!selection || selection.isCollapsed || !selection.rangeCount || !container.contains(selection.anchorNode)) {
			setFloatingSelection(null)
			return
		}
		const text = selection.toString().trim()
		if (!text) return setFloatingSelection(null)
		const rect = selection.getRangeAt(0).getBoundingClientRect()
		setFloatingSelection({ text, x: rect.left + rect.width / 2, y: rect.top - 10, source: 'assistant' })
	}, [])

	const handleComposerKeyDown = useCallback((
		event: React.KeyboardEvent<HTMLTextAreaElement>,
		send: () => void,
	) => {
		if (event.key !== 'Enter') return
		event.stopPropagation()
		if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) return
		if (!event.shiftKey) {
			event.preventDefault()
			send()
		}
	}, [])

	// ===== SSE 流式发送消息（文本 / 图片通用） =====
	const sendStreamingMessage = useCallback(async (chatId: string, content: string, referencedImages: ImageAttachment[] = []): Promise<void> => {
		if (generationStatesRef.current[chatId]?.sending || !content.trim()) return

		const trimmedContent = content.trim()
		const generationType = referencedImages.length || modelType === 'image' ? 'image' : 'text'
		setInputValue('')
		setAttachments([])
		updateChatGeneration(chatId, {
			sending: true,
			generationType,
			thinkingStage: generationType === 'image' ? 'AI 正在处理图片' : 'AI 正在思考',
		})

		const sessionId = requestCounter.current
		const requestId = (requestCounterByChatRef.current.get(chatId) || 0) + 1
		requestCounterByChatRef.current.set(chatId, requestId)

		// 1. 临时用户消息
		const tempId = 'temp-' + Date.now()
		const tempMsg: Message = {
			id: tempId,
			role: 'user',
			content: trimmedContent,
			created_at: new Date().toISOString(),
		}
		const aiId = 'ai-' + Date.now()
		const aiPlaceholder: Message = {
			id: aiId,
			role: 'assistant',
			content: '',
			created_at: new Date().toISOString(),
		}
		const initialMessages = [
			...(messagesByChatRef.current.get(chatId) || (activeChatIdRef.current === chatId ? messagesRef.current : [])),
			tempMsg,
			aiPlaceholder,
		]
		messagesByChatRef.current.set(chatId, initialMessages)
		if (activeChatIdRef.current === chatId) {
			messagesRef.current = initialMessages
			setMessages(initialMessages)
			// 用户发送时拉一次到底部；rAF 等待 React 提交新消息后再滚，流式输出期间不再抢滚动
			requestAnimationFrame(() => {
				messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
			})
		}
		currentUserMessageIdByChatRef.current.set(chatId, tempId)

		const updateStreamingMessages = (updater: (current: Message[]) => Message[]) => {
			const nextMessages = updater(messagesByChatRef.current.get(chatId) || [])
			messagesByChatRef.current.set(chatId, nextMessages)
			if (activeChatIdRef.current === chatId) {
				messagesRef.current = nextMessages
				setMessages(nextMessages)
			}
		}

		let revealCancelled = false
		const abortController = new AbortController()
		streamAbortByChatRef.current.set(chatId, abortController)
		try {
			const response = await generateChatStream(chatId, {
				content: trimmedContent,
				modelType: referencedImages.length ? 'image' : modelType,
				attachments: referencedImages,
				signal: abortController.signal,
			})

			const reader = response.body!.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			let accumulatedContent = ''
			let queuedContent = ''
			let displayedContent = ''
			let streamFinished = false
			let revealPromise: Promise<void> | null = null
			let finalMessage: Message | null = null

			const startReveal = () => {
				if (revealPromise) return
				revealPromise = (async () => {
					while (!revealCancelled && (!streamFinished || queuedContent.length > 0)) {
						if (!queuedContent.length) {
							await new Promise((resolve) => setTimeout(resolve, 16))
							continue
						}
						// 积压较多时适当追赶网络流，积压较少时保持清晰的逐字效果。
						const step = queuedContent.length > 600 ? 12 : queuedContent.length > 200 ? 6 : queuedContent.length > 60 ? 3 : 1
						displayedContent += queuedContent.slice(0, step)
						queuedContent = queuedContent.slice(step)
						if (sessionId === requestCounter.current && requestId === requestCounterByChatRef.current.get(chatId)) {
							updateStreamingMessages((prev) =>
								prev.map((message) =>
									message.id === aiId ? { ...message, content: displayedContent } : message
								)
							)
						}
						await new Promise((resolve) => setTimeout(resolve, 16))
					}
				})()
			}

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })

				// 解析 SSE：data: {...}\n\n
				const lines = buffer.split('\n')
				buffer = lines.pop() || ''

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue
					try {
						const data = JSON.parse(line.slice(6))
						switch (data.type) {
							case 'status':
								updateChatGeneration(chatId, {
									sending: true,
									thinkingStage: data.message,
									generationType: data.model_type === 'image' ? 'image' : generationStatesRef.current[chatId]?.generationType || generationType,
								})
								break
							case 'user_message':
								// 用服务端返回的消息替换临时消息
								updateStreamingMessages((prev) =>
									prev.map((m) => (m.id === tempId ? data.message : m))
								)
								currentUserMessageIdByChatRef.current.set(chatId, data.message.id)
								setInterruptedMessageIds((current) => current[chatId] === tempId
									? { ...current, [chatId]: data.message.id }
									: current)
								break

							case 'chunk':
								updateChatGeneration(chatId, { sending: true, thinkingStage: 'AI 正在思考', generationType })
								accumulatedContent += data.content
								queuedContent += data.content
								startReveal()
								break

							case 'image':
								accumulatedContent = data.content
								displayedContent = data.content
								updateChatGeneration(chatId, { sending: true, thinkingStage: '', generationType: 'image' })
								updateStreamingMessages((prev) =>
									prev.map((message) =>
										message.id === aiId ? { ...message, content: data.content } : message
									)
								)
								break

							case 'done':
								finalMessage = data.message
								break

							case 'error':
								throw new Error(data.message)
						}
					} catch (e) {
						if (e instanceof SyntaxError) continue // 跳过无效 JSON
						throw e
					}
				}
			}

			streamFinished = true
			if (revealPromise) await revealPromise

			// 账号切换或同一会话的新请求已替代当前任务时，丢弃旧请求的最终 UI 更新。
			if (sessionId !== requestCounter.current || requestId !== requestCounterByChatRef.current.get(chatId)) return

			// 用服务端持久化的消息替换占位
			if (finalMessage) {
				updateStreamingMessages((prev) =>
					prev.map((m) => (m.id === aiId ? finalMessage! : m))
				)
			} else if (!accumulatedContent) {
				updateStreamingMessages((prev) => prev.filter((m) => m.id !== aiId))
			}

			if (activeChatIdRef.current === chatId) setModelType(undefined)
			// 刷新聊天列表（标题可能已更新）
			const [chatItems, materialItems] = await Promise.all([
				getChats<Chat>(),
				getMaterials<Material>(),
			])
			setChats(chatItems)
			setMaterials(materialItems)
		} catch (error) {
			revealCancelled = true
			if (error instanceof DOMException && error.name === 'AbortError') {
				setInterruptedMessageForChat(chatId, currentUserMessageIdByChatRef.current.get(chatId) || null)
				updateStreamingMessages((prev) => prev.map((message) =>
					message.id === aiId
						? { ...message, content: message.content || '已中断本次生成。' }
						: message
				))
				return
			}
			// 保留用户输入，并将 AI 占位改为可见的失败提示
			const failureMessage = error instanceof Error ? error.message : '生成失败，请稍后重试。'
			updateStreamingMessages((prev) =>
				prev.map((m) =>
					m.id === aiId
						? { ...m, content: failureMessage }
						: m
				)
			)
		} finally {
			if (requestId === requestCounterByChatRef.current.get(chatId)) {
				updateChatGeneration(chatId, { sending: false, thinkingStage: '', generationType })
				streamAbortByChatRef.current.delete(chatId)
			}
		}
	}, [modelType, setInterruptedMessageForChat, updateChatGeneration])

	// 发送消息（已有聊天）
	const handleSend = useCallback(async () => {
		if (!inputValue.trim() || !activeChatId || sending) return
		await sendStreamingMessage(activeChatId, inputValue, attachments)
	}, [inputValue, activeChatId, sending, sendStreamingMessage, attachments])

	// 新建聊天并发送消息
	const handleCreateAndSend = useCallback(async () => {
		if (!inputValue.trim() || sending) return
		const content = inputValue.trim()

		try {
			// 先创建聊天
			const chat = await createChat<Chat>()
			setChats((prev) => [chat, ...prev])
			activeChatIdRef.current = chat.id
			setActiveChatId(chat.id)

			// 再流式发送
			await sendStreamingMessage(chat.id, content, attachments)
		} catch {
			// 创建聊天失败不需要额外处理
		}
	}, [inputValue, sending, sendStreamingMessage, attachments])

	const handlePromptClick = useCallback((prompt: Prompt) => {
		setInputValue((current) => `${current}${current.trim() ? '\n\n' : ''}${prompt.content}`)
		setModelType(prompt.category === 'image' || prompt.category === 'image_edit' ? 'image' : undefined)
		setSelectedPromptCategory(null)
		requestAnimationFrame(() => {
			const input = inputRef.current
			if (!input) return
			input.focus()
			resizeInputTextarea(input)
		})
	}, [])

	const isLoggedIn = !!user

	useEffect(() => {
		requestAnimationFrame(() => {
			const input = inputRef.current
			if (input) resizeInputTextarea(input)
		})
	}, [inputValue, isLoggedIn, creationMode, activeChatId])

	const insertMaterial = useCallback((material: Material) => {
		if (material.type !== 'image') return
		const markdown = `![${material.filename}](${material.url})`
		const editor = draftEditorRef.current
		const selection = window.getSelection()
		if (editor && selection?.rangeCount) {
			const range = selection.getRangeAt(0)
			if (editor.contains(range.commonAncestorContainer)) {
				const holder = document.createElement('div')
				holder.innerHTML = markdownToEditorHtml(markdown)
				const materialNode = holder.firstElementChild
				if (materialNode) {
					range.deleteContents()
					range.insertNode(materialNode)
					range.setStartAfter(materialNode)
					range.collapse(true)
					selection.removeAllRanges()
					selection.addRange(range)
					editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
					return
				}
			}
		}
		setDraftContent(`${draftContent}${draftContent.trim() ? '\n\n' : ''}${markdown}\n`)
	}, [draftContent, setDraftContent])

	const registerPastedMaterial = useCallback((material: Material) => {
		setMaterials((current) => [material, ...current.filter((item) => item.id !== material.id)])
	}, [])

	const importAssistantMessage = useCallback((content: string) => {
		const article = articleFromAssistantMessage(content)
		if (!article.content) return
		if (!draftTitle.trim() && article.title) setDraftTitle(article.title)
		setDraftContent(`${draftContent}${draftContent.trim() ? '\n\n' : ''}${article.content}`)
		emitTaskProgress({ title: '已导入内容写作台', status: 'success', message: '你可以继续编辑、保存草稿或发布' })
		if (!window.matchMedia('(min-width: 1024px)').matches) setCreationMode('manual')
	}, [draftContent, draftTitle, setDraftContent, setDraftTitle])

	const importImageToMaterials = useCallback(async (messageId: string, url: string) => {
		setImportingImageUrls((current) => new Set(current).add(url))
		try {
			const data = await importMessageImage<Material>(messageId, url)
			setMaterials((current) => {
				const withoutDuplicate = current.filter((material) => material.id !== data.material.id)
				return [data.material, ...withoutDuplicate]
			})
			emitTaskProgress({
				title: data.already_exists ? '图片已在素材库中' : '已添加到素材库',
				status: 'success',
				message: '现在可以将图片拖入或插入文章正文',
			})
		} catch (error) {
			emitTaskProgress({ title: '添加素材失败', status: 'error', message: error instanceof Error ? error.message : '请稍后重试' })
		} finally {
			setImportingImageUrls((current) => {
				const next = new Set(current)
				next.delete(url)
				return next
			})
		}
	}, [])

	const insertGeneratedImage = useCallback((url: string) => {
		const markdown = `![AI 生成图片](${url})`
		const editor = draftEditorRef.current
		const selection = window.getSelection()
		if (editor && selection?.rangeCount) {
			const range = selection.getRangeAt(0)
			if (editor.contains(range.commonAncestorContainer)) {
				const holder = document.createElement('div')
				holder.innerHTML = markdownToEditorHtml(markdown)
				const imageNode = holder.firstElementChild
				if (imageNode) {
					range.deleteContents()
					range.insertNode(imageNode)
					range.setStartAfter(imageNode)
					range.collapse(true)
					selection.removeAllRanges()
					selection.addRange(range)
					editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
					emitTaskProgress({ title: '图片已插入正文', status: 'success', message: '图片未保存到素材库' })
					return
				}
			}
		}
		setDraftContent(`${draftContent}${draftContent.trim() ? '\n\n' : ''}${markdown}\n`)
		emitTaskProgress({ title: '图片已插入正文', status: 'success', message: '图片未保存到素材库' })
		if (!window.matchMedia('(min-width: 1024px)').matches) setCreationMode('manual')
	}, [draftContent, setDraftContent])

	const insertFormatting = useCallback((before: string, after = '', placeholder = '文本') => {
		const editor = draftEditorRef.current
		if (!editor) return
		editor.focus()
		const selection = window.getSelection()
		const hasSelection = !!selection && !selection.isCollapsed && editor.contains(selection.anchorNode)

		if (before === '# ') document.execCommand('formatBlock', false, 'h1')
		else if (before === '## ') document.execCommand('formatBlock', false, 'h2')
		else if (before === '**') document.execCommand('bold')
		else if (before === '*') document.execCommand('italic')
		else if (before === '> ') document.execCommand('formatBlock', false, 'blockquote')
		else if (before === '- ') document.execCommand('insertUnorderedList')
		else if (before === '[') {
			if (hasSelection) document.execCommand('createLink', false, 'https://')
			else document.execCommand('insertHTML', false, `<a href="https://">${escapeHtml(placeholder)}</a>`)
		} else if (before === '`') {
			if (hasSelection && selection) {
				const selected = selection.toString()
				document.execCommand('insertHTML', false, `<code>${escapeHtml(selected)}</code>`)
			} else document.execCommand('insertHTML', false, `<code>${escapeHtml(placeholder)}</code>`)
		} else {
			document.execCommand('insertText', false, `${before}${placeholder}${after}`)
		}
		editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
	}, [])

	const handlePublish = async (status: 'draft' | 'published') => {
		const currentContent = draftEditorRef.current ? editorHtmlToMarkdown(draftEditorRef.current) : draftContent
		if (!user || uploadingPastedImage || !draftTitle.trim() || !currentContent.trim()) return
		if (/!\[[^\]]*\]\(\s*(?:blob:|data:image\/)/i.test(currentContent)) {
			emitTaskProgress({ title: '图片尚未上传完成', status: 'error', message: '请删除临时图片后重新粘贴，并等待上传完成再提交' })
			return
		}
		if (currentContent !== draftContent) setDraftContent(currentContent)
		setPublishing(true)
		emitTaskProgress({ title: status === 'published' ? '正在提交 AI 审核' : '正在保存草稿', status: 'running', message: status === 'published' ? '正在创建内容版本与审核任务' : '正在同步内容与作品数据' })
		try {
			const work = await saveWork<{ id: string }>(editingWorkId, { title: draftTitle.trim(), content: currentContent.trim(), status })
			markSaved(work.id)
			if (status === 'published' && user) removeLocalDraft(user.id)
			emitTaskProgress({ title: status === 'published' ? '已进入审核队列' : '草稿保存成功', status: 'success', message: status === 'published' ? '审核通过后文章会自动发布' : '内容已同步' })
			if (status === 'published') {
				clearEditor()
				onNavigate?.('review')
			}
		} catch (error) {
			emitTaskProgress({ title: '操作失败', status: 'error', message: error instanceof Error ? error.message : '请稍后重试' })
		} finally {
			setPublishing(false)
		}
	}

	const requestClearEditor = () => {
		if (!draftTitle.trim() && !draftContent.trim()) {
			clearEditor()
			emitTaskProgress({ title: '写作台已清空', status: 'success' })
			return
		}
		setShowClearEditorDialog(true)
	}

	const saveDraftAndClear = async () => {
		if (!user) return
		setClearingEditor(true)
		try {
			const work = await saveWork<{ id: string }>(editingWorkId, {
				title: draftTitle.trim() || '未输入标题',
				content: draftContent.trim(),
				status: 'draft',
			})
			markSaved(work.id)
			clearEditor()
			removeLocalDraft(user.id)
			setShowClearEditorDialog(false)
			emitTaskProgress({ title: '草稿已保存，写作台已清空', status: 'success', message: '可在作品管理中继续编辑' })
		} catch (error) {
			emitTaskProgress({ title: '草稿保存失败', status: 'error', message: error instanceof Error ? error.message : '请稍后重试' })
		} finally {
			setClearingEditor(false)
		}
	}

	const discardAndClear = () => {
		clearEditor()
		if (user) removeLocalDraft(user.id)
		setShowClearEditorDialog(false)
		emitTaskProgress({ title: '内容已丢弃，写作台已清空', status: 'success' })
	}

	const clearEditorDialog = (
		<Dialog open={showClearEditorDialog} onOpenChange={(open) => !clearingEditor && setShowClearEditorDialog(open)}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>清空内容写作台？</DialogTitle>
					<DialogDescription>当前写作台还有内容。是否先将它保存为草稿？未填写标题时将使用“未输入标题”。</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button variant="destructive" disabled={clearingEditor} onClick={discardAndClear}>直接丢弃</Button>
					<Button disabled={clearingEditor} onClick={() => void saveDraftAndClear()} className="bg-red-500 text-white hover:bg-red-600">
						{clearingEditor && <Loader2 className="h-4 w-4 animate-spin" />}
						{clearingEditor ? '保存中…' : '存为草稿并清空'}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)

	if (!creationMode) {
		return (
			<div className="enter-workspace scrollBar-hidden flex-1 overflow-y-auto px-4 py-8 sm:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="mb-8">
						<div className="workspace-label mb-2">Creation workflow</div>
						<h1 className="text-2xl font-bold tracking-tight">选择你的创作方式</h1>
						<p className="mt-2 text-sm text-muted-foreground">从空白稿开始完整表达，或让 AI 帮你快速完成第一版。</p>
					</div>
					<div className="grid gap-5 md:grid-cols-2">
						<button type="button" onClick={() => setCreationMode('manual')} className="focus-red group min-h-64 rounded-lg border bg-card p-7 text-left transition-all hover:border-red-200 hover:shadow-sm">
							<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-500"><PenLine className="h-5 w-5" /></span>
							<h2 className="mt-10 text-xl font-bold">内容写作台</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">适合已有明确思路的创作者。专注编写标题和正文，完成后直接保存草稿或发布。</p>
							<span className="mt-8 flex items-center gap-1 text-sm font-semibold text-red-500">开始写作 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
						</button>
						<button type="button" onClick={() => setCreationMode('ai')} className="focus-red group min-h-64 rounded-lg border bg-[#242632] p-7 text-left text-white transition-all hover:-translate-y-0.5 hover:shadow-md">
							<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white"><WandSparkles className="h-5 w-5" /></span>
							<h2 className="mt-10 text-xl font-bold">AI 协作台</h2>
							<p className="mt-2 text-sm leading-6 text-white/60">适合从选题或一句想法起步。通过连续对话生成、修改并打磨文章初稿。</p>
							<span className="mt-8 flex items-center gap-1 text-sm font-semibold text-white">与 AI 共创 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
						</button>
					</div>
				</div>
			</div>
		)
	}

	if (creationMode === 'manual') {
		return (
			<>
				<div className="enter-workspace scrollBar-hidden flex-1 overflow-y-auto px-4 py-6 sm:px-8">
					<div className="mx-auto max-w-4xl">
						<div className="mb-5 flex items-center justify-between gap-4">
							<div><button type="button" onClick={() => setCreationMode(null)} className="text-xs text-muted-foreground hover:text-red-500">← 返回创作方式</button><h1 className="mt-2 text-xl font-bold">内容写作台</h1></div>
							<div className="flex gap-2">
								<Button variant="ghost" disabled={publishing || uploadingPastedImage || !isLoggedIn} onClick={requestClearEditor} className="text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" />清空写作台</Button>
								<Button variant="outline" disabled={publishing || uploadingPastedImage || !isLoggedIn} onClick={() => void handlePublish('draft')}>{uploadingPastedImage ? '图片上传中…' : '保存草稿'}</Button>
								<Button disabled={publishing || uploadingPastedImage || !isLoggedIn || !draftTitle.trim() || !draftContent.trim()} onClick={() => void handlePublish('published')} className="bg-red-500 text-white hover:bg-red-600">{uploadingPastedImage ? '图片上传中…' : '提交审核'}</Button>
							</div>
						</div>
						<div className="workspace-card overflow-hidden">
							<input disabled={!isLoggedIn} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder={isLoggedIn ? "输入文章标题" : "登录后开始写作"} className="w-full border-b bg-transparent px-7 py-6 text-2xl font-bold outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed disabled:bg-muted/25" />
							<InlineArticleEditor
								content={draftContent}
								onChange={setDraftContent}
								editorRef={draftEditorRef}
								disabled={!isLoggedIn}
								onTextSelection={setFloatingSelection}
								onImageUploaded={registerPastedMaterial}
								onImageUploadStateChange={setUploadingPastedImage}
							/>
						</div>
					</div>
				</div>
				{clearEditorDialog}
			</>
		)
	}

	return (
		<div className="enter-workspace relative flex h-full min-h-0 w-full flex-1 gap-3 overflow-hidden bg-muted/50 p-3">
			<section className="workspace-card order-2 hidden w-[42%] min-w-[420px] flex-col overflow-hidden bg-background rounded-lg shadow-sm lg:flex">
				<div className="shrink-0 border-b px-5 pt-3 pb-1">
					<div className="flex items-center justify-between gap-3">
						<div><div className="text-sm font-bold">内容写作台</div><div className="mt-1 text-[10px] text-muted-foreground">内容会在发布前保留在当前工作区</div></div>
						<div className="flex gap-2">
							<Button variant="ghost" size="sm" disabled={publishing || uploadingPastedImage || !isLoggedIn} onClick={requestClearEditor} className="text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" />清空</Button>
							<Button variant="outline" size="sm" disabled={publishing || uploadingPastedImage || !isLoggedIn || !draftTitle.trim() || !draftContent.trim()} onClick={() => void handlePublish('draft')}>{uploadingPastedImage ? '图片上传中…' : '保存草稿'}</Button>
							<Button size="sm" disabled={publishing || uploadingPastedImage || !isLoggedIn || !draftTitle.trim() || !draftContent.trim()} onClick={() => void handlePublish('published')} className="bg-red-500 text-white hover:bg-red-600">{uploadingPastedImage ? '图片上传中…' : '提交审核'}</Button>
						</div>
					</div>
					<div className=" flex flex-wrap items-center gap-1">
						{[
							{ label: "一级标题", icon: Heading1, before: "# ", after: "", placeholder: "一级标题" },
							{ label: "二级标题", icon: Heading2, before: "## ", after: "", placeholder: "二级标题" },
							{ label: "加粗", icon: Bold, before: "**", after: "**", placeholder: "加粗文本" },
							{ label: "斜体", icon: Italic, before: "*", after: "*", placeholder: "斜体文本" },
							{ label: "引用", icon: Quote, before: "> ", after: "", placeholder: "引用内容" },
							{ label: "无序列表", icon: List, before: "- ", after: "", placeholder: "列表项" },
							{ label: "链接", icon: Link2, before: "[", after: "](https://)", placeholder: "链接文字" },
							{ label: "行内代码", icon: Code2, before: "`", after: "`", placeholder: "代码" },
						].map((tool) => <button key={tool.label} disabled={!isLoggedIn} type="button" title={tool.label} aria-label={tool.label} onMouseDown={(event) => event.preventDefault()} onClick={() => insertFormatting(tool.before, tool.after, tool.placeholder)} className="focus-red flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"><tool.icon className="h-4 w-4" /></button>)}
						<span className="ml-auto text-[10px] text-muted-foreground">可将下方素材拖入正文</span>
					</div>
				</div>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<input
						disabled={!isLoggedIn}
						value={draftTitle}
						onChange={(event) => setDraftTitle(event.target.value)}
						placeholder={isLoggedIn ? "输入文章标题" : "登录后开始写作"}
						className="h-14 w-full shrink-0 bg-transparent px-4 text-xl font-bold outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed disabled:bg-muted/25"
					/>
					<InlineArticleEditor
						content={draftContent}
						onChange={setDraftContent}
						editorRef={draftEditorRef}
						fillHeight
						disabled={!isLoggedIn}
						onTextSelection={setFloatingSelection}
						onImageUploaded={registerPastedMaterial}
						onImageUploadStateChange={setUploadingPastedImage}
					/>
				</div>
			</section>
			<div className="relative flex min-w-0 flex-1 flex-col gap-3">
				<div className="workspace-card relative flex min-h-0 flex-1 overflow-hidden bg-background rounded-lg shadow-sm">
					{/* 侧边栏 */}
					<aside
						className={cn(
							'hidden flex-col border-r bg-card transition-all duration-200 shrink-0 md:flex',
							'w-56'
						)}
					>
						<div className="px-4 pt-4.5 pb-1">
							<Button
								onClick={handleNewChat}
								disabled={!isLoggedIn}
								className="cursor-pointer h-10 w-full gap-2 rounded-lg border-2 border-red-500/75 bg-red-50/50 text-foreground hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/35"

							>
								<Pencil className="w-4 h-4" />
								新对话
							</Button>
						</div>

						<nav className="scrollBar-hidden flex-1 overflow-y-auto px-2 pt-1 space-y-0.5">
							{!isLoggedIn ? (
								<div className="px-3 py-8 text-center text-sm font-medium text-muted-foreground">登录后查看</div>
							) : loadingChats ? (
								<div className="text-center text-sm text-muted-foreground py-8">加载中...</div>
							) : chats.length === 0 ? (
								<div className="text-center text-sm text-muted-foreground py-8">暂无历史记录</div>
							) : (
								chats.map((chat) => (
									<div
										key={chat.id}
										onClick={() => {
											activeChatIdRef.current = chat.id
											setActiveChatId(chat.id)
										}}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault()
												activeChatIdRef.current = chat.id
												setActiveChatId(chat.id)
											}
										}}
										role="button"
										tabIndex={0}
										className={cn(
											'focus-red w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors group',
											activeChatId === chat.id
												? 'bg-red-50 text-red-600 font-medium'
												: 'hover:bg-muted text-muted-foreground hover:text-foreground'
										)}
									>
										<MessageSquare className="w-4 h-4 shrink-0" />
										<span className="flex-1 truncate">{chat.title}</span>
										<button
											type="button"
											title="重命名会话"
											onClick={(event) => {
												event.stopPropagation()
												startRenameChat(chat)
											}}
											className="shrink-0 cursor-pointer opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
										>
											<Pencil className="h-3.5 w-3.5" />
										</button>
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation()
												setDeleteChatTarget(chat)
											}}
											className="shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
										>
											<Trash2 className="w-3.5 h-3.5" />
										</button>
									</div>
								))
							)}
						</nav>
					</aside>

					{/* 主内容区 */}
					<main className="flex-1 flex flex-col relative min-w-0 ">
						{isLoggedIn && activeChatId ? (
							/* 聊天视图 */
							<div className="flex-1 flex flex-col min-h-0">
								<div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
									<div>
										<div className="text-sm font-semibold">{chats.find((chat) => chat.id === activeChatId)?.title || '未命名创作'}</div>
										<div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
											<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 已保存对话
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span className="hidden rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-medium text-emerald-700 sm:inline">安全检查正常</span>
									</div>
								</div>
								{/* 消息列表 */}
								<div className="scrollBar-hidden flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
									<div className="max-w-4xl mx-auto space-y-5">
										{messages.length === 0 && (
											<div className="text-center text-muted-foreground py-16">
												<p className="text-lg">开始你的创作</p>
												<p className="text-sm mt-1">在下方输入你的需求，AI 将为你生成内容</p>
											</div>
										)}
										{messages.map((msg) => (
											<div
												key={msg.id}
												className={cn(
													'flex gap-3',
													msg.role === 'user' ? 'justify-end' : 'justify-start'
												)}
											>
												{msg.role === 'assistant' && (
													<div className="w-9 h-9 rounded-lg bg-[#242632] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
														AI
													</div>
												)}
												<div
													onMouseUp={msg.role === 'assistant' ? captureAssistantSelection : undefined}
													className={cn(
														'max-w-[75%] text-sm leading-6 whitespace-pre-wrap',
														msg.role === 'assistant' && !msg.content && sending && activeGenerationType === 'image'
															? 'border-0 bg-transparent p-0 shadow-none'
															: msg.role === 'user'
																? 'rounded-xl rounded-br-md border border-red-500 bg-red-500 px-4 py-3.5 text-white'
																: 'rounded-xl rounded-bl-md border bg-background px-4 py-3.5 text-foreground shadow-sm'
													)}
												>
													{msg.role === 'assistant' && !msg.content && sending ? (
														activeGenerationType === 'image' ? (
															<div className="w-72 overflow-hidden rounded-xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-orange-50 p-3 shadow-sm" aria-label="AI 正在绘制图片">
																<div className="relative mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-card/70">
																	<div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-red-100/70 to-transparent" />
																	<div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
																		<ImageIcon className="h-5 w-5 animate-pulse" />
																	</div>
																</div>
																<div className="px-1 pb-1">
																	<div className="flex items-center gap-2 text-xs font-medium text-red-600">
																		<Loader2 className="h-3.5 w-3.5 animate-spin" />
																		<span>{thinkingStage || 'AI 正在绘制图片'}</span>
																	</div>
																	<div className="mt-1 text-[10px] text-muted-foreground">正在构图、处理光影与画面细节…</div>
																</div>
															</div>
														) : (
															<div className="flex h-6 items-center gap-2 text-xs text-muted-foreground" aria-label={thinkingStage || "AI 正在思考"}>
																<span className="flex items-center gap-1">
																	<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400" style={{ animationDelay: '0ms' }} />
																	<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400" style={{ animationDelay: '150ms' }} />
																	<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400" style={{ animationDelay: '300ms' }} />
																</span>
																<span>{thinkingStage || 'AI 正在思考'}</span>
															</div>
														)
													) : msg.role === 'assistant' ? (
														<div>
															<MarkdownContent
																content={msg.content}
																onImportImage={(url) => void importImageToMaterials(msg.id, url)}
																onInsertImage={insertGeneratedImage}
																onReferenceImage={referenceGeneratedImage}
																importingUrls={importingImageUrls}
																importedUrls={importedImageUrls}
															/>
															{sending && msg.id.startsWith('ai-') && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-red-500 align-middle" aria-hidden="true" />}
														</div>
													) : (
														<div>
															<MarkdownContent content={msg.content} />
															{interruptedMessageId === msg.id && (
																<button
																	type="button"
																	onClick={() => {
																		const withoutImages = msg.content.replace(/!\[[^\]]*\]\([^)]+\)\s*/g, '').trim()
																		setInputValue(withoutImages)
																		if (activeChatId) setInterruptedMessageForChat(activeChatId, null)
																		requestAnimationFrame(() => inputRef.current?.focus())
																	}}
																	className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-white/25"
																>
																	<RotateCcw className="h-3 w-3" />
																	修改后重发
																</button>
															)}
														</div>
													)}
													{msg.role === 'assistant' && msg.content && msg.content !== '生成失败，请稍后重试。' && !sending && (
														<div className="mt-3 border-t pt-2">
															<button
																type="button"
																onClick={() => importAssistantMessage(msg.content)}
																className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
															>
																<FileText className="h-3.5 w-3.5" />
																导入内容写作台
															</button>
														</div>
													)}
												</div>
												{msg.role === 'user' && (
													<div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-red-400 to-red-600 text-xs font-bold text-white">
														{user?.nickname?.charAt(0) || user?.phone?.slice(-1) || '?'}
														{user?.avatar_url && <img src={resolveAssetUrl(user.avatar_url)} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />}
													</div>
												)}
											</div>
										))}
										<div ref={messagesEndRef} />
									</div>
								</div>

								{/* 底部输入 */}
								<div className="border-t bg-background px-2 py-2">
									<div className="max-w-4xl mx-auto">
										<div className="scrollBar-hidden mb-2 flex gap-2 overflow-x-auto px-1">
											{promptCategories.map((category) => {
												const Icon = category.icon
												const count = prompts.filter((prompt) => promptBelongsToCategory(prompt, category.id) && prompt.is_active !== false).length
												return (
													<button
														key={category.id}
														type="button"
														onClick={() => setSelectedPromptCategory(category.id)}
														className="focus-red inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/35"
													>
														<Icon className="h-3.5 w-3.5" />
														{category.title}
														<span className="text-[10px] opacity-60">{count}</span>
													</button>
												)
											})}
										</div>
										{attachments.length > 0 && (
											<div className="mb-2 flex flex-wrap gap-2 px-1">
												{attachments.map((attachment) => (
													<div key={attachment.id} className="group flex max-w-44 items-center gap-2 rounded-md border bg-red-50/60 p-1.5 pr-2">
														<img src={resolveAssetUrl(attachment.url)} alt="" className="h-9 w-9 rounded object-cover" />
														<span className="min-w-0 flex-1 truncate text-[11px]">{attachment.filename}</span>
														<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} className="cursor-pointer text-muted-foreground hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
													</div>
												))}
											</div>
										)}
										<div
											onDragEnter={(event) => {
												if (event.dataTransfer.types.includes('application/x-creator-material')) setComposerDragActive(true)
											}}
											onDragOver={(event) => {
												if (!event.dataTransfer.types.includes('application/x-creator-material')) return
												event.preventDefault()
												event.dataTransfer.dropEffect = 'copy'
											}}
											onDragLeave={(event) => {
												if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setComposerDragActive(false)
											}}
											onDrop={handleComposerMaterialDrop}
											className={cn(
												"relative min-h-16 rounded-lg border bg-background px-4 py-3 pr-16 shadow-[0_5px_18px_rgba(30,36,55,.05)] transition-all focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-500/5 sm:pr-28",
												composerDragActive && "border-red-400 bg-red-50/70 ring-4 ring-red-500/10 dark:bg-red-950/25",
											)}
										>
											<textarea
												ref={inputRef}
												value={inputValue}
												onChange={(e) => setInputValue(e.target.value)}
												onCompositionStart={() => { composingRef.current = true }}
												onCompositionEnd={() => { composingRef.current = false }}
												placeholder="描述你想创作的内容..."
												className="scrollBar-hidden block min-h-9 max-h-[200px] w-full resize-none overflow-y-auto border-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
												rows={1}
												onKeyDown={(e) => handleComposerKeyDown(e, () => void handleSend())}
												onInput={(e) => {
													resizeInputTextarea(e.currentTarget)
												}}
											/>
											{composerDragActive && (
												<div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-md border border-dashed border-red-400 bg-background/90 text-xs font-semibold text-red-500 backdrop-blur-sm">
													松开以引用这张图片
												</div>
											)}
											<div className="absolute bottom-3 right-3 flex items-center gap-1">
												<input ref={attachmentInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleLocalAttachment(event.target.files?.[0])} />
												<Button type="button" variant="ghost" size="icon" title="上传参考图片" disabled={uploadingAttachment} onClick={() => attachmentInputRef.current?.click()} className="hidden h-8 w-8 cursor-pointer text-muted-foreground sm:inline-flex">
													{uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
												</Button>
												<Button type="button" variant="ghost" size="icon" title={listening ? '停止语音输入' : '语音输入'} onClick={toggleVoiceInput} className={cn("hidden h-8 w-8 cursor-pointer sm:inline-flex", listening ? "bg-red-50 text-red-500" : "text-muted-foreground")}>
													<Mic className={cn("w-4 h-4", listening && "animate-pulse")} />
												</Button>
												<Button
													size="icon"
													onClick={() => sending ? stopGeneration() : void handleSend()}
													disabled={!sending && !inputValue.trim()}
													className={cn(
														'w-8 h-8 rounded-full transition-colors',
														sending || inputValue.trim()
															? 'bg-red-500 hover:bg-red-600 text-white'
															: 'bg-muted-foreground/20 text-muted-foreground cursor-not-allowed'
													)}
												>
													{sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="w-3.5 h-3.5" />}
												</Button>
											</div>
										</div>
									</div>
								</div>
							</div>
						) : (
							/* 空状态 - 居中输入 + Prompt 卡片 */
							<div className="scrollBar-hidden flex-1 overflow-y-auto px-8 py-4 ">
								<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6">
									<div>
										<div className="workspace-label mb-3">AI creation studio</div>
										<h1 className="mb-2 text-2xl font-bold tracking-[-0.04em] text-foreground sm:text-[32px]">
											把一个想法，变成作品。
										</h1>
										<p className="text-muted-foreground text-sm">
											描述主题、受众和表达方式，AI 会保留完整创作上下文。
										</p>
									</div>

									{/* 主输入框 */}
									<div className="workspace-card order-2 mt-auto w-full">
										{attachments.length > 0 && (
											<div className="flex flex-wrap gap-2 border-b px-3 py-2">
												{attachments.map((attachment) => (
													<div key={attachment.id} className="flex max-w-44 items-center gap-2 rounded-md bg-red-50 p-1.5 pr-2">
														<img src={resolveAssetUrl(attachment.url)} alt="" className="h-9 w-9 rounded object-cover" />
														<span className="min-w-0 flex-1 truncate text-[11px]">{attachment.filename}</span>
														<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} className="cursor-pointer text-muted-foreground hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
													</div>
												))}
											</div>
										)}
										<div
											onDragEnter={(event) => {
												if (event.dataTransfer.types.includes('application/x-creator-material')) setComposerDragActive(true)
											}}
											onDragOver={(event) => {
												if (!event.dataTransfer.types.includes('application/x-creator-material')) return
												event.preventDefault()
												event.dataTransfer.dropEffect = 'copy'
											}}
											onDragLeave={(event) => {
												if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setComposerDragActive(false)
											}}
											onDrop={handleComposerMaterialDrop}
											className={cn(
												"relative min-h-16 rounded-lg border bg-card px-4 py-1 pr-36 transition-all focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-500/5",
												composerDragActive && "border-red-400 bg-red-50/70 ring-4 ring-red-500/10 dark:bg-red-950/25",
											)}
										>
											<textarea
												ref={inputRef}
												value={inputValue}
												onChange={(e) => setInputValue(e.target.value)}
												onCompositionStart={() => { composingRef.current = true }}
												onCompositionEnd={() => { composingRef.current = false }}
												placeholder={isLoggedIn ? "例如：为刚入职场的年轻人写一篇关于 AI 工作流的文章，语气真诚、有具体案例…" : "请先登录后再开始创作"}
												disabled={!isLoggedIn}
												className="scrollBar-hidden block min-h-9 max-h-[200px] w-full resize-none overflow-y-auto border-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
												rows={1}
												onKeyDown={(e) => handleComposerKeyDown(e, () => void handleCreateAndSend())}
												onInput={(e) => {
													resizeInputTextarea(e.currentTarget)
												}}
											/>
											{composerDragActive && (
												<div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-md border border-dashed border-red-400 bg-background/90 text-xs font-semibold text-red-500 backdrop-blur-sm">
													松开以引用这张图片
												</div>
											)}
											<div className="absolute bottom-3 right-14 flex items-center gap-1">
												<input ref={attachmentInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleLocalAttachment(event.target.files?.[0])} />
												<Button type="button" variant="ghost" size="icon" title="上传参考图片" disabled={!isLoggedIn || uploadingAttachment} onClick={() => attachmentInputRef.current?.click()} className="h-8 w-8 cursor-pointer text-muted-foreground">{uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</Button>
												<Button type="button" variant="ghost" size="icon" title={listening ? '停止语音输入' : '语音输入'} disabled={!isLoggedIn} onClick={toggleVoiceInput} className={cn("h-8 w-8 cursor-pointer", listening ? "bg-red-50 text-red-500" : "text-muted-foreground")}><Mic className={cn("h-4 w-4", listening && "animate-pulse")} /></Button>
											</div>
											<Button
												size="icon"
												onClick={() => {
													if (activeChatId) {
														handleSend()
													} else {
														handleCreateAndSend()
													}
												}}
												disabled={!inputValue.trim() || !isLoggedIn}
												className={cn(
													'absolute bottom-3 right-3 h-9 w-9 shrink-0 rounded-lg transition-colors',
													inputValue.trim() && isLoggedIn
														? 'bg-red-500 hover:bg-red-600 text-white'
														: 'bg-muted-foreground/20 text-muted-foreground cursor-not-allowed'
												)}
											>
												<Send className="w-3.5 h-3.5" />
											</Button>
										</div>
									</div>

									{/* Prompt 模板卡片 */}
									{isLoggedIn && (
										<div className="order-1 w-full">
											<div className="mb-4 flex items-end justify-between">
												<div>
													<h3 className="text-sm font-bold">从提示词模版开始</h3>
													<p className="mt-1 text-xs text-muted-foreground">复用经过调试的提示词，快速进入稳定创作流程</p>
												</div>
												<span className="text-[11px] text-muted-foreground">共 {prompts.filter((prompt) => prompt.is_active !== false).length} 个提示词模版</span>
											</div>
											<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
												{promptCategories.map((category) => {
													const count = prompts.filter((prompt) => promptBelongsToCategory(prompt, category.id) && prompt.is_active !== false).length
													const Icon = category.icon
													return (
														<button
															key={category.id}
															onClick={() => setSelectedPromptCategory(category.id)}
															className="focus-red group flex min-h-12 items-start gap-3 rounded-lg border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-sm"
														>
															<div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-red-50">
																<Icon className="w-5 h-5 text-muted-foreground group-hover:text-red-500" />
															</div>
															<div className="flex-1 min-w-0">
																<div className="flex items-center justify-between gap-2">
																	<div className="truncate text-sm font-medium">{category.title}</div>
																	<span className="text-[10px] text-muted-foreground">{count} 个</span>
																</div>
																<div className="mt-1 text-xs text-muted-foreground">{category.description}</div>
															</div>
														</button>
													)
												})}
											</div>
										</div>
									)}
								</div>
							</div>
						)}
					</main>
				</div>
				<div className="workspace-card shrink-0 overflow-hidden bg-background  rounded-lg shadow-sm">
					<MaterialShelf materials={materials} onInsert={insertMaterial} />
				</div>
			</div>
			{floatingSelection && (
				<button
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={insertSelectedText}
					style={{ left: floatingSelection.x, top: floatingSelection.y }}
					className="fixed z-[80] flex -translate-x-1/2 -translate-y-full cursor-pointer items-center gap-1.5 rounded-md bg-[#242632] px-3 py-2 text-xs font-medium text-white shadow-xl transition hover:bg-red-500"
				>
					<CopyPlus className="h-3.5 w-3.5" />
					{floatingSelection.source === 'assistant' ? '插入写作台' : '发送给 AI'}
				</button>
			)}
			<Dialog open={!!renamingChat} onOpenChange={(open) => !open && setRenamingChat(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>重命名会话</DialogTitle>
						<DialogDescription>使用便于回忆的名称整理你的创作记录。</DialogDescription>
					</DialogHeader>
					<input
						autoFocus
						maxLength={80}
						value={renameValue}
						onChange={(event) => setRenameValue(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
								event.preventDefault()
								void saveChatRename()
							}
						}}
						className="focus-red h-10 rounded-md border bg-background px-3 text-sm outline-none"
						placeholder="输入会话名称"
					/>
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => setRenamingChat(null)}>取消</Button>
						<Button disabled={!renameValue.trim()} onClick={() => void saveChatRename()} className="bg-red-500 text-white hover:bg-red-600"><Check className="h-4 w-4" />保存</Button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={!!deleteChatTarget} onOpenChange={(open) => !open && setDeleteChatTarget(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>确认删除会话？</DialogTitle>
						<DialogDescription>“{deleteChatTarget?.title}”及其中的全部 AI 对话记录将永久删除，此操作无法撤销。</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => setDeleteChatTarget(null)}>取消</Button>
						<Button variant="destructive" onClick={() => void handleDeleteChat()}>确认删除</Button>
					</div>
				</DialogContent>
			</Dialog>
			{clearEditorDialog}
			<Dialog open={!!selectedPromptCategory} onOpenChange={(open) => !open && setSelectedPromptCategory(null)}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{promptCategories.find((item) => item.id === selectedPromptCategory)?.title || '选择提示词模版'}</DialogTitle>
						<DialogDescription>选择后会填入下方 AI 输入框，你可以继续修改其中的变量与创作要求。</DialogDescription>
					</DialogHeader>
					<div className="scrollBar-hidden grid max-h-[52vh] gap-2 overflow-y-auto pr-1">
						{prompts.filter((prompt) => promptBelongsToCategory(prompt, selectedPromptCategory) && prompt.is_active !== false).map((prompt) => {
							const Icon = iconMap[prompt.icon] || FileText
							return (
								<button
									key={prompt.id}
									type="button"
									onClick={() => handlePromptClick(prompt)}
									className="focus-red cursor-pointer rounded-md border p-4 text-left transition-colors hover:border-red-200 hover:bg-red-50/40"
								>
									<div className="flex items-start gap-3">
										<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted"><Icon className="h-4 w-4" /></span>
										<span className="min-w-0">
											<strong className="block text-sm">{prompt.title}</strong>
											<span className="mt-1 block text-xs leading-5 text-muted-foreground">{prompt.description || prompt.content}</span>
										</span>
									</div>
								</button>
							)
						})}
						{!prompts.some((prompt) => prompt.category === selectedPromptCategory && prompt.is_active !== false) && (
							<div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">该类别暂无提示词模版</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
