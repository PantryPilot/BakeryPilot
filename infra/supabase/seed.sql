-- BakeryPilot deterministic seed data.
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING so re-running is safe.
-- Faker-generated rows (ingredient_lots, etc.) live in infra/seed_lots.py.

-- ============================================================================
-- F1.6: facilities — 4 FGF Brands Canadian plants
-- ============================================================================

INSERT INTO facilities (facility_id, name, city, province, timezone, cold_capacity_kg, dry_capacity_kg) VALUES
  ('plant-toronto',     'FGF Toronto (Etobicoke)', 'Etobicoke',   'ON', 'America/Toronto',  120000, 250000),
  ('plant-mississauga', 'FGF Mississauga',         'Mississauga', 'ON', 'America/Toronto',   90000, 200000),
  ('plant-hamilton',    'FGF Hamilton',            'Hamilton',    'ON', 'America/Toronto',   80000, 180000),
  ('plant-montreal',    'FGF Montreal',            'Montreal',    'QC', 'America/Montreal',  70000, 160000)
ON CONFLICT (facility_id) DO NOTHING;

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

-- ============================================================================
-- F1.6: warehouse_costs — 4 facilities x 3 storage types = 12 rows
--   Values in $CAD per kg per day, calibrated against industry norms for cold/dry storage.
-- ============================================================================

INSERT INTO warehouse_costs (facility_id, storage_type, cost_per_kg_per_day, capacity_kg) VALUES
  ('plant-toronto',     'frozen',       0.0120, 120000),
  ('plant-toronto',     'refrigerated', 0.0080,  60000),
  ('plant-toronto',     'dry',          0.0025, 250000),
  ('plant-mississauga', 'frozen',       0.0115,  90000),
  ('plant-mississauga', 'refrigerated', 0.0078,  50000),
  ('plant-mississauga', 'dry',          0.0024, 200000),
  ('plant-hamilton',    'frozen',       0.0118,  80000),
  ('plant-hamilton',    'refrigerated', 0.0079,  45000),
  ('plant-hamilton',    'dry',          0.0026, 180000),
  ('plant-montreal',    'frozen',       0.0125,  70000),
  ('plant-montreal',    'refrigerated', 0.0082,  40000),
  ('plant-montreal',    'dry',          0.0027, 160000)
ON CONFLICT (facility_id, storage_type) DO NOTHING;

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
-- F2.6: allergen_changeovers — minutes lost per transition between allergen classes
--   Self-transitions are 0; transitions involving major allergens incur deep-clean time.
-- ============================================================================

INSERT INTO allergen_changeovers (from_allergen, to_allergen, changeover_minutes) VALUES
  ('none',     'none',     0),
  ('gluten',   'gluten',   0),
  ('dairy',    'dairy',    0),
  ('egg',      'egg',      0),
  ('tree_nut', 'tree_nut', 0),
  ('peanut',   'peanut',   0),
  ('sesame',   'sesame',   0),
  ('none',     'gluten',   15),
  ('none',     'dairy',    15),
  ('none',     'egg',      15),
  ('none',     'tree_nut', 60),
  ('none',     'peanut',   90),
  ('none',     'sesame',   45),
  ('gluten',   'none',     45),
  ('dairy',    'none',     30),
  ('egg',      'none',     30),
  ('tree_nut', 'none',     120),
  ('peanut',   'none',     180),
  ('sesame',   'none',     60),
  ('gluten',   'dairy',    30),
  ('dairy',    'gluten',   30),
  ('tree_nut', 'peanut',   60),
  ('peanut',   'tree_nut', 60),
  ('gluten',   'tree_nut', 90),
  ('tree_nut', 'gluten',   120),
  ('peanut',   'gluten',   180),
  ('gluten',   'peanut',   90)
ON CONFLICT (from_allergen, to_allergen) DO NOTHING;

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
-- skus — 12 finished bakery products with realistic margins
-- ============================================================================

