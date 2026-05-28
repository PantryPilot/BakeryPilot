import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { FlowSightCanvas } from '../components/FlowSightCanvas'

jest.mock('../lib/hooks', () => ({
  useSuppliers: () => ({
    data: [
      { id: 's1', name: 'Maple Grain', tier: 1, onTime: 0.96, moqTaxQtd: 0, status: 'ok' },
    ],
  }),
  useDisruptions: () => ({ data: [] }),
  useNewsDisruptionFeed: () => ({ data: [], status: "live" }),
  useRetailers: () => ({ data: [] }),
  useFacilities: () => ({ data: [] }),
  useAllSupplierOrders: () => ({ data: [], status: 'live' }),
  useOutboundShipments: () => ({ data: [], status: 'live' }),
  useFacilityUtilization: () => ({ data: null }),
  useActiveRuns: () => ({ data: [], status: 'idle' }),
  useYieldTelemetry: () => ({ data: [] }),
  useEsgCounter: () => ({
    data: { wasteAvoided: 5200, co2eSaved: 3.4, moqTaxYtd: 8200, disruptionsCaught: 2 },
    status: 'live',
  }),
}))

const mockUseApp = jest.fn(() => ({
  theme: 'dark' as const,
  setTheme: jest.fn(),
  facility: 'all' as const,
  setFacility: jest.fn(),
}))

jest.mock('../lib/context', () => ({
  useApp: () => mockUseApp(),
}))

// ---------- Flow legend overlay ----------

describe('Flow legend overlay', () => {
  test('renders confirmed PO label', () => {
    render(<FlowSightCanvas />)
    fireEvent.click(screen.getByText('Flow & ESG').closest('button')!)
    expect(screen.getByText('confirmed')).toBeInTheDocument()
  })

  test('renders draft PO label', () => {
    render(<FlowSightCanvas />)
    fireEvent.click(screen.getByText('Flow & ESG').closest('button')!)
    expect(screen.getByText('draft / pending')).toBeInTheDocument()
  })

  test('renders outbound shipment legend labels', () => {
    render(<FlowSightCanvas />)
    fireEvent.click(screen.getByText('Flow & ESG').closest('button')!)
    expect(screen.getByText('scheduled')).toBeInTheDocument()
    expect(screen.getByText('in transit')).toBeInTheDocument()
  })

  test('renders Supplier POs section header', () => {
    render(<FlowSightCanvas />)
    fireEvent.click(screen.getByText('Flow & ESG').closest('button')!)
    expect(screen.getByText('Supplier POs')).toBeInTheDocument()
  })
})

// ---------- TimeScrubber ----------

describe('TimeScrubber', () => {
  test('renders play button', () => {
    render(<FlowSightCanvas />)
    // 1× speed button is always visible
    expect(screen.getAllByText('1×')[0]).toBeInTheDocument()
  })

  test('renders speed buttons 1×, 2×, 5×', () => {
    render(<FlowSightCanvas />)
    expect(screen.getAllByText('1×')[0]).toBeInTheDocument()
    expect(screen.getAllByText('2×')[0]).toBeInTheDocument()
    expect(screen.getAllByText('5×')[0]).toBeInTheDocument()
  })

  test('renders LIVE button', () => {
    render(<FlowSightCanvas />)
    expect(screen.getAllByText('LIVE')[0]).toBeInTheDocument()
  })

  test('renders time labels', () => {
    render(<FlowSightCanvas />)
    expect(screen.getAllByText('-24h')[0]).toBeInTheDocument()
    expect(screen.getAllByText('-12h')[0]).toBeInTheDocument()
    expect(screen.getAllByText('now')[0]).toBeInTheDocument()
  })

  test('renders ESG waste saved value', () => {
    render(<FlowSightCanvas />)
    fireEvent.click(screen.getByText('Flow & ESG').closest('button')!)
    expect(screen.getAllByText('5,200')[0]).toBeInTheDocument()
  })

  test('renders CO₂e value', () => {
    render(<FlowSightCanvas />)
    fireEvent.click(screen.getByText('Flow & ESG').closest('button')!)
    expect(screen.getAllByText(/3\.4 t/)[0]).toBeInTheDocument()
  })

  test('1× speed button is active by default', () => {
    const { container } = render(<FlowSightCanvas />)
    const speedBtns = container.querySelectorAll('button')
    const oneX = Array.from(speedBtns).find(b => b.textContent === '1×')
    expect(oneX?.className).toMatch(/border-blue-500/)
  })

  test('clicking 2× selects it as active speed', () => {
    const { container } = render(<FlowSightCanvas />)
    const speedBtns = container.querySelectorAll('button')
    const twoX = Array.from(speedBtns).find(b => b.textContent === '2×')
    fireEvent.click(twoX!)
    expect(twoX?.className).toMatch(/border-blue-500/)
  })

  test('clicking 5× selects it as active speed', () => {
    const { container } = render(<FlowSightCanvas />)
    const speedBtns = container.querySelectorAll('button')
    const fiveX = Array.from(speedBtns).find(b => b.textContent === '5×')
    fireEvent.click(fiveX!)
    expect(fiveX?.className).toMatch(/border-blue-500/)
  })
})

