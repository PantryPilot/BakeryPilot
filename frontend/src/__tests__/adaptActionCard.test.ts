import { adaptActionCard, type BackendActionCard } from '../lib/api'

function makeBackendCard(overrides: Partial<BackendActionCard>): BackendActionCard {
  return {
    card_id: '00000000-0000-0000-0000-000000000aaa',
    kind: 'outbound_shipment',
    state: 'pending',
    payload: {},
    created_at: '2026-05-28T01:00:00Z',
    decided_at: null,
    decided_by: null,
    ...overrides,
  } as BackendActionCard
}

// ---------------------------------------------------------------------------
// outbound_shipment — confirm-card adapter
// ---------------------------------------------------------------------------
// Regression coverage for: agent drafts outbound shipment → UI must render a
// confirm card with friendly names (SKU, retailer, warehouse), units, ship
// window, delivery date, and the rationale shown as an amber flag. Mirrors
// the polish of the production schedule_change card.

describe('adaptActionCard — outbound_shipment', () => {
  test('uses enriched payload (sku_name, retailer_name, facility_name)', () => {
    const card = adaptActionCard(
      makeBackendCard({
        kind: 'outbound_shipment',
        payload: {
          facility_id: 'plant-toronto',
          facility_name: 'Plant Toronto',
          retailer_order_id: '2dd7fe99-1111-2222-3333-444455556666',
          retailer_name: 'Costco',
          sku_id: 'sku-ace-baguette-classic',
          sku_name: 'ACE White Baguette',
          start_at: '2026-05-29T12:00:00Z',
          end_at: '2026-05-29T16:00:00Z',
          quantity_units: 656,
          requested_delivery_date: '2026-05-28',
          rationale: 'FEFO partial fulfillment, 656 of 12,000 ordered',
          title: 'Ship 656 × ACE White Baguette → Costco',
          agent: 'SchedulerAgent',
        },
      })
    )

    expect(card.kind).toBe('Outbound Shipment')
    expect(card.agent).toBe('SchedulerAgent')
    expect(card.title).toBe('Ship 656 × ACE White Baguette → Costco')
    expect(card.icon).toBe('truck')
    expect(card.state).toBe('pending')
    expect(card.cardId).toBe('00000000-0000-0000-0000-000000000aaa')

    // Summary uses ship-window, units, delivery date.
    const summaryByLabel = Object.fromEntries(card.summary.map((s) => [s.label, s.value]))
    expect(summaryByLabel['Units']).toBe('656')
    expect(summaryByLabel['Delivery due']).toBe('2026-05-28')
    expect(summaryByLabel['Ship window']).toMatch(/May 29.*UTC/)

    // Details surface enriched names.
    const detailsByLabel = Object.fromEntries(
      (card.details ?? []).map((d) => [d.label, d.value])
    )
    expect(detailsByLabel['SKU']).toBe('ACE White Baguette')
    expect(detailsByLabel['Retailer']).toBe('Costco')
    expect(detailsByLabel['Warehouse']).toBe('Plant Toronto')
    expect(detailsByLabel['Retailer PO']).toBe('2dd7fe99…')

    // Rationale is shown as an amber flag — matches schedule_change polish.
    expect(card.flags).toHaveLength(1)
    expect(card.flags?.[0].text).toContain('FEFO partial fulfillment')
    expect(card.flags?.[0].tone).toBe('amber')
  })

  test('falls back to ids when names are absent', () => {
    const card = adaptActionCard(
      makeBackendCard({
        kind: 'outbound_shipment',
        payload: {
          facility_id: 'plant-toronto',
          retailer_order_id: 'abcdef12-3456-7890-aaaa-bbbbbbbbbbbb',
          sku_id: 'sku-wonder-classic-white-loaf',
          start_at: '2026-05-29T08:00:00Z',
          end_at: '2026-05-29T10:00:00Z',
          quantity_units: 200,
        },
      })
    )

    expect(card.title).toContain('Ship 200')
    // shortSku lowercases the id and strips the sku- prefix.
    expect(card.title).toContain('wonder classic white loaf')
    expect(card.title).toContain('PO abcdef12')

    const detailsByLabel = Object.fromEntries(
      (card.details ?? []).map((d) => [d.label, d.value])
    )
    expect(detailsByLabel['Warehouse']).toBe('plant-toronto')
    expect(detailsByLabel['Retailer']).toBe('PO abcdef12')

    // No rationale → no flags.
    expect(card.flags).toBeUndefined()
  })

  test('renders "—" when units / delivery date are missing', () => {
    const card = adaptActionCard(
      makeBackendCard({
        kind: 'outbound_shipment',
        payload: {
          facility_id: 'plant-toronto',
          retailer_order_id: 'a',
          sku_id: 'sku-x',
          start_at: '2026-05-29T08:00:00Z',
          end_at: '2026-05-29T10:00:00Z',
        },
      })
    )
    const summaryByLabel = Object.fromEntries(card.summary.map((s) => [s.label, s.value]))
    expect(summaryByLabel['Units']).toBe('—')
    expect(summaryByLabel['Delivery due']).toBe('—')
  })

  test('preserves the action_card state so the UI can lock the confirm button', () => {
    const card = adaptActionCard(
      makeBackendCard({
        kind: 'outbound_shipment',
        state: 'confirmed',
        payload: {
          facility_id: 'plant-toronto',
          retailer_order_id: 'a',
          sku_id: 'sku-x',
          start_at: '2026-05-29T08:00:00Z',
          end_at: '2026-05-29T10:00:00Z',
          quantity_units: 50,
        },
      })
    )
    expect(card.state).toBe('confirmed')
  })
})