INSERT INTO skus (sku_id, name, category, margin_per_unit, allergen_tags, shelf_life_days) VALUES
  ('sku-blueberry-muffin-4pk',  'Blueberry Muffin 4-pack',         'muffin',    1.20, '{gluten,dairy,egg}',         5),
  ('sku-lemon-poppy-muffin-4pk','Lemon Poppy Seed Muffin 4-pack',  'muffin',    1.15, '{gluten,dairy,egg}',         5),
  ('sku-choc-chip-muffin-4pk',  'Chocolate Chip Muffin 4-pack',    'muffin',    1.25, '{gluten,dairy,egg}',         5),
  ('sku-banana-bread-loaf',     'Banana Bread Loaf',               'bread',     1.80, '{gluten,dairy,egg}',         7),
  ('sku-cinnamon-roll-6pk',     'Cinnamon Roll 6-pack',            'pastry',    2.10, '{gluten,dairy,egg}',         5),
  ('sku-croissant-butter-4pk',  'Butter Croissant 4-pack',         'pastry',    2.40, '{gluten,dairy,egg}',         3),
  ('sku-bagel-plain-6pk',       'Plain Bagel 6-pack',              'bread',     0.95, '{gluten}',                   7),
  ('sku-bagel-sesame-6pk',      'Sesame Bagel 6-pack',             'bread',     1.05, '{gluten,sesame}',            7),
  ('sku-sourdough-loaf',        'Sourdough Bread Loaf',            'bread',     1.65, '{gluten}',                   7),
  ('sku-choc-chip-cookie-12pk', 'Chocolate Chip Cookie 12-pack',   'cookie',    1.40, '{gluten,dairy,egg}',         14),
  ('sku-oatmeal-cookie-12pk',   'Oatmeal Raisin Cookie 12-pack',   'cookie',    1.35, '{gluten,dairy,egg}',         14),
  ('sku-almond-danish-4pk',     'Almond Danish 4-pack',            'pastry',    2.25, '{gluten,dairy,egg,tree_nut}', 4)
ON CONFLICT (sku_id) DO NOTHING;

-- ============================================================================
-- production_formulas — bill of materials per SKU (3-6 ingredients each, F2.1)
-- ============================================================================

