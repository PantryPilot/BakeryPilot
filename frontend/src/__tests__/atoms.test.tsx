import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  Pill,
  Dot,
  MOQTaxBadge,
  ReliabilityHalo,
  ActionCard,
  ToolBreadcrumbs,
  Sparkline,
  YieldCounter,
  StatusBadge,
  RiskBar,
  SectionHeader,
  StreamingText,
  type ActionCardData,
} from '../components/atoms'

// ---------- Pill ----------

describe('Pill', () => {
  test('renders children', () => {
    render(<Pill>hello</Pill>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  test('applies blue tone class', () => {
    const { container } = render(<Pill tone="blue">x</Pill>)
    expect(container.firstChild).toHaveClass('text-blue-300')
  })

  test('applies green tone class', () => {
    const { container } = render(<Pill tone="green">x</Pill>)
    expect(container.firstChild).toHaveClass('text-emerald-300')
  })

  test('applies amber tone class', () => {
    const { container } = render(<Pill tone="amber">x</Pill>)
    expect(container.firstChild).toHaveClass('text-amber-300')
  })

  test('applies red tone class', () => {
    const { container } = render(<Pill tone="red">x</Pill>)
    expect(container.firstChild).toHaveClass('text-red-400')
  })

  test('accepts extra className', () => {
    const { container } = render(<Pill className="my-custom">x</Pill>)
    expect(container.firstChild).toHaveClass('my-custom')
  })
})

// ---------- Dot ----------

describe('Dot', () => {
  test('renders without crashing', () => {
    const { container } = render(<Dot />)
    expect(container.firstChild).toBeInTheDocument()
  })

  test('applies green color by default', () => {
    const { container } = render(<Dot tone="green" />)
    expect(container.firstChild).toHaveClass('bg-emerald-400')
  })

  test('applies red color', () => {
    const { container } = render(<Dot tone="red" />)
    expect(container.firstChild).toHaveClass('bg-red-400')
  })

  test('adds animate-pulse when pulse=true', () => {
    const { container } = render(<Dot pulse />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })

  test('no pulse class by default', () => {
    const { container } = render(<Dot />)
    expect(container.firstChild).not.toHaveClass('animate-pulse')
  })
})

// ---------- MOQTaxBadge ----------

describe('MOQTaxBadge', () => {
  test('renders nothing when amount is 0', () => {
    const { container } = render(<MOQTaxBadge amount={0} />)
    expect(container.firstChild).toBeNull()
  })

  test('renders nothing when amount is negative', () => {
    const { container } = render(<MOQTaxBadge amount={-100} />)
    expect(container.firstChild).toBeNull()
  })

  test('renders the formatted amount', () => {
    render(<MOQTaxBadge amount={1500} />)
    expect(screen.getByText('$1,500')).toBeInTheDocument()
  })

  test('shows MOQ-tax label', () => {
    render(<MOQTaxBadge amount={500} />)
    expect(screen.getByText('MOQ-tax')).toBeInTheDocument()
  })

  test('shows Draft negotiation button when over threshold', () => {
    const onDraft = jest.fn()
    render(<MOQTaxBadge amount={4000} threshold={3000} onDraft={onDraft} />)
    const btn = screen.getByText('Draft negotiation')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onDraft).toHaveBeenCalledTimes(1)
  })

  test('no Draft negotiation button when under threshold', () => {
    render(<MOQTaxBadge amount={1000} threshold={3000} />)
    expect(screen.queryByText('Draft negotiation')).not.toBeInTheDocument()
  })

  test('uses amber styling when under threshold', () => {
    const { container } = render(<MOQTaxBadge amount={1000} threshold={3000} />)
    expect(container.firstChild).toHaveClass('border-amber-500/40')
  })

  test('uses red styling when over threshold', () => {
    const { container } = render(<MOQTaxBadge amount={5000} threshold={3000} />)
    expect(container.firstChild).toHaveClass('border-red-500/50')
  })
})

// ---------- ReliabilityHalo ----------

describe('ReliabilityHalo', () => {
  test('renders SVG with children', () => {
    render(
      <ReliabilityHalo score={0.95} disrupt={false}>
        <span>inner</span>
      </ReliabilityHalo>
    )
    expect(screen.getByText('inner')).toBeInTheDocument()
  })

  test('renders without children', () => {
    const { container } = render(<ReliabilityHalo score={0.90} disrupt={false} />)
    expect(container.firstChild).toBeInTheDocument()
  })
})

// ---------- ActionCard ----------

const sampleCard: ActionCardData = {
  kind: 'supplier_order',
  agent: 'ProcurementAgent',
  title: 'Order 500kg Flour from Maple Grain',
  summary: [
    { label: 'Qty', value: '500 kg' },
    { label: 'Cost', value: '$2,400', tone: 'green' },
    { label: 'ETA', value: '2d' },
  ],
}

describe('ActionCard', () => {
  test('renders title', () => {
    render(<ActionCard card={sampleCard} />)
    expect(screen.getByText('Order 500kg Flour from Maple Grain')).toBeInTheDocument()
  })

  test('renders agent name as Pill', () => {
    render(<ActionCard card={sampleCard} />)
    expect(screen.getByText('ProcurementAgent')).toBeInTheDocument()
  })

  test('renders kind label', () => {
    render(<ActionCard card={sampleCard} />)
    expect(screen.getByText('supplier_order')).toBeInTheDocument()
  })

  test('renders summary rows', () => {
    render(<ActionCard card={sampleCard} />)
    expect(screen.getByText('500 kg')).toBeInTheDocument()
    expect(screen.getByText('$2,400')).toBeInTheDocument()
    expect(screen.getByText('Qty')).toBeInTheDocument()
  })

  test('Confirm button calls onConfirm and shows confirmed state', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined)
    render(<ActionCard card={sampleCard} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledWith(sampleCard)
    await waitFor(() => {
      expect(screen.getByText('Confirmed')).toBeInTheDocument()
    })
  })

  test('Reject button calls onReject', async () => {
    const onReject = jest.fn().mockResolvedValue(undefined)
    render(<ActionCard card={sampleCard} onReject={onReject} />)
    fireEvent.click(screen.getByText('Reject'))
    expect(onReject).toHaveBeenCalledWith(sampleCard)
    await waitFor(() => {
      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })
  })

  test('Edit button calls onEdit', () => {
    const onEdit = jest.fn()
    render(<ActionCard card={sampleCard} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  test('hides action buttons in compact mode', () => {
    render(<ActionCard card={sampleCard} compact />)
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
    expect(screen.queryByText('Reject')).not.toBeInTheDocument()
  })

  test('renders flags as Pill badges', () => {
    const cardWithFlags: ActionCardData = {
      ...sampleCard,
      flags: [{ text: 'expiring soon', tone: 'amber' }],
    }
    render(<ActionCard card={cardWithFlags} />)
    expect(screen.getByText('expiring soon')).toBeInTheDocument()
  })

  test('details toggle shows/hides cost breakdown', () => {
    const cardWithDetails: ActionCardData = {
      ...sampleCard,
      details: [{ label: 'Unit price', value: '$4.80/kg' }],
    }
    render(<ActionCard card={cardWithDetails} />)
    const toggle = screen.getByText(/Show cost breakdown/i)
    fireEvent.click(toggle)
    expect(screen.getByText('Unit price')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Hide cost breakdown/i))
    expect(screen.queryByText('Unit price')).not.toBeInTheDocument()
  })

  test('renders pre-confirmed state', () => {
    render(<ActionCard card={{ ...sampleCard, state: 'confirmed' }} />)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
  })

  test('renders pre-rejected state', () => {
    render(<ActionCard card={{ ...sampleCard, state: 'rejected' }} />)
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })
})

// ---------- ToolBreadcrumbs ----------

describe('ToolBreadcrumbs', () => {
  test('renders all tool names', () => {
    render(<ToolBreadcrumbs tools={['query_lots', 'compute_landed_cost', 'draft_po']} />)
    expect(screen.getByText(/query_lots/)).toBeInTheDocument()
    expect(screen.getByText(/compute_landed_cost/)).toBeInTheDocument()
    expect(screen.getByText(/draft_po/)).toBeInTheDocument()
  })

  test('renders single tool without arrow', () => {
    const { container } = render(<ToolBreadcrumbs tools={['query_lots']} />)
    expect(container.querySelectorAll('span').length).toBeGreaterThan(0)
  })

  test('renders empty list without crashing', () => {
    const { container } = render(<ToolBreadcrumbs tools={[]} />)
    expect(container).toBeInTheDocument()
  })
})

// ---------- Sparkline ----------

describe('Sparkline', () => {
  test('renders an SVG element', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4, 5]} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  test('renders a polyline', () => {
    const { container } = render(<Sparkline values={[10, 20, 15, 25]} />)
    expect(container.querySelector('polyline')).toBeInTheDocument()
  })

  test('renders a dot at the last value', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} />)
    expect(container.querySelector('circle')).toBeInTheDocument()
  })

  test('uses custom color prop', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="#ef4444" />)
    expect(container.querySelector('polyline')?.getAttribute('stroke')).toBe('#ef4444')
  })

  test('handles flat values (min === max) without crash', () => {
    const { container } = render(<Sparkline values={[5, 5, 5]} />)
    expect(container.querySelector('polyline')).toBeInTheDocument()
  })
})

