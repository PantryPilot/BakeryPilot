import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomStrip, TopBar } from '../components/Shell'

jest.mock('../lib/hooks', () => ({
  useEsgCounter: () => ({
    data: { wasteAvoided: 12345, co2eSaved: 9.8 },
    status: 'live',
  }),
}))

jest.mock('../lib/context', () => ({
  useApp: () => ({
    facility: 'all',
    setFacility: jest.fn(),
    sidebarCollapsed: false,
    setSidebarCollapsed: jest.fn(),
    chatOpen: false,
    setChatOpen: jest.fn(),
    chatContext: null,
    setChatContext: jest.fn(),
    openChatContext: jest.fn(),
  }),
}))

// ---------- BottomStrip ----------

describe('BottomStrip', () => {
  test('renders waste avoided label', () => {
    render(<BottomStrip />)
    expect(screen.getByText('Waste avoided')).toBeInTheDocument()
  })

  test('renders CO2e saved label', () => {
    render(<BottomStrip />)
    expect(screen.getByText('CO2e saved')).toBeInTheDocument()
  })

  test('renders active disruptions label', () => {
    render(<BottomStrip />)
    expect(screen.getByText('Active disruptions')).toBeInTheDocument()
  })

  test('renders MOQ-tax YTD label', () => {
    render(<BottomStrip />)
    expect(screen.getByText('MOQ-tax YTD')).toBeInTheDocument()
  })

  test('renders waste avoided value from live data', () => {
    render(<BottomStrip />)
    expect(screen.getByText('$12,345')).toBeInTheDocument()
  })

  test('renders CO2e value from live data', () => {
    render(<BottomStrip />)
    expect(screen.getByText('9.8 t')).toBeInTheDocument()
  })
})

// ---------- TopBar ----------

describe('TopBar', () => {
  test('renders without crashing', () => {
    render(<TopBar />)
  })

  test('shows SSE live badge', () => {
    render(<TopBar />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  test('shows facility selector button', () => {
    render(<TopBar />)
    expect(screen.getByText('All Plants')).toBeInTheDocument()
  })

  test('opens facility dropdown on click', () => {
    render(<TopBar />)
    fireEvent.click(screen.getByText('All Plants'))
    expect(screen.getByText('Plant 1')).toBeInTheDocument()
  })
})