INSERT INTO production_formulas (sku_id, ingredient_id, kg_per_unit) VALUES
  -- Blueberry Muffin 4-pack (per pack of 4)
  ('sku-blueberry-muffin-4pk',  'ing-flour-ap',             0.180),
  ('sku-blueberry-muffin-4pk',  'ing-sugar-granulated',     0.090),
  ('sku-blueberry-muffin-4pk',  'ing-butter-unsalted',      0.060),
  ('sku-blueberry-muffin-4pk',  'ing-eggs-whole',           0.045),
  ('sku-blueberry-muffin-4pk',  'ing-blueberry-frozen',     0.070),
  ('sku-blueberry-muffin-4pk',  'ing-baking-powder',        0.005),

  -- Lemon Poppy Seed Muffin 4-pack
  ('sku-lemon-poppy-muffin-4pk','ing-flour-ap',             0.180),
  ('sku-lemon-poppy-muffin-4pk','ing-sugar-granulated',     0.090),
  ('sku-lemon-poppy-muffin-4pk','ing-butter-unsalted',      0.060),
  ('sku-lemon-poppy-muffin-4pk','ing-eggs-whole',           0.045),
  ('sku-lemon-poppy-muffin-4pk','ing-lemon-fresh',          0.030),
  ('sku-lemon-poppy-muffin-4pk','ing-poppy-seeds',          0.008),

  -- Chocolate Chip Muffin 4-pack
  ('sku-choc-chip-muffin-4pk',  'ing-flour-ap',             0.180),
  ('sku-choc-chip-muffin-4pk',  'ing-sugar-granulated',     0.090),
  ('sku-choc-chip-muffin-4pk',  'ing-butter-unsalted',      0.060),
  ('sku-choc-chip-muffin-4pk',  'ing-eggs-whole',           0.045),
  ('sku-choc-chip-muffin-4pk',  'ing-chocolate-chips-dark', 0.080),

  -- Banana Bread Loaf
  ('sku-banana-bread-loaf',     'ing-flour-ap',             0.280),
  ('sku-banana-bread-loaf',     'ing-sugar-brown-light',    0.140),
  ('sku-banana-bread-loaf',     'ing-butter-unsalted',      0.110),
  ('sku-banana-bread-loaf',     'ing-eggs-whole',           0.060),
  ('sku-banana-bread-loaf',     'ing-banana-fresh',         0.220),

  -- Cinnamon Roll 6-pack
  ('sku-cinnamon-roll-6pk',     'ing-flour-bread',          0.360),
  ('sku-cinnamon-roll-6pk',     'ing-sugar-brown-dark',     0.120),
  ('sku-cinnamon-roll-6pk',     'ing-butter-unsalted',      0.180),
  ('sku-cinnamon-roll-6pk',     'ing-yeast-instant',        0.008),
  ('sku-cinnamon-roll-6pk',     'ing-cinnamon-ground',      0.012),
  ('sku-cinnamon-roll-6pk',     'ing-milk-whole',           0.120),

  -- Butter Croissant 4-pack
  ('sku-croissant-butter-4pk',  'ing-flour-bread',          0.240),
  ('sku-croissant-butter-4pk',  'ing-butter-unsalted',      0.180),
  ('sku-croissant-butter-4pk',  'ing-milk-whole',           0.080),
  ('sku-croissant-butter-4pk',  'ing-yeast-instant',        0.005),
  ('sku-croissant-butter-4pk',  'ing-sugar-granulated',     0.020),

  -- Plain Bagel 6-pack
  ('sku-bagel-plain-6pk',       'ing-flour-bread',          0.420),
  ('sku-bagel-plain-6pk',       'ing-yeast-instant',        0.006),
  ('sku-bagel-plain-6pk',       'ing-salt-kosher',          0.008),
  ('sku-bagel-plain-6pk',       'ing-sugar-granulated',     0.012),

  -- Sesame Bagel 6-pack
  ('sku-bagel-sesame-6pk',      'ing-flour-bread',          0.420),
  ('sku-bagel-sesame-6pk',      'ing-yeast-instant',        0.006),
  ('sku-bagel-sesame-6pk',      'ing-salt-kosher',          0.008),
  ('sku-bagel-sesame-6pk',      'ing-sugar-granulated',     0.012),
  ('sku-bagel-sesame-6pk',      'ing-sesame-seeds',         0.018),

  -- Sourdough Loaf
  ('sku-sourdough-loaf',        'ing-flour-bread',          0.450),
  ('sku-sourdough-loaf',        'ing-flour-whole-wheat',    0.090),
  ('sku-sourdough-loaf',        'ing-salt-kosher',          0.010),
  ('sku-sourdough-loaf',        'ing-yeast-active-dry',     0.004),

  -- Chocolate Chip Cookie 12-pack
  ('sku-choc-chip-cookie-12pk', 'ing-flour-ap',             0.240),
  ('sku-choc-chip-cookie-12pk', 'ing-sugar-brown-light',    0.120),
  ('sku-choc-chip-cookie-12pk', 'ing-butter-unsalted',      0.150),
  ('sku-choc-chip-cookie-12pk', 'ing-eggs-whole',           0.050),
  ('sku-choc-chip-cookie-12pk', 'ing-chocolate-chips-dark', 0.180),
  ('sku-choc-chip-cookie-12pk', 'ing-vanilla-extract',      0.006),

  -- Oatmeal Raisin Cookie 12-pack
  ('sku-oatmeal-cookie-12pk',   'ing-flour-ap',             0.180),
  ('sku-oatmeal-cookie-12pk',   'ing-oats-rolled',          0.150),
  ('sku-oatmeal-cookie-12pk',   'ing-sugar-brown-light',    0.120),
  ('sku-oatmeal-cookie-12pk',   'ing-butter-unsalted',      0.140),
  ('sku-oatmeal-cookie-12pk',   'ing-eggs-whole',           0.050),
  ('sku-oatmeal-cookie-12pk',   'ing-raisins',              0.110),

  -- Almond Danish 4-pack
  ('sku-almond-danish-4pk',     'ing-flour-pastry',         0.220),
  ('sku-almond-danish-4pk',     'ing-butter-unsalted',      0.160),
  ('sku-almond-danish-4pk',     'ing-sugar-granulated',     0.060),
  ('sku-almond-danish-4pk',     'ing-eggs-whole',           0.045),
  ('sku-almond-danish-4pk',     'ing-almonds-sliced',       0.040),
  ('sku-almond-danish-4pk',     'ing-flour-almond',         0.030)
