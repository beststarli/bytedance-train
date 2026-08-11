import { Router } from 'express'
import chatsRouter from './chats'
import messagesRouter from './messages'
import aiRouter from './ai'
import promptsRouter from './prompts'
import worksRouter from './works'
import materialsRouter from './materials'
import feedRouter from './feed'

const router: Router = Router()

router.use(chatsRouter)
router.use(messagesRouter)
router.use(aiRouter)
router.use(promptsRouter)
router.use(worksRouter)
router.use(materialsRouter)
router.use(feedRouter)

export default router