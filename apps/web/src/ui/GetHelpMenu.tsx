// "Get Help" dropdown (DESIGN-SPEC §4.2): Live Chat · Help Centre · Community. Live chat has no
// provider connected in this build, so the item opens a modal that says so and points at the help
// centre instead of pretending a chat session started.
import { useRef, useState } from 'react'
import { Button } from './Button'
import { BookOpenIcon, ChatBubbleLeftRightIcon, ChevronDownMiniIcon, QuestionMarkCircleIcon, UserGroupIcon } from './icons'
import { Menu, MenuItem, MenuLink } from './Menu'
import { Modal } from './Modal'
import { Text, TextLink } from './Text'

export function GetHelpMenu() {
  const [chatOpen, setChatOpen] = useState(false)
  // The menu item that opens the dialog unmounts with the menu, so the dialog returns focus here.
  const helpButton = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <Menu
        align="end"
        label="Get Help"
        trigger={
          <Button ref={helpButton} variant="outline" size="xs" className="pe-4" icon={<QuestionMarkCircleIcon className="size-4" />} iconTrailing={<ChevronDownMiniIcon className="size-4 text-zinc-400" />}>
            Get Help
          </Button>
        }
      >
        <MenuItem icon={<ChatBubbleLeftRightIcon className="size-4" />} onSelect={() => setChatOpen(true)}>
          Live Chat
        </MenuItem>
        <MenuLink to="/help" icon={<BookOpenIcon className="size-4" />}>
          Help Centre
        </MenuLink>
        <MenuLink to="/help/community" icon={<UserGroupIcon className="size-4" />}>
          Community
        </MenuLink>
      </Menu>
      <Modal
        open={chatOpen}
        onOpenChange={setChatOpen}
        returnFocusTo={helpButton}
        title="Live chat is not connected"
        footer={
          <Button variant="primary" onClick={() => setChatOpen(false)}>
            Close
          </Button>
        }
      >
        <Text>
          This workspace has no live-chat provider configured, so nobody is on the other end of this button yet. Browse the{' '}
          <TextLink to="/help" onClick={() => setChatOpen(false)}>Help Centre</TextLink> or ask in the{' '}
          <TextLink to="/help/community" onClick={() => setChatOpen(false)}>Community</TextLink> in the meantime.
        </Text>
      </Modal>
    </>
  )
}