// ---------- YieldCounter ----------

describe('YieldCounter', () => {
  test('renders actual yield percentage', () => {
    render(<YieldCounter actual={94.2} target={96.0} lostDollars={1240} />)
    expect(screen.getByText('94.2%')).toBeInTheDocument()
  })

  test('renders target percentage', () => {
    render(<YieldCounter actual={94.2} target={96.0} lostDollars={1240} />)
    expect(screen.getByText(/96\.0%/)).toBeInTheDocument()
  })

  test('renders lost dollars', () => {
    render(<YieldCounter actual={94.2} target={96.0} lostDollars={1240} />)
    expect(screen.getByText(/1,240/)).toBeInTheDocument()
  })

  test('shows negative variance in red when below target', () => {
    const { container } = render(<YieldCounter actual={93.0} target={96.0} lostDollars={500} />)
    const valueEl = container.querySelector('.text-red-300.text-3xl')
    expect(valueEl).toBeInTheDocument()
  })

  test('shows anomaly message when provided', () => {
    render(<YieldCounter actual={94.2} target={96.0} lostDollars={500} anomaly="Flour overuse on line 2" />)
    expect(screen.getByText('Flour overuse on line 2')).toBeInTheDocument()
  })

  test('renders View work order button when anomaly present', () => {
    render(<YieldCounter actual={94.2} target={96.0} lostDollars={500} anomaly="Something wrong" />)
    expect(screen.getByText('View work order')).toBeInTheDocument()
  })

  test('no anomaly section when anomaly is null', () => {
    render(<YieldCounter actual={95.0} target={96.0} lostDollars={200} anomaly={null} />)
    expect(screen.queryByText('View work order')).not.toBeInTheDocument()
  })
})