// ---------- LayerToggles ----------

describe('LayerToggles', () => {
  test('renders Layers heading', () => {
    render(<FlowSightCanvas />)
    expect(screen.getByText('Layers')).toBeInTheDocument()
  })

  test('shows layer names when expanded', () => {
    render(<FlowSightCanvas />)
    const layersBtn = screen.getByText('Layers').closest('button')!
    fireEvent.click(layersBtn)
    expect(screen.getByText('Risk')).toBeInTheDocument()
    expect(screen.getByText('Yield')).toBeInTheDocument()
    expect(screen.getByText('Procurement')).toBeInTheDocument()
  })

  test('collapses on header click and hides layer list', () => {
    render(<FlowSightCanvas />)
    const layersBtn = screen.getByText('Layers').closest('button')!
    fireEvent.click(layersBtn)
    fireEvent.click(layersBtn)
    expect(screen.getByTestId('layers-content')).toHaveAttribute('aria-hidden', 'true')
  })

  test('expands again after second click', () => {
    render(<FlowSightCanvas />)
    const layersBtn = screen.getByText('Layers').closest('button')!
    fireEvent.click(layersBtn)
    fireEvent.click(layersBtn)
    fireEvent.click(layersBtn)
    expect(screen.getByText('Risk')).toBeInTheDocument()
  })

  test('shows active layer count', () => {
    render(<FlowSightCanvas />)
    // Risk + Procurement + Schedule are defaultOn=true → "3 on"
    expect(screen.getByText('3 on')).toBeInTheDocument()
  })

  test('toggling a layer updates the count', () => {
    render(<FlowSightCanvas />)
    const layersBtn = screen.getByText('Layers').closest('button')!
    fireEvent.click(layersBtn)
    const yieldBtn = screen.getByText('Yield').closest('button')!
    fireEvent.click(yieldBtn)
    expect(screen.getByText('4 on')).toBeInTheDocument()
  })
})

// ---------- FlowSight label ----------

describe('FlowSightCanvas header', () => {
  test('renders FlowSight pill', () => {
    render(<FlowSightCanvas />)
    expect(screen.getByText('FlowSight')).toBeInTheDocument()
  })
})

describe('FlowSightCanvas plant filter', () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      theme: 'dark',
      setTheme: jest.fn(),
      facility: 'all',
      setFacility: jest.fn(),
    })
  })

  test('shows plant name in header when a single plant is selected', () => {
    mockUseApp.mockReturnValue({
      theme: 'dark',
      setTheme: jest.fn(),
      facility: 'p1',
      setFacility: jest.fn(),
    })
    render(<FlowSightCanvas />)
    expect(screen.getByText(/Toronto/)).toBeInTheDocument()
  })
})
