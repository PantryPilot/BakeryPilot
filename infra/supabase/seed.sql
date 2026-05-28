-- BakeryPilot deterministic seed data.
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING so re-running is safe.
--
-- ============================================================================
-- New seed flow (post live-fetcher refactor)
-- ============================================================================
--
-- This file no longer covers every table. Tables whose values come from a
-- public source (geocoded coordinates, scraped contact details) are seeded
-- by Python scripts that fetch live and cache snapshots. Tables whose values
-- have no public source (engineering operations data) live in attributed
-- YAML config under infra/data/synthetic/ and are seeded by a separate
-- script. This split makes the synthetic-vs-real distinction explicit in
-- source control.
--
-- Full bootstrap order (chained by `make schema.seed`):
--   1. This file                      -- ingredients, suppliers, retailers,
--                                        skus, retailer_orders
--   2. infra/seed_toronto_facilities  -- facilities (live fetched: FGF
--                                        contact page + Nominatim geocoder,
--                                        cache snapshots in infra/data/cache/)
--   3. infra/seed_synthetic           -- production_lines, warehouse_costs,
--                                        allergen_changeovers,
--                                        production_formulas
--                                        (engineering_judgment_demo_only)
--   4. infra/seed_lots                -- ingredient_lots (Faker-generated
--                                        from a fixed seed; FK to facilities,
--                                        suppliers, ingredients)
--
-- Faker-generated rows live in infra/seed_lots.py.
-- See infra/data/synthetic/*.yaml for the four moved tables and
-- infra/data/demo_placeholders/facilities.yaml for facility operational
-- defaults that feed the live fetcher.

-- ============================================================================
-- F1.6: suppliers — one per personality (reliable / cheap_late / high_moq / disrupted / new)
-- ============================================================================

INSERT INTO suppliers (supplier_id, name, contact_email, payment_terms, contract_expiry_date, personality_tag) VALUES
  ('sup-northgrain',     'NorthGrain Mills Co.',      'orders@northgrain.example',   'net-30',       DATE '2026-09-30', 'reliable'),
  ('sup-valleydairy',    'Valley Dairy Cooperative',  'sales@valleydairy.example',   '2/10 net-30',  DATE '2026-08-15', 'cheap_late'),
  ('sup-prairiebulk',    'Prairie Bulk Sugar Ltd.',   'po@prairiebulk.example',      'net-45',       DATE '2026-12-01', 'high_moq'),
  ('sup-coastalberry',   'Coastal Berry Growers',     'fulfillment@coastal.example', 'net-30',       DATE '2026-07-20', 'disrupted'),
  ('sup-newleaf',        'New Leaf Specialty Foods',  'hello@newleaf.example',       '1/15 net-60',  DATE '2027-03-31', 'new')
ON CONFLICT (supplier_id) DO NOTHING;

-- Contact info enrichment (idempotent).
UPDATE suppliers SET contact_name = 'Karen Phelps', phone = '+1-204-555-0117',
       website = 'https://northgrain.example', address = '210 Mill Rd, Winnipeg MB R3B 1G3',
       notes = 'Primary flour supplier. Pipeline is reliable; volume tier hits at 50t.'
  WHERE supplier_id = 'sup-northgrain';
UPDATE suppliers SET contact_name = 'Marco Bellini', phone = '+1-905-555-0298',
       website = 'https://valleydairy.example', address = '47 Creek Ln, Hamilton ON L8H 5R2',
       notes = 'Cheap but historically late. Negotiate firmer delivery windows.'
  WHERE supplier_id = 'sup-valleydairy';
UPDATE suppliers SET contact_name = 'Sandra Wei', phone = '+1-306-555-0473',
       website = 'https://prairiebulk.example', address = '1100 Industrial Pkwy, Saskatoon SK S7M 0V1',
       notes = 'High MOQ; explicit MOQ-tax tracking. Renegotiate tier breakpoints.'
  WHERE supplier_id = 'sup-prairiebulk';
UPDATE suppliers SET contact_name = 'Jamal Carter', phone = '+1-604-555-0152',
       website = 'https://coastal.example', address = '88 Harbour St, Vancouver BC V6B 3K9',
       notes = 'Disrupted: ongoing weather/yield issues. Hold dual-source plan.'
  WHERE supplier_id = 'sup-coastalberry';
UPDATE suppliers SET contact_name = 'Aliya Rahman', phone = '+1-416-555-0631',
       website = 'https://newleaf.example', address = '512 Queen St W, Toronto ON M5V 2B7',
       notes = 'New onboarding. Smaller MOQ flexibility, specialty SKUs.'
  WHERE supplier_id = 'sup-newleaf';

-- Sample supplier_messages so the chat tab isn't empty (idempotent insert
-- guarded by NOT EXISTS so re-running seed doesn't duplicate).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supplier_messages WHERE supplier_id = 'sup-northgrain') THEN
    INSERT INTO supplier_messages (supplier_id, direction, channel, subject, body, author, sent_at) VALUES
      ('sup-northgrain', 'outbound', 'email', 'Confirming next bread flour PO',
        'Hi Karen — confirming 24t bread flour for week 22. Please acknowledge ETA.',
        'demo_user', now() - interval '14 days'),
      ('sup-northgrain', 'inbound', 'email', 'Re: Confirming next bread flour PO',
        'Acknowledged — truck departs Friday AM, expected dock at Toronto Tue 7am.',
        'Karen Phelps', now() - interval '13 days 22 hours'),
      ('sup-northgrain', 'inbound', 'email', 'Quarterly volume tier review',
        'Heads up: hitting 50t/quarter unlocks a 1.8% rebate. Currently at 41t.',
        'Karen Phelps', now() - interval '3 days');

    INSERT INTO supplier_messages (supplier_id, direction, channel, subject, body, author, sent_at) VALUES
      ('sup-valleydairy', 'outbound', 'email', 'Late delivery — week 19',
        'Marco, the cream truck was 11h late again. Need a written remediation plan.',
        'demo_user', now() - interval '21 days'),
      ('sup-valleydairy', 'inbound', 'email', 'Re: Late delivery — week 19',
        'Apologies — driver shortage. Offering 2% credit on next two POs.',
        'Marco Bellini', now() - interval '20 days');

    INSERT INTO supplier_messages (supplier_id, direction, channel, subject, body, author, sent_at) VALUES
      ('sup-prairiebulk', 'outbound', 'agent', 'MOQ tier renegotiation',
        'Sandra — Q1 MOQ-tax hit ~$8k due to 20-ton minimum. Proposing 12-ton tier @ matched price.',
        'ProcurementAgent', now() - interval '7 days'),
      ('sup-prairiebulk', 'inbound', 'email', 'Re: MOQ tier renegotiation',
        'Open to 15-ton tier. Can we close on contract amendment by month end?',
        'Sandra Wei', now() - interval '5 days');

    INSERT INTO supplier_messages (supplier_id, direction, channel, subject, body, author, sent_at) VALUES
      ('sup-coastalberry', 'inbound', 'email', 'Blueberry yield update',
        'Heads up — Fraser Valley yields down 14% YoY. We can hold current allocations but no upside.',
        'Jamal Carter', now() - interval '10 days'),
      ('sup-coastalberry', 'outbound', 'email', 'Dual-sourcing plan',
        'Jamal — given the yield warning we are bringing in a secondary supplier for buffer. No volume cut on your side this quarter.',
        'demo_user', now() - interval '9 days');

    INSERT INTO supplier_messages (supplier_id, direction, channel, subject, body, author, sent_at) VALUES
      ('sup-newleaf', 'outbound', 'email', 'Onboarding kickoff',
        'Welcome — first PO will be 200 kg of specialty seeds, dock window Tue/Thu mornings.',
        'demo_user', now() - interval '4 days'),
      ('sup-newleaf', 'inbound', 'email', 'Re: Onboarding kickoff',
        'Thanks! Confirming pricing sheet attached. Insurance + COI by Friday.',
        'Aliya Rahman', now() - interval '3 days 18 hours');
  END IF;
END $$;

-- ============================================================================
-- F2.3: retailers — 4 sample customers
-- ============================================================================

INSERT INTO retailers (retailer_id, name, edi_endpoint) VALUES
  ('costco',     'Costco Wholesale Canada',    'https://edi-mock.local/costco'),
  ('walmart',    'Walmart Canada',             'https://edi-mock.local/walmart'),
  ('loblaws',    'Loblaws Companies Ltd.',     'https://edi-mock.local/loblaws'),
  ('wholefoods', 'Whole Foods Market Canada',  'https://edi-mock.local/wholefoods')
ON CONFLICT (retailer_id) DO NOTHING;

-- ============================================================================
-- ingredients — USDA-informed master, 90 bakery-relevant items
--   Source CSV: infra/data/ingredients.csv (single source of truth for the values below).
-- ============================================================================

INSERT INTO ingredients (ingredient_id, name, category, default_storage_zone, shelf_life_days_default, allergen_tags, unit_of_measure) VALUES
  ('ing-flour-ap',             'All-Purpose Flour',          'flour',    'dry',          365, '{gluten}',          'kg'),
  ('ing-flour-bread',          'Bread Flour',                'flour',    'dry',          365, '{gluten}',          'kg'),
  ('ing-flour-cake',           'Cake Flour',                 'flour',    'dry',          365, '{gluten}',          'kg'),
  ('ing-flour-pastry',         'Pastry Flour',               'flour',    'dry',          365, '{gluten}',          'kg'),
  ('ing-flour-whole-wheat',    'Whole Wheat Flour',          'flour',    'dry',          180, '{gluten}',          'kg'),
  ('ing-flour-rye',            'Rye Flour',                  'flour',    'dry',          180, '{gluten}',          'kg'),
  ('ing-flour-spelt',          'Spelt Flour',                'flour',    'dry',          180, '{gluten}',          'kg'),
  ('ing-flour-almond',         'Almond Flour',               'flour',    'refrigerated', 180, '{tree_nut}',        'kg'),
  ('ing-flour-oat',            'Oat Flour',                  'flour',    'dry',          365, '{}',                'kg'),
  ('ing-flour-rice',           'Rice Flour',                 'flour',    'dry',          365, '{}',                'kg'),
  ('ing-flour-cornstarch',     'Cornstarch',                 'flour',    'dry',          730, '{}',                'kg'),
  ('ing-sugar-granulated',     'Granulated Sugar',           'sweetener','dry',         1825, '{}',                'kg'),
  ('ing-sugar-brown-light',    'Light Brown Sugar',          'sweetener','dry',          730, '{}',                'kg'),
  ('ing-sugar-brown-dark',     'Dark Brown Sugar',           'sweetener','dry',          730, '{}',                'kg'),
  ('ing-sugar-powdered',       'Powdered Sugar',             'sweetener','dry',          730, '{}',                'kg'),
  ('ing-sugar-demerara',       'Demerara Sugar',             'sweetener','dry',         1095, '{}',                'kg'),
  ('ing-honey',                'Honey',                      'sweetener','dry',         1825, '{}',                'kg'),
  ('ing-molasses',             'Molasses',                   'sweetener','dry',          365, '{}',                'kg'),
  ('ing-maple-syrup',          'Maple Syrup',                'sweetener','refrigerated', 365, '{}',                'L'),
  ('ing-corn-syrup',           'Corn Syrup',                 'sweetener','dry',          730, '{}',                'L'),
  ('ing-butter-unsalted',      'Unsalted Butter',            'dairy',    'refrigerated',  90, '{dairy}',           'kg'),
  ('ing-butter-salted',        'Salted Butter',              'dairy',    'refrigerated', 120, '{dairy}',           'kg'),
  ('ing-butter-frozen',        'Frozen Butter Blocks',       'dairy',    'frozen',       365, '{dairy}',           'kg'),
  ('ing-shortening',           'Vegetable Shortening',       'fat',      'dry',          730, '{}',                'kg'),
  ('ing-oil-vegetable',        'Vegetable Oil',              'fat',      'dry',          365, '{}',                'L'),
  ('ing-oil-coconut',          'Coconut Oil',                'fat',      'dry',          730, '{}',                'L'),
  ('ing-oil-canola',           'Canola Oil',                 'fat',      'dry',          365, '{}',                'L'),
  ('ing-margarine',            'Bakery Margarine',           'fat',      'refrigerated', 180, '{dairy}',           'kg'),
  ('ing-milk-whole',           'Whole Milk',                 'dairy',    'refrigerated',  14, '{dairy}',           'L'),
  ('ing-milk-skim',            'Skim Milk',                  'dairy',    'refrigerated',  14, '{dairy}',           'L'),
  ('ing-milk-powder',          'Skim Milk Powder',           'dairy',    'dry',          365, '{dairy}',           'kg'),
  ('ing-cream-heavy',          'Heavy Cream',                'dairy',    'refrigerated',  21, '{dairy}',           'L'),
  ('ing-buttermilk',           'Buttermilk',                 'dairy',    'refrigerated',  14, '{dairy}',           'L'),
  ('ing-sour-cream',           'Sour Cream',                 'dairy',    'refrigerated',  21, '{dairy}',           'kg'),
  ('ing-cream-cheese',         'Cream Cheese',               'dairy',    'refrigerated',  30, '{dairy}',           'kg'),
  ('ing-yogurt-plain',         'Plain Yogurt',               'dairy',    'refrigerated',  21, '{dairy}',           'kg'),
  ('ing-eggs-whole',           'Whole Eggs (liquid)',        'egg',      'refrigerated',  21, '{egg}',             'L'),
  ('ing-eggs-whites',          'Liquid Egg Whites',          'egg',      'refrigerated',  28, '{egg}',             'L'),
  ('ing-eggs-yolks',           'Liquid Egg Yolks',           'egg',      'refrigerated',  21, '{egg}',             'L'),
  ('ing-yeast-instant',        'Instant Yeast',              'leavener', 'refrigerated', 365, '{}',                'kg'),
  ('ing-yeast-active-dry',     'Active Dry Yeast',           'leavener', 'dry',          365, '{}',                'kg'),
  ('ing-yeast-fresh',          'Fresh Cake Yeast',           'leavener', 'refrigerated',  21, '{}',                'kg'),
  ('ing-baking-powder',        'Baking Powder',              'leavener', 'dry',          365, '{}',                'kg'),
  ('ing-baking-soda',          'Baking Soda',                'leavener', 'dry',         1095, '{}',                'kg'),
  ('ing-salt-kosher',          'Kosher Salt',                'seasoning','dry',         1825, '{}',                'kg'),
  ('ing-salt-sea',             'Sea Salt',                   'seasoning','dry',         1825, '{}',                'kg'),
  ('ing-vanilla-extract',      'Vanilla Extract',            'flavoring','dry',         1825, '{}',                'L'),
  ('ing-almond-extract',       'Almond Extract',             'flavoring','dry',         1825, '{tree_nut}',        'L'),
  ('ing-cinnamon-ground',      'Ground Cinnamon',            'spice',    'dry',          730, '{}',                'kg'),
  ('ing-nutmeg-ground',        'Ground Nutmeg',              'spice',    'dry',          730, '{}',                'kg'),
  ('ing-cardamom-ground',      'Ground Cardamom',            'spice',    'dry',          730, '{}',                'kg'),
  ('ing-ginger-ground',        'Ground Ginger',              'spice',    'dry',          730, '{}',                'kg'),
  ('ing-cloves-ground',        'Ground Cloves',              'spice',    'dry',          730, '{}',                'kg'),
  ('ing-blueberry-frozen',     'Frozen Blueberries',         'fruit',    'frozen',       365, '{}',                'kg'),
  ('ing-raspberry-frozen',     'Frozen Raspberries',         'fruit',    'frozen',       365, '{}',                'kg'),
  ('ing-strawberry-frozen',    'Frozen Strawberries',        'fruit',    'frozen',       365, '{}',                'kg'),
  ('ing-cherry-frozen',        'Frozen Cherries',            'fruit',    'frozen',       365, '{}',                'kg'),
  ('ing-peach-frozen',         'Frozen Peaches',             'fruit',    'frozen',       365, '{}',                'kg'),
  ('ing-apple-diced',          'Diced Apples (IQF)',         'fruit',    'frozen',       365, '{}',                'kg'),
  ('ing-cranberry-frozen',     'Frozen Cranberries',         'fruit',    'frozen',       365, '{}',                'kg'),
  ('ing-raisins',              'Raisins',                    'fruit',    'dry',          365, '{}',                'kg'),
  ('ing-currants',             'Dried Currants',             'fruit',    'dry',          365, '{}',                'kg'),
  ('ing-dates-pitted',         'Pitted Dates',               'fruit',    'dry',          365, '{}',                'kg'),
  ('ing-apricot-dried',        'Dried Apricots',             'fruit',    'dry',          365, '{}',                'kg'),
  ('ing-cranberry-dried',      'Dried Cranberries',          'fruit',    'dry',          365, '{}',                'kg'),
  ('ing-lemon-fresh',          'Fresh Lemons',               'fruit',    'refrigerated',  30, '{}',                'kg'),
  ('ing-orange-fresh',         'Fresh Oranges',              'fruit',    'refrigerated',  30, '{}',                'kg'),
  ('ing-banana-fresh',         'Fresh Bananas',              'fruit',    'refrigerated',  10, '{}',                'kg'),
  ('ing-almonds-sliced',       'Sliced Almonds',             'nut',      'dry',          365, '{tree_nut}',        'kg'),
  ('ing-almonds-whole',        'Whole Almonds',              'nut',      'dry',          365, '{tree_nut}',        'kg'),
  ('ing-walnuts-halves',       'Walnut Halves',              'nut',      'refrigerated', 180, '{tree_nut}',        'kg'),
  ('ing-pecans-halves',        'Pecan Halves',               'nut',      'refrigerated', 180, '{tree_nut}',        'kg'),
  ('ing-hazelnuts',            'Hazelnuts',                  'nut',      'refrigerated', 180, '{tree_nut}',        'kg'),
  ('ing-pistachios',           'Pistachios',                 'nut',      'refrigerated', 180, '{tree_nut}',        'kg'),
  ('ing-peanuts',              'Roasted Peanuts',            'nut',      'dry',          180, '{peanut}',          'kg'),
  ('ing-poppy-seeds',          'Poppy Seeds',                'seed',     'dry',          365, '{}',                'kg'),
  ('ing-sesame-seeds',         'Sesame Seeds',               'seed',     'dry',          365, '{sesame}',          'kg'),
  ('ing-sunflower-seeds',      'Sunflower Seeds',            'seed',     'dry',          180, '{}',                'kg'),
  ('ing-flax-seeds',           'Flax Seeds',                 'seed',     'dry',          365, '{}',                'kg'),
  ('ing-chia-seeds',           'Chia Seeds',                 'seed',     'dry',          730, '{}',                'kg'),
  ('ing-pumpkin-seeds',        'Pumpkin Seeds',              'seed',     'dry',          180, '{}',                'kg'),
  ('ing-chocolate-chips-dark', 'Dark Chocolate Chips',       'chocolate','dry',          365, '{}',                'kg'),
  ('ing-chocolate-chips-milk', 'Milk Chocolate Chips',       'chocolate','dry',          365, '{dairy}',           'kg'),
  ('ing-chocolate-chips-white','White Chocolate Chips',      'chocolate','dry',          365, '{dairy}',           'kg'),
  ('ing-cocoa-powder',         'Cocoa Powder',               'chocolate','dry',          730, '{}',                'kg'),
  ('ing-chocolate-bar-dark',   'Dark Chocolate Bar 70%',     'chocolate','dry',          365, '{}',                'kg'),
  ('ing-oats-rolled',          'Rolled Oats',                'grain',    'dry',          730, '{}',                'kg'),
  ('ing-oats-quick',           'Quick Oats',                 'grain',    'dry',          730, '{}',                'kg'),
  ('ing-oats-steel-cut',       'Steel-Cut Oats',             'grain',    'dry',          730, '{}',                'kg'),
  ('ing-cornmeal',             'Cornmeal',                   'grain',    'dry',          365, '{}',                'kg'),
  ('ing-bran-wheat',           'Wheat Bran',                 'grain',    'dry',          180, '{gluten}',          'kg'),
  ('ing-gelatin-powder',       'Gelatin Powder',             'additive', 'dry',         1095, '{}',                'kg')
ON CONFLICT (ingredient_id) DO NOTHING;

-- ============================================================================
-- skus — 12 real FGF Brands SKUs across six labels (ACE Bakery, Stonefire,
--   Wonder, D'Italiano, Country Harvest, Casa Mendosa). Margins, allergens,
--   and shelf life calibrated against each brand's published product line.
--   Source-of-truth seed for the same data is infra/seed_toronto_skus.py.
-- ============================================================================

INSERT INTO skus (sku_id, name, category, margin_per_unit, allergen_tags, shelf_life_days) VALUES
  ('sku-ace-baguette-classic',          'ACE White Baguette',                  'bread',     1.65, '{gluten}',         4),
  ('sku-ace-rustic-italian-oval',       'ACE Rustic Italian Oval Loaf',        'bread',     1.85, '{gluten}',         5),
  ('sku-ace-rosemary-focaccia',         'ACE Rosemary Focaccia',               'bread',     2.10, '{gluten}',         4),
  ('sku-ace-ciabatta-piccolo-6pk',      'ACE Ciabatta Piccolo 6-pack',         'bread',     1.55, '{gluten}',         5),
  ('sku-ace-sourdough-bistro',          'ACE Sourdough Bistro Loaf',           'bread',     1.95, '{gluten}',         6),
  ('sku-stonefire-original-naan-2pk',   'Stonefire Original Naan 2-pack',      'flatbread', 1.40, '{gluten,dairy}',   7),
  ('sku-stonefire-mini-naan-8pk',       'Stonefire Mini Naan 8-pack',          'flatbread', 1.60, '{gluten,dairy}',   7),
  ('sku-stonefire-naan-dippers-original','Stonefire Naan Dippers Original',    'flatbread', 1.30, '{gluten,dairy}',  14),
  ('sku-stonefire-pizza-crust-2pk',     'Stonefire Artisan Pizza Crust 2-pack','flatbread', 1.75, '{gluten}',        14),
  ('sku-wonder-classic-white-loaf',     'Wonder Classic White Bread',          'bread',     0.85, '{gluten}',         7),
  ('sku-d-italiano-hot-dog-buns-8pk',   'D''Italiano Hot Dog Buns 8-pack',     'bread',     1.05, '{gluten}',         7),
  ('sku-country-harvest-12-grain-loaf', 'Country Harvest 12 Grain Bread',      'bread',     1.25, '{gluten}',         7)
ON CONFLICT (sku_id) DO NOTHING;

-- ============================================================================
-- retailer_orders — 10 sample firm POs covering the full fulfilment lifecycle
-- (F2.3 + demo-data audit). Mix of statuses: 6 open, 1 scheduled, 2 shipped,
-- 1 cancelled. Dates are relative to seed time so the demo timeline always
-- looks fresh. Guarded so re-running seed.sql doesn't create duplicate orders.
-- ============================================================================

DO $$
BEGIN
  IF (SELECT count(*) FROM retailer_orders) = 0 THEN
    INSERT INTO retailer_orders (retailer_id, sku_id, quantity_units, requested_delivery_date, status) VALUES
      ('costco',     'sku-ace-baguette-classic',           12000, CURRENT_DATE + 3,  'open'),
      ('costco',     'sku-wonder-classic-white-loaf',       8000, CURRENT_DATE + 4,  'open'),
      ('walmart',    'sku-country-harvest-12-grain-loaf',   6000, CURRENT_DATE + 2,  'scheduled'),
      ('walmart',    'sku-d-italiano-hot-dog-buns-8pk',     9000, CURRENT_DATE + 5,  'open'),
      ('loblaws',    'sku-stonefire-original-naan-2pk',     4500, CURRENT_DATE + 4,  'open'),
      ('loblaws',    'sku-ace-sourdough-bistro',            3200, CURRENT_DATE + 7,  'shipped'),
      ('wholefoods', 'sku-ace-rosemary-focaccia',           2400, CURRENT_DATE + 3,  'open'),
      ('wholefoods', 'sku-stonefire-pizza-crust-2pk',       3600, CURRENT_DATE + 5,  'open'),
      ('costco',     'sku-ace-baguette-classic',            9000, CURRENT_DATE - 1,  'shipped'),
      ('walmart',    'sku-stonefire-mini-naan-8pk',         5400, CURRENT_DATE - 2,  'cancelled');
  END IF;
END $$;

-- ============================================================================
-- F3.1: supplier MOQ / window / performance fields
-- ============================================================================

UPDATE suppliers SET
  moq_kg = 1000, lead_time_mean_days = 1.5, lead_time_std_days = 0.4,
  window_earliest_day = 2, window_latest_day = 5,
  on_time_rate = 0.96, fill_rate = 0.99, window_compliance_rate = 0.92,
  price_variance_vs_benchmark = 0.02
WHERE supplier_id = 'sup-northgrain';

UPDATE suppliers SET
  moq_kg = 500, lead_time_mean_days = 2.3, lead_time_std_days = 1.1,
  window_earliest_day = 3, window_latest_day = 3,
  on_time_rate = 0.78, fill_rate = 0.95, window_compliance_rate = 0.55,
  price_variance_vs_benchmark = -0.08
WHERE supplier_id = 'sup-valleydairy';

UPDATE suppliers SET
  moq_kg = 2500, lead_time_mean_days = 1.8, lead_time_std_days = 0.6,
  window_earliest_day = 1, window_latest_day = 5,
  on_time_rate = 0.90, fill_rate = 0.98, window_compliance_rate = 0.86,
  price_variance_vs_benchmark = -0.04
WHERE supplier_id = 'sup-prairiebulk';

UPDATE suppliers SET
  moq_kg = 300, lead_time_mean_days = 2.0, lead_time_std_days = 0.5,
  window_earliest_day = 2, window_latest_day = 4,
  on_time_rate = 0.84, fill_rate = 0.91, window_compliance_rate = 0.74,
  price_variance_vs_benchmark = 0.12
WHERE supplier_id = 'sup-coastalberry';

UPDATE suppliers SET
  moq_kg = 400, lead_time_mean_days = 2.5, lead_time_std_days = 0.8,
  window_earliest_day = 3, window_latest_day = 5,
  on_time_rate = 0.88, fill_rate = 0.93, window_compliance_rate = 0.80,
  price_variance_vs_benchmark = -0.05
WHERE supplier_id = 'sup-newleaf';

-- ============================================================================
-- NF.R.7: stakeholders — 15 sample contacts across all action kinds
-- ============================================================================

INSERT INTO stakeholders (stakeholder_id, name, email, role, organization, tags) VALUES
  ('sh-plant-mgr-toronto',  'Priya Nair',         'priya.nair@fgf.example',         'Plant Manager',        'FGF Toronto',      '{production_changes,yield_alerts,weekly_summary}'),
  ('sh-plant-mgr-hamiltn',  'Marco DeSouza',      'marco.desouza@fgf.example',      'Plant Manager',        'FGF Hamilton',     '{production_changes,yield_alerts}'),
  ('sh-plant-mgr-missis',   'Anika Patel',        'anika.patel@fgf.example',        'Plant Manager',        'FGF Mississauga',  '{production_changes,yield_alerts}'),
  ('sh-plant-mgr-montrl',   'Jean-Luc Tremblay',  'jl.tremblay@fgf.example',        'Plant Manager',        'FGF Montreal',     '{production_changes,yield_alerts}'),
  ('sh-procurement-lead',   'Sarah Kim',          'sarah.kim@fgf.example',          'Procurement Lead',     'FGF Corp',         '{supplier_negotiation,contract_lifecycle,weekly_summary}'),
  ('sh-esg-officer',        'David Osei',         'david.osei@fgf.example',         'ESG Officer',          'FGF Corp',         '{weekly_summary,esg_reporting}'),
  ('sh-supply-chain-vp',    'Lisa Zhang',         'lisa.zhang@fgf.example',         'VP Supply Chain',      'FGF Corp',         '{weekly_summary,supplier_negotiation,contract_lifecycle}'),
  ('sh-costco-buyer',       'Tom Whitmore',       'tom.whitmore@costco.example',    'Category Buyer',       'Costco Canada',    '{retailer_negotiation}'),
  ('sh-walmart-buyer',      'Rachel Green',       'rachel.green@walmart.example',   'Replenishment Mgr',    'Walmart Canada',   '{retailer_negotiation}'),
  ('sh-loblaws-buyer',      'Yusuf Abdi',         'yusuf.abdi@loblaws.example',     'Procurement Analyst',  'Loblaws',          '{retailer_negotiation}'),
  ('sh-sup-northgrain',     'James Harrington',   'j.harrington@northgrain.example','Account Manager',      'NorthGrain Mills', '{supplier_negotiation,contract_lifecycle}'),
  ('sh-sup-valleydairy',    'Claire Fontaine',    'claire@valleydairy.example',     'Sales Director',       'Valley Dairy',     '{supplier_negotiation,contract_lifecycle}'),
  ('sh-sup-prairiebulk',    'Ryan Olsson',        'r.olsson@prairiebulk.example',   'Key Account Mgr',      'Prairie Bulk',     '{supplier_negotiation}'),
  ('sh-operations-analyst', 'Omar Khalid',        'omar.khalid@fgf.example',        'Operations Analyst',   'FGF Corp',         '{yield_alerts,production_changes,weekly_summary}'),
  ('sh-finance-controller', 'Nina Johansson',     'nina.j@fgf.example',             'Finance Controller',   'FGF Corp',         '{weekly_summary,moq_tax}')
ON CONFLICT (stakeholder_id) DO NOTHING;

-- ============================================================================
-- disruption_signals — 5 seeded recent signals for demo
-- ============================================================================

DO $$
BEGIN
  IF (SELECT count(*) FROM disruption_signals) = 0 THEN
    INSERT INTO disruption_signals (supplier_id, ingredient_id, kind, severity, source, message, observed_at) VALUES
      ('sup-coastalberry', 'ing-blueberry-frozen', 'weather',   0.72, 'weather',   'Early frost in BC blueberry region may reduce next harvest by 15-20%',                    NOW() - INTERVAL '2 hours'),
      ('sup-valleydairy',  NULL,                   'miss',      0.61, 'erp',       'Valley Dairy missed 3 of last 5 delivery windows; on-time rate dropped to 68% this month', NOW() - INTERVAL '6 hours'),
      ('sup-prairiebulk',  'ing-flour-bread',      'commodity', 0.45, 'commodity', 'CBOT wheat futures up 8.2% this week on Saskatchewan drought concerns',                    NOW() - INTERVAL '1 day'),
      (NULL,               'ing-sugar-granulated', 'commodity', 0.38, 'commodity', 'ICE sugar No. 11 up 4.1% on Brazil supply concerns',                                       NOW() - INTERVAL '2 days'),
      ('sup-northgrain',   NULL,                   'news',      0.25, 'news',      'NorthGrain Mills announces capacity expansion in Q3; delivery reliability expected to improve', NOW() - INTERVAL '3 days');
  END IF;
END $$;

-- ============================================================================
-- demand_forecasts — 14-day horizon for ALL 12 branded SKUs.
-- Demo-data audit: every SKU must have a forecast so the Retailers `po_ratio`
-- heuristic, FlowSight outbound loop, and Scorecard forecast-actuals chart all
-- have complete coverage (no half-empty rows).
-- ============================================================================

DO $$
BEGIN
  IF (SELECT count(*) FROM demand_forecasts) = 0 THEN
    INSERT INTO demand_forecasts (sku_id, forecast_date, quantity_expected, quantity_low, quantity_high, model_version)
    SELECT
      sku_id,
      CURRENT_DATE + gs.day_offset AS forecast_date,
      base_qty + (random() * base_qty * 0.1)::int AS quantity_expected,
      (base_qty * 0.85)::int AS quantity_low,
      (base_qty * 1.15)::int AS quantity_high,
      'lgbm-v0.1' AS model_version
    FROM (
      VALUES
        ('sku-wonder-classic-white-loaf',       850),
        ('sku-ace-baguette-classic',            720),
        ('sku-country-harvest-12-grain-loaf',   610),
        ('sku-ace-ciabatta-piccolo-6pk',        940),
        ('sku-d-italiano-hot-dog-buns-8pk',     480),
        ('sku-stonefire-pizza-crust-2pk',       390),
        ('sku-ace-sourdough-bistro',            410),
        ('sku-ace-rustic-italian-oval',         360),
        ('sku-ace-rosemary-focaccia',           250),
        ('sku-stonefire-original-naan-2pk',     530),
        ('sku-stonefire-mini-naan-8pk',         470),
        ('sku-stonefire-naan-dippers-original', 310)
    ) AS skus(sku_id, base_qty)
    CROSS JOIN generate_series(0, 13) AS gs(day_offset);
  END IF;
END $$;

-- ============================================================================
-- Production module seed data — finished_goods_pallets + production_orders
-- Guards: only inserts when tables exist and rows = 0 (idempotent).
-- ============================================================================

-- ============================================================================
-- The production_orders + finished_goods_pallets blocks below reference
-- facilities (plant-toronto, plant-hamilton, ...). On first-boot auto-init,
-- facilities is empty (it's populated by infra/seed_toronto_facilities.py),
-- so we gate everything on facilities being present. `make schema.seed`
-- re-runs this file AFTER the facilities seeder, at which point the
-- inserts succeed.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM facilities LIMIT 1) THEN
    RAISE NOTICE 'facilities not yet seeded — skipping production_orders + finished_goods_pallets demo blocks (will populate on next make schema.seed pass).';
    RETURN;
  END IF;

  -- finished_goods_pallets: starting inventory for common SKUs across 2 plants
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'finished_goods_pallets')
     AND (SELECT count(*) FROM finished_goods_pallets) = 0 THEN

    INSERT INTO finished_goods_pallets (sku_id, facility_id, produced_at, shelf_life_days, quantity, status)
    VALUES
      ('sku-ace-baguette-classic',          'plant-toronto',     NOW() - INTERVAL '1 day',  4,  480, 'in_warehouse'),
      ('sku-ace-sourdough-bistro',          'plant-toronto',     NOW() - INTERVAL '2 days', 6,  320, 'in_warehouse'),
      ('sku-wonder-classic-white-loaf',     'plant-toronto',     NOW() - INTERVAL '1 day',  7,  800, 'in_warehouse'),
      ('sku-d-italiano-hot-dog-buns-8pk',   'plant-toronto',     NOW() - INTERVAL '3 days', 7,  560, 'in_warehouse'),
      ('sku-ace-ciabatta-piccolo-6pk',      'plant-mississauga', NOW() - INTERVAL '1 day',  5,  400, 'in_warehouse'),
      ('sku-country-harvest-12-grain-loaf', 'plant-mississauga', NOW() - INTERVAL '2 days', 7,  600, 'in_warehouse'),
      ('sku-stonefire-original-naan-2pk',   'plant-mississauga', NOW() - INTERVAL '4 days', 7,  240, 'in_warehouse'),
      ('sku-ace-rosemary-focaccia',         'plant-hamilton',    NOW() - INTERVAL '1 day',  4,  190, 'in_warehouse'),
      ('sku-stonefire-mini-naan-8pk',       'plant-montreal',    NOW() - INTERVAL '2 days', 7,  300, 'in_warehouse');
  END IF;

  -- production_orders: 8 sample orders covering every status enum value plus
  -- a deliberate insufficient-inventory QA case. The mapping of orders to
  -- lines + production_lines.status updates after the inserts give the
  -- Production page a balanced "producing / paused / setup / idle /
  -- maintenance" mix without duplicates on a single line.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'production_orders')
     AND (SELECT count(*) FROM production_orders) = 0 THEN

    -- PO-1 producing: Toronto Line 1, Wonder loaf, started 90m ago
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, actual_start_at, notes)
    VALUES
      ('plant-toronto', 'line-toronto-1', 'sku-wonder-classic-white-loaf', 800,
       'producing',
       NOW() - INTERVAL '90 minutes',
       'Afternoon Wonder Classic run');

    -- PO-2 produced (historical): Toronto Line 3, ACE Baguette, completed 2h ago
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, actual_start_at, completed_at, notes)
    VALUES
      ('plant-toronto', 'line-toronto-3', 'sku-ace-baguette-classic', 500,
       'produced',
       NOW() - INTERVAL '5 hours',
       NOW() - INTERVAL '2 hours',
       'Morning Baguette run — produced 500 units');

    -- PO-3 paused: Toronto Line 2, Stonefire Mini Naan, blocked by zero
    -- Toronto-side yogurt inventory (Valley Dairy PO #2 currently 2 days late).
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, actual_start_at, notes)
    VALUES
      ('plant-toronto', 'line-toronto-2', 'sku-stonefire-mini-naan-8pk', 600,
       'paused',
       NOW() - INTERVAL '45 minutes',
       'Paused — awaiting Valley Dairy yogurt delivery (PO-VD-2026-0308 currently 2 days late)');

    -- PO-4 planned: Mississauga Line 2, Country Harvest, starts in 2h
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, planned_start_at, notes)
    VALUES
      ('plant-mississauga', 'line-mississauga-2', 'sku-country-harvest-12-grain-loaf', 600,
       'planned',
       NOW() + INTERVAL '2 hours',
       'Evening 12-Grain run');

    -- PO-5 planned: Mississauga Line 1, D'Italiano Hot Dog Buns, tomorrow morning
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, planned_start_at, notes)
    VALUES
      ('plant-mississauga', 'line-mississauga-1', 'sku-d-italiano-hot-dog-buns-8pk', 1200,
       'planned',
       NOW() + INTERVAL '20 hours',
       'Tomorrow morning bun run');

    -- PO-6 cancelled: Hamilton Line 2 — Pizza crust cancelled (allergen conflict)
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, planned_start_at, notes)
    VALUES
      ('plant-hamilton', 'line-hamilton-2', 'sku-stonefire-pizza-crust-2pk', 400,
       'cancelled',
       NOW() - INTERVAL '24 hours',
       'Cancelled — allergen-changeover conflict on planned slot');

    -- PO-7 planned: Montreal Line 1, ACE Rosemary Focaccia, late evening
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, planned_start_at, notes)
    VALUES
      ('plant-montreal', 'line-montreal-1', 'sku-ace-rosemary-focaccia', 300,
       'planned',
       NOW() + INTERVAL '6 hours',
       'Late-evening Focaccia run');

    -- PO-8 QA scenario: Montreal Line 2, oversized Mini Naan order designed to
    -- fail the /api/production/orders/{id}/produce endpoint with HTTP 422 due
    -- to insufficient Montreal-side ingredient inventory. Demonstrates the
    -- shortfall path end-to-end.
    INSERT INTO production_orders
      (facility_id, line_id, sku_id, quantity_units, status, planned_start_at, notes)
    VALUES
      ('plant-montreal', 'line-montreal-2', 'sku-stonefire-mini-naan-8pk', 5000,
       'planned',
       NOW() + INTERVAL '12 hours',
       'QA case — designed to fail inventory validation on Mark Produced');

    -- Align production_lines.status with the orders above so the Production
    -- page shows one of every interesting state.
    UPDATE production_lines SET status = 'producing'    WHERE line_id = 'line-toronto-1';
    UPDATE production_lines SET status = 'paused'       WHERE line_id = 'line-toronto-2';
    UPDATE production_lines SET status = 'idle'         WHERE line_id = 'line-toronto-3';
    UPDATE production_lines SET status = 'setup'        WHERE line_id = 'line-mississauga-1';
    UPDATE production_lines SET status = 'setup'        WHERE line_id = 'line-mississauga-2';
    UPDATE production_lines SET status = 'idle'         WHERE line_id = 'line-hamilton-1';
    UPDATE production_lines SET status = 'maintenance'  WHERE line_id = 'line-hamilton-2';
    UPDATE production_lines SET status = 'setup'        WHERE line_id = 'line-montreal-1';
    UPDATE production_lines SET status = 'idle'         WHERE line_id = 'line-montreal-2';

    -- Wire current_order_id for the in-flight + queued orders (skip cancelled,
    -- produced, idle, maintenance — those lines have no active assignment).
    UPDATE production_lines pl
      SET current_order_id = po.order_id
      FROM production_orders po
      WHERE po.line_id = pl.line_id
        AND po.status IN ('producing','paused','planned')
        AND po.line_id IN (
          'line-toronto-1','line-toronto-2',
          'line-mississauga-1','line-mississauga-2',
          'line-montreal-1'
        );
  END IF;

  -- production_schedules: minimal rows for Schedule page + copilot optimizer.
  -- Requires production_lines (from seed_synthetic / make schema.seed). CD re-applies
  -- seed.sql but not seed_demo.py, so this keeps the walking skeleton green on deploy.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'production_schedules')
     AND (SELECT count(*) FROM production_lines) > 0
     AND (SELECT count(*) FROM production_schedules) = 0 THEN

    INSERT INTO production_schedules
      (schedule_id, facility_id, line_id, sku_id, start_at, end_at, quantity_units, status, waste_avoided_kg, version)
    VALUES
      ('bbbb0001-0000-4000-8000-000000000001'::uuid, 'plant-toronto', 'line-toronto-1', 'sku-wonder-classic-white-loaf',
       NOW() + INTERVAL '2 hours', NOW() + INTERVAL '6 hours', 1400, 'approved', 0, 1),
      ('bbbb0001-0000-4000-8000-000000000002'::uuid, 'plant-toronto', 'line-toronto-2', 'sku-stonefire-original-naan-2pk',
       NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 4 hours', 800, 'suggested', 12.0, 1)
    ON CONFLICT (schedule_id) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- app_users + user_settings — single-user demo (no auth in hackathon build)
-- Tables defined in schema.sql; safe to skip if they don't yet exist.
-- ============================================================================

DO $$
DECLARE
  default_fac text;
BEGIN
  -- Pick whichever real facility is present so the FK resolves; on first
  -- auto-init facilities is empty, so we omit the default_facility_id and
  -- let the Python seeders / a later schema.seed pass fill it in.
  SELECT facility_id INTO default_fac
  FROM facilities
  WHERE facility_id = 'plant-toronto'
  LIMIT 1;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users') THEN
    INSERT INTO app_users (user_id, display_name, role, email, default_facility_id)
    VALUES ('demo_user', 'Alex Chen', 'Ops Manager', 'alex.chen@fgfbrands.com', default_fac)
    ON CONFLICT (user_id) DO NOTHING;

    -- Top up default_facility_id on a later seed pass if it wasn't set the
    -- first time around.
    IF default_fac IS NOT NULL THEN
      UPDATE app_users
        SET default_facility_id = default_fac
        WHERE user_id = 'demo_user'
          AND default_facility_id IS NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_settings') THEN
    INSERT INTO user_settings (user_id) VALUES ('demo_user')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
    INSERT INTO app_settings (key, value) VALUES ('copilot_model', 'claude-sonnet-4-6')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