// ---------- StatusBadge ----------

describe('StatusBadge', () => {
  test('renders OK label for "ok" status', () => {
    render(<StatusBadge status="ok" />)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  test('renders At Risk label for "warn" status', () => {
    render(<StatusBadge status="warn" />)
    expect(screen.getByText('At Risk')).toBeInTheDocument()
  })

  test('renders Critical label for "critical" status', () => {
    render(<StatusBadge status="critical" />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  test('renders Expired label for "expired" status', () => {
    render(<StatusBadge status="expired" />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  test('falls back to OK for unknown status', () => {
    render(<StatusBadge status="unknown_status" />)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })
})

// ---------- RiskBar ----------

describe('RiskBar', () => {
  test('renders numeric value', () => {
    render(<RiskBar value={0.65} />)
    expect(screen.getByText('0.65')).toBeInTheDocument()
  })

  test('uses red for high risk (> 0.7)', () => {
    const { container } = render(<RiskBar value={0.85} />)
    expect(container.querySelector('.bg-red-500')).toBeInTheDocument()
  })

  test('uses amber for medium risk (> 0.4)', () => {
    const { container } = render(<RiskBar value={0.55} />)
    expect(container.querySelector('.bg-amber-500')).toBeInTheDocument()
  })

  test('uses green for low risk (<= 0.4)', () => {
    const { container } = render(<RiskBar value={0.2} />)
    expect(container.querySelector('.bg-emerald-500')).toBeInTheDocument()
  })

  test('bar width clamps to minimum 4px when value near 0', () => {
    const { container } = render(<RiskBar value={0.0} />)
    const bar = container.querySelector('[style]') as HTMLElement
    expect(bar?.style.width).toBe('4%')
  })
})

// ---------- SectionHeader ----------

describe('SectionHeader', () => {
  test('renders title', () => {
    render(<SectionHeader title="Inventory Overview" />)
    expect(screen.getByText('Inventory Overview')).toBeInTheDocument()
  })

  test('renders subtitle when provided', () => {
    render(<SectionHeader title="Inventory" sub="as of today" />)
    expect(screen.getByText('as of today')).toBeInTheDocument()
  })

  test('renders right slot content', () => {
    render(<SectionHeader title="Inventory" right={<button>Export</button>} />)
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  test('renders without sub or right', () => {
    const { container } = render(<SectionHeader title="Only title" />)
    expect(container).toBeInTheDocument()
  })
})

// ---------- StreamingText ----------

describe('StreamingText', () => {
  test('renders a container without crashing', () => {
    const { container } = render(<StreamingText text="Hello world" />)
    expect(container.firstChild).toBeInTheDocument()
  })

  test('shows animated cursor while streaming', () => {
    const { container } = render(<StreamingText text="Longer text to stream" />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
