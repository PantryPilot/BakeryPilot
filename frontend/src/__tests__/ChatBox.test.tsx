import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatBox } from '../components/ChatDrawer'

function setup(overrides?: Partial<React.ComponentProps<typeof ChatBox>>) {
  const onSend = jest.fn()
  const setValue = jest.fn()
  const props = { value: '', setValue, onSend, ...overrides }
  const result = render(<ChatBox {...props} />)
  return { ...result, onSend, setValue }
}

describe('ChatBox', () => {
  test('renders textarea with placeholder', () => {
    setup()
    expect(screen.getByPlaceholderText(/Ask anything/i)).toBeInTheDocument()
  })

  test('calls setValue when user types', () => {
    const { setValue } = setup()
    const textarea = screen.getByPlaceholderText(/Ask anything/i)
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(setValue).toHaveBeenCalledWith('hello')
  })

  test('calls onSend when Enter is pressed (no shift)', () => {
    const { onSend } = setup({ value: 'send me' })
    const textarea = screen.getByPlaceholderText(/Ask anything/i)
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  test('does NOT call onSend on Shift+Enter', () => {
    const { onSend } = setup({ value: 'newline' })
    const textarea = screen.getByPlaceholderText(/Ask anything/i)
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  test('calls onSend when send button is clicked', () => {
    const { onSend } = setup({ value: 'click send' })
    // find send button by its SVG icon parent
    const buttons = screen.getAllByRole('button')
    const sendButton = buttons[buttons.length - 1]
    fireEvent.click(sendButton)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  test('renders voice button when onVoice is provided', () => {
    const onVoice = jest.fn()
    setup({ onVoice })
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })
})