ON CONFLICT (sku_id, ingredient_id) DO NOTHING;

-- ============================================================================
-- production_lines — 2-3 lines per plant, distinguished by allergen support
-- ============================================================================

INSERT INTO production_lines (line_id, facility_id, name, capacity_kg_per_hour, supported_allergen_tags) VALUES
  ('line-toronto-1',     'plant-toronto',     'Toronto Line 1 (Muffin/Bread)',  450, '{gluten,dairy,egg}'),
  ('line-toronto-2',     'plant-toronto',     'Toronto Line 2 (Pastry)',        320, '{gluten,dairy,egg,tree_nut}'),
  ('line-toronto-3',     'plant-toronto',     'Toronto Line 3 (Cookie)',        500, '{gluten,dairy,egg}'),
  ('line-mississauga-1', 'plant-mississauga', 'Mississauga Line 1 (Bagel)',     520, '{gluten,sesame}'),
  ('line-mississauga-2', 'plant-mississauga', 'Mississauga Line 2 (Bread)',     480, '{gluten}'),
  ('line-hamilton-1',    'plant-hamilton',    'Hamilton Line 1 (Muffin)',       440, '{gluten,dairy,egg}'),
  ('line-hamilton-2',    'plant-hamilton',    'Hamilton Line 2 (Cookie)',       510, '{gluten,dairy,egg}'),
  ('line-montreal-1',    'plant-montreal',    'Montreal Line 1 (Croissant)',    300, '{gluten,dairy,egg}'),
  ('line-montreal-2',    'plant-montreal',    'Montreal Line 2 (Danish)',       290, '{gluten,dairy,egg,tree_nut}')
ON CONFLICT (line_id) DO NOTHING;

-- ============================================================================
-- retailer_orders — 8 sample firm POs (F2.3)
--   Dates are relative-ish (using fixed dates in May/June 2026 for hackathon demo).
--   Guarded so re-running seed.sql doesn't create duplicate orders.
-- ============================================================================

DO $$
BEGIN
  IF (SELECT count(*) FROM retailer_orders) = 0 THEN
    INSERT INTO retailer_orders (retailer_id, sku_id, quantity_units, requested_delivery_date, status) VALUES
      ('costco',     'sku-blueberry-muffin-4pk',  12000, DATE '2026-05-28', 'open'),
      ('costco',     'sku-choc-chip-cookie-12pk',  8000, DATE '2026-05-29', 'open'),
      ('walmart',    'sku-banana-bread-loaf',      6000, DATE '2026-05-27', 'scheduled'),
      ('walmart',    'sku-bagel-plain-6pk',        9000, DATE '2026-05-30', 'open'),
      ('loblaws',    'sku-cinnamon-roll-6pk',      4500, DATE '2026-05-29', 'open'),
      ('loblaws',    'sku-sourdough-loaf',         3200, DATE '2026-06-01', 'open'),
      ('wholefoods', 'sku-almond-danish-4pk',      2400, DATE '2026-05-28', 'open'),
      ('wholefoods', 'sku-croissant-butter-4pk',   3600, DATE '2026-05-30', 'open');
  END IF;
END $$;
