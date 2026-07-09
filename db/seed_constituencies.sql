-- =============================================================
-- Migration 001 — GE2025 Constituency Data
-- Source: ELD (eld.gov.sg/finalresults2025.html) + Town Council sites
-- Run once. Idempotent via IF NOT EXISTS / ON CONFLICT.
-- =============================================================

BEGIN;

-- ── 1. Add new columns ────────────────────────────────────────
ALTER TABLE constituencies ADD COLUMN IF NOT EXISTS party VARCHAR(10);
ALTER TABLE constituencies ADD COLUMN IF NOT EXISTS type  VARCHAR(5);

-- TRUNCATE constituencies CASCADE; -- disabled to prevent wiping cases on compose restarts

-- ── 3. Insert all 97 MPs (one row per MP per division) ────────
-- GRCs: each MP has their own division (ward)
-- SMCs: division = constituency name (single MP = single ward)
INSERT INTO constituencies (name, division, mp_name, party, type, branch_location, mps_schedule) VALUES

-- ── Aljunied GRC (WP) — 5 MPs ────────────────────────────────
('Aljunied GRC', 'Bedok Reservoir–Punggol', 'Pritam Singh',    'WP', 'GRC', NULL, NULL),
('Aljunied GRC', 'Serangoon',              'Sylvia Lim',       'WP', 'GRC', NULL, NULL),
('Aljunied GRC', 'Eunos',                  'Gerald Giam',      'WP', 'GRC', NULL, NULL),
('Aljunied GRC', 'Kaki Bukit',             'Fadli Fawzi',      'WP', 'GRC', NULL, NULL),
('Aljunied GRC', 'Paya Lebar',             'Kenneth Tiong',    'WP', 'GRC', NULL, NULL),

-- ── Ang Mo Kio GRC (PAP) — 5 MPs ─────────────────────────────
('Ang Mo Kio GRC', 'Teck Ghee',               'Lee Hsien Loong',    'PAP', 'GRC', NULL, NULL),
('Ang Mo Kio GRC', 'Ang Mo Kio–Hougang',      'Darryl David',       'PAP', 'GRC', NULL, NULL),
('Ang Mo Kio GRC', 'Cheng San',               'Nadia Ahmad Samdin', 'PAP', 'GRC', NULL, NULL),
('Ang Mo Kio GRC', 'Buangkok–Fernvale South',  'Jasmin Lau',         'PAP', 'GRC', NULL, NULL),
('Ang Mo Kio GRC', 'Seletar–Serangoon',        'Victor Lye',         'PAP', 'GRC', NULL, NULL),

-- ── Bishan–Toa Payoh GRC (PAP) — 4 MPs ───────────────────────
('Bishan–Toa Payoh GRC', 'Toa Payoh West–Thomson', 'Chee Hong Tat',     'PAP', 'GRC', NULL, NULL),
('Bishan–Toa Payoh GRC', 'Toa Payoh East',         'Saktiandi Supaat',  'PAP', 'GRC', NULL, NULL),
('Bishan–Toa Payoh GRC', 'Bishan East–Sin Ming',   'Elysa Chen',        'PAP', 'GRC', NULL, NULL),
('Bishan–Toa Payoh GRC', 'Toa Payoh Central',      'Cai Yinzhou',       'PAP', 'GRC', NULL, NULL),

-- ── Chua Chu Kang GRC (PAP) — 4 MPs ──────────────────────────
('Chua Chu Kang GRC', 'Chua Chu Kang', 'Tan See Leng',             'PAP', 'GRC', NULL, NULL),
('Chua Chu Kang GRC', 'Keat Hong',     'Zhulkarnain Abdul Rahim',  'PAP', 'GRC', NULL, NULL),
('Chua Chu Kang GRC', 'Brickland',     'Choo Pei Ling',            'PAP', 'GRC', NULL, NULL),
('Chua Chu Kang GRC', 'Tengah',        'Jeffrey Siow',             'PAP', 'GRC', NULL, NULL),

-- ── East Coast GRC (PAP) — 5 MPs ─────────────────────────────
('East Coast GRC', 'Joo Chiat',         'Edwin Tong',           'PAP', 'GRC', NULL, NULL),
('East Coast GRC', 'Kampong Chai Chee', 'Tan Kiat How',         'PAP', 'GRC', NULL, NULL),
('East Coast GRC', 'Bedok',             'Dinesh Vasu Dash',     'PAP', 'GRC', NULL, NULL),
('East Coast GRC', 'Changi–Simei',      'Jessica Tan',          'PAP', 'GRC', NULL, NULL),
('East Coast GRC', 'Fengshan',          'Hazlina Abdul Halim',  'PAP', 'GRC', NULL, NULL),

-- ── Holland–Bukit Timah GRC (PAP) — 4 MPs ────────────────────
('Holland–Bukit Timah GRC', 'Bukit Timah', 'Vivian Balakrishnan',  'PAP', 'GRC', NULL, NULL),
('Holland–Bukit Timah GRC', 'Cashew',      'Sim Ann',              'PAP', 'GRC', NULL, NULL),
('Holland–Bukit Timah GRC', 'Ulu Pandan',  'Christopher De Souza', 'PAP', 'GRC', NULL, NULL),
('Holland–Bukit Timah GRC', 'Zhenghua',    'Edward Chia',          'PAP', 'GRC', NULL, NULL),

-- ── Jalan Besar GRC (PAP) — 4 MPs ────────────────────────────
('Jalan Besar GRC', 'Kreta Ayer–Kim Seng', 'Josephine Teo', 'PAP', 'GRC', NULL, NULL),
('Jalan Besar GRC', 'Kampong Glam',        'Denise Phua',   'PAP', 'GRC', NULL, NULL),
('Jalan Besar GRC', 'Kolam Ayer',          'Wan Rizal',     'PAP', 'GRC', NULL, NULL),
('Jalan Besar GRC', 'Whampoa',             'Shawn Loh',     'PAP', 'GRC', NULL, NULL),

-- ── Jurong East–Bukit Batok GRC (PAP) — 5 MPs ────────────────
('Jurong East–Bukit Batok GRC', 'Jurong East',    'Grace Fu',         'PAP', 'GRC', NULL, NULL),
('Jurong East–Bukit Batok GRC', 'Bukit Batok',    'Murali Pillai',    'PAP', 'GRC', NULL, NULL),
('Jurong East–Bukit Batok GRC', 'Bukit Batok East','Rahayu Mahzam',   'PAP', 'GRC', NULL, NULL),
('Jurong East–Bukit Batok GRC', 'Clementi',        'David Hoe',       'PAP', 'GRC', NULL, NULL),
('Jurong East–Bukit Batok GRC', 'Hong Kah North',  'Lee Hong Chuang', 'PAP', 'GRC', NULL, NULL),

-- ── Marine Parade–Braddell Heights GRC (PAP) — 5 MPs ─────────
('Marine Parade–Braddell Heights GRC', 'Marine Parade',   'Goh Pei Ming',              'PAP', 'GRC', NULL, NULL),
('Marine Parade–Braddell Heights GRC', 'Kembangan',       'Muhammad Faishal Ibrahim',  'PAP', 'GRC', NULL, NULL),
('Marine Parade–Braddell Heights GRC', 'Geylang Serai',   'Diana Pang',                'PAP', 'GRC', NULL, NULL),
('Marine Parade–Braddell Heights GRC', 'Braddell Heights', 'Seah Kian Peng',           'PAP', 'GRC', NULL, NULL),
('Marine Parade–Braddell Heights GRC', 'MacPherson',       'Tin Pei Ling',             'PAP', 'GRC', NULL, NULL),

-- ── Marsiling–Yew Tee GRC (PAP) — 4 MPs ──────────────────────
('Marsiling–Yew Tee GRC', 'Limbang',    'Lawrence Wong',  'PAP', 'GRC', NULL, NULL),
('Marsiling–Yew Tee GRC', 'Marsiling',  'Zaqy Mohamad',   'PAP', 'GRC', NULL, NULL),
('Marsiling–Yew Tee GRC', 'Woodgrove',  'Hany Soh',       'PAP', 'GRC', NULL, NULL),
('Marsiling–Yew Tee GRC', 'Yew Tee',    'Alex Yam',       'PAP', 'GRC', NULL, NULL),

-- ── Nee Soon GRC (PAP) — 5 MPs ───────────────────────────────
('Nee Soon GRC', 'Chong Pang',      'K. Shanmugam',         'PAP', 'GRC', NULL, NULL),
('Nee Soon GRC', 'Nee Soon Central', 'Goh Hanyan',           'PAP', 'GRC', NULL, NULL),
('Nee Soon GRC', 'Nee Soon East',    'Jackson Lam',          'PAP', 'GRC', NULL, NULL),
('Nee Soon GRC', 'Nee Soon South',   'Lee Hui Ying',         'PAP', 'GRC', NULL, NULL),
('Nee Soon GRC', 'Nee Soon Link',    'Syed Harun Alhabsyi',  'PAP', 'GRC', NULL, NULL),

-- ── Pasir Ris–Changi GRC (PAP) — 4 MPs ───────────────────────
('Pasir Ris–Changi GRC', 'Pasir Ris Central', 'Indranee Rajah', 'PAP', 'GRC', NULL, NULL),
('Pasir Ris–Changi GRC', 'Pasir Ris West',    'Desmond Tan',    'PAP', 'GRC', NULL, NULL),
('Pasir Ris–Changi GRC', 'Changi',             'Sharael Taha',   'PAP', 'GRC', NULL, NULL),
('Pasir Ris–Changi GRC', 'Pasir Ris East',     'Valerie Lee',    'PAP', 'GRC', NULL, NULL),

-- ── Punggol GRC (PAP) — 4 MPs ────────────────────────────────
('Punggol GRC', 'Punggol North', 'Gan Kim Yong',      'PAP', 'GRC', NULL, NULL),
('Punggol GRC', 'Punggol Coast', 'Janil Puthucheary', 'PAP', 'GRC', NULL, NULL),
('Punggol GRC', 'Punggol West',  'Sun Xueling',       'PAP', 'GRC', NULL, NULL),
('Punggol GRC', 'Punggol Shore', 'Yeo Wan Ling',      'PAP', 'GRC', NULL, NULL),

-- ── Sembawang GRC (PAP) — 5 MPs ──────────────────────────────
('Sembawang GRC', 'Sembawang Central', 'Ong Ye Kung',   'PAP', 'GRC', NULL, NULL),
('Sembawang GRC', 'Woodlands',         'Vikram Nair',   'PAP', 'GRC', NULL, NULL),
('Sembawang GRC', 'Admiralty',          'Mariam Jaafar', 'PAP', 'GRC', NULL, NULL),
('Sembawang GRC', 'Naval Base',         'Gabriel Lam',   'PAP', 'GRC', NULL, NULL),
('Sembawang GRC', 'Canberra',           'Ng Shi Xuan',   'PAP', 'GRC', NULL, NULL),

-- ── Sengkang GRC (WP) — 4 MPs ────────────────────────────────
('Sengkang GRC', 'Anchorvale',   'Jamus Lim',       'WP', 'GRC', NULL, NULL),
('Sengkang GRC', 'Buangkok',     'He Ting Ru',      'WP', 'GRC', NULL, NULL),
('Sengkang GRC', 'Compassvale',  'Abdul Muhaimin',  'WP', 'GRC', NULL, NULL),
('Sengkang GRC', 'Rivervale',    'Louis Chua',      'WP', 'GRC', NULL, NULL),

-- ── Tampines GRC (PAP) — 5 MPs ───────────────────────────────
('Tampines GRC', 'Tampines West',      'Masagos Zulkifli', 'PAP', 'GRC', NULL, NULL),
('Tampines GRC', 'Tampines Central',   'Baey Yam Keng',    'PAP', 'GRC', NULL, NULL),
('Tampines GRC', 'Tampines North',     'Koh Poh Koon',     'PAP', 'GRC', NULL, NULL),
('Tampines GRC', 'Tampines East',      'Charlene Chen',    'PAP', 'GRC', NULL, NULL),
('Tampines GRC', 'Tampines Boulevard', 'David Neo',        'PAP', 'GRC', NULL, NULL),

-- ── Tanjong Pagar GRC (PAP) — 5 MPs ──────────────────────────
('Tanjong Pagar GRC', 'Buona Vista',             'Chan Chun Sing', 'PAP', 'GRC', NULL, NULL),
('Tanjong Pagar GRC', 'Henderson–Dawson',        'Joan Pereira',   'PAP', 'GRC', NULL, NULL),
('Tanjong Pagar GRC', 'Moulmein–Cairnhill',      'Alvin Tan',      'PAP', 'GRC', NULL, NULL),
('Tanjong Pagar GRC', 'Tanjong Pagar–Tiong Bahru','Foo Cexiang',   'PAP', 'GRC', NULL, NULL),
('Tanjong Pagar GRC', 'Telok Blangah',           'Rachel Ong',     'PAP', 'GRC', NULL, NULL),

-- ── West Coast–Jurong West GRC (PAP) — 5 MPs ─────────────────
('West Coast–Jurong West GRC', 'Boon Lay',              'Desmond Lee',   'PAP', 'GRC', NULL, NULL),
('West Coast–Jurong West GRC', 'Nanyang',                'Ang Wei Neng',  'PAP', 'GRC', NULL, NULL),
('West Coast–Jurong West GRC', 'Taman Jurong',           'Shawn Huang',   'PAP', 'GRC', NULL, NULL),
('West Coast–Jurong West GRC', 'Jurong Spring–Gek Poh',  'Hamid Razak',   'PAP', 'GRC', NULL, NULL),
('West Coast–Jurong West GRC', 'Ayer Rajah',             'Cassandra Lee', 'PAP', 'GRC', NULL, NULL),

-- ── 15 SMCs ───────────────────────────────────────────────────
('Bukit Gombak SMC',     'Bukit Gombak',     'Low Yen Ling',      'PAP', 'SMC', NULL, NULL),
('Bukit Panjang SMC',    'Bukit Panjang',    'Liang Eng Hwa',     'PAP', 'SMC', NULL, NULL),
('Hougang SMC',          'Hougang',          'Dennis Tan',        'WP',  'SMC', NULL, NULL),
('Jalan Kayu SMC',       'Jalan Kayu',       'Ng Chee Meng',      'PAP', 'SMC', NULL, NULL),
('Jurong Central SMC',   'Jurong Central',   'Xie Yao Quan',      'PAP', 'SMC', NULL, NULL),
('Kebun Baru SMC',       'Kebun Baru',       'Kwek Hian Chuan',   'PAP', 'SMC', NULL, NULL),
('Marymount SMC',        'Marymount',        'Gan Siow Huang',    'PAP', 'SMC', NULL, NULL),
('Mountbatten SMC',      'Mountbatten',      'Gho Sze Kee',       'PAP', 'SMC', NULL, NULL),
('Pioneer SMC',          'Pioneer',          'Patrick Tay',       'PAP', 'SMC', NULL, NULL),
('Potong Pasir SMC',     'Potong Pasir',     'Alex Yeo',          'PAP', 'SMC', NULL, NULL),
('Queenstown SMC',       'Queenstown',       'Eric Chua',         'PAP', 'SMC', NULL, NULL),
('Radin Mas SMC',        'Radin Mas',        'Melvin Yong',       'PAP', 'SMC', NULL, NULL),
('Sembawang West SMC',   'Sembawang West',   'Poh Li San',        'PAP', 'SMC', NULL, NULL),
('Tampines Changkat SMC','Tampines Changkat', 'Desmond Choo',      'PAP', 'SMC', NULL, NULL),
('Yio Chu Kang SMC',     'Yio Chu Kang',     'Yip Hon Weng',      'PAP', 'SMC', NULL, NULL)
ON CONFLICT (name, division) DO NOTHING;

-- ── 4. Postal sector → constituency mapping ──────────────────
-- First 2 digits of postal code → approximate constituency
-- NOT 100% accurate at boundaries — demo approximation only
CREATE TABLE IF NOT EXISTS postal_sector_map (
  sector_prefix CHAR(2) PRIMARY KEY,
  constituency_id INT NOT NULL REFERENCES constituencies(id),
  notes TEXT
);

-- Populate after constituencies are inserted, using subqueries
-- to resolve IDs dynamically by mp_name + division
INSERT INTO postal_sector_map (sector_prefix, constituency_id, notes) VALUES
-- D01: CBD / Raffles Place / Marina
('01', (SELECT id FROM constituencies WHERE division = 'Tanjong Pagar–Tiong Bahru' LIMIT 1), 'CBD area'),
('02', (SELECT id FROM constituencies WHERE division = 'Tanjong Pagar–Tiong Bahru' LIMIT 1), 'Raffles Place'),
('03', (SELECT id FROM constituencies WHERE division = 'Tanjong Pagar–Tiong Bahru' LIMIT 1), 'Marina'),
('04', (SELECT id FROM constituencies WHERE division = 'Tanjong Pagar–Tiong Bahru' LIMIT 1), 'Cecil'),
('05', (SELECT id FROM constituencies WHERE division = 'Tanjong Pagar–Tiong Bahru' LIMIT 1), 'People''s Park'),
('06', (SELECT id FROM constituencies WHERE division = 'Tanjong Pagar–Tiong Bahru' LIMIT 1), 'City Hall area'),
-- D02: Chinatown / Tanjong Pagar / Anson
('07', (SELECT id FROM constituencies WHERE division = 'Kreta Ayer–Kim Seng' LIMIT 1), 'Chinatown'),
('08', (SELECT id FROM constituencies WHERE division = 'Kreta Ayer–Kim Seng' LIMIT 1), 'Tanjong Pagar / Anson'),
-- D04: Harbourfront / Telok Blangah
('09', (SELECT id FROM constituencies WHERE division = 'Telok Blangah' LIMIT 1), 'Harbourfront'),
('10', (SELECT id FROM constituencies WHERE division = 'Telok Blangah' LIMIT 1), 'Telok Blangah'),
-- D05: Buona Vista / Clementi / Pasir Panjang
('11', (SELECT id FROM constituencies WHERE division = 'Buona Vista' LIMIT 1), 'Buona Vista / West Coast'),
('12', (SELECT id FROM constituencies WHERE division = 'Clementi' LIMIT 1), 'Clementi'),
('13', (SELECT id FROM constituencies WHERE division = 'Buona Vista' LIMIT 1), 'Pasir Panjang'),
-- D03: Alexandra / Queenstown / Tiong Bahru
('14', (SELECT id FROM constituencies WHERE division = 'Queenstown' LIMIT 1), 'Alexandra / Queenstown'),
('15', (SELECT id FROM constituencies WHERE division = 'Henderson–Dawson' LIMIT 1), 'Henderson / Dawson'),
('16', (SELECT id FROM constituencies WHERE division = 'Queenstown' LIMIT 1), 'Tiong Bahru area'),
-- D06: City Hall
('17', (SELECT id FROM constituencies WHERE division = 'Kampong Glam' LIMIT 1), 'City Hall / Beach Road'),
-- D07: Beach Road / Bugis
('18', (SELECT id FROM constituencies WHERE division = 'Kampong Glam' LIMIT 1), 'Beach Road / Middle Road'),
('19', (SELECT id FROM constituencies WHERE division = 'Kampong Glam' LIMIT 1), 'Bugis / Golden Mile'),
-- D08: Little India / Farrer Park
('20', (SELECT id FROM constituencies WHERE division = 'Kolam Ayer' LIMIT 1), 'Little India'),
('21', (SELECT id FROM constituencies WHERE division = 'Kolam Ayer' LIMIT 1), 'Farrer Park'),
-- D09: Orchard / River Valley
('22', (SELECT id FROM constituencies WHERE division = 'Moulmein–Cairnhill' LIMIT 1), 'Orchard'),
('23', (SELECT id FROM constituencies WHERE division = 'Moulmein–Cairnhill' LIMIT 1), 'River Valley'),
-- D10: Tanglin / Holland / Bukit Timah
('24', (SELECT id FROM constituencies WHERE division = 'Bukit Timah' LIMIT 1), 'Tanglin'),
('25', (SELECT id FROM constituencies WHERE division = 'Bukit Timah' LIMIT 1), 'Holland area'),
('26', (SELECT id FROM constituencies WHERE division = 'Bukit Timah' LIMIT 1), 'Bukit Timah'),
('27', (SELECT id FROM constituencies WHERE division = 'Bukit Timah' LIMIT 1), 'Holland Road'),
-- D11: Newton / Novena / Thomson
('28', (SELECT id FROM constituencies WHERE division = 'Moulmein–Cairnhill' LIMIT 1), 'Newton'),
('29', (SELECT id FROM constituencies WHERE division = 'Marymount' LIMIT 1), 'Novena / Thomson'),
('30', (SELECT id FROM constituencies WHERE division = 'Marymount' LIMIT 1), 'Watten Estate'),
-- D12: Balestier / Toa Payoh / Serangoon
('31', (SELECT id FROM constituencies WHERE division = 'Whampoa' LIMIT 1), 'Balestier / Whampoa'),
('32', (SELECT id FROM constituencies WHERE division = 'Toa Payoh Central' LIMIT 1), 'Toa Payoh'),
('33', (SELECT id FROM constituencies WHERE division = 'Toa Payoh East' LIMIT 1), 'Serangoon Road area'),
-- D13: Macpherson / Potong Pasir / Braddell
('34', (SELECT id FROM constituencies WHERE division = 'MacPherson' LIMIT 1), 'Macpherson'),
('35', (SELECT id FROM constituencies WHERE division = 'Braddell Heights' LIMIT 1), 'Braddell'),
('36', (SELECT id FROM constituencies WHERE division = 'Potong Pasir' LIMIT 1), 'Potong Pasir'),
('37', (SELECT id FROM constituencies WHERE division = 'Braddell Heights' LIMIT 1), 'Upper Serangoon'),
-- D14: Geylang / Eunos / Paya Lebar
('38', (SELECT id FROM constituencies WHERE division = 'Geylang Serai' LIMIT 1), 'Geylang'),
('39', (SELECT id FROM constituencies WHERE division = 'Eunos' LIMIT 1), 'Eunos'),
('40', (SELECT id FROM constituencies WHERE division = 'Paya Lebar' LIMIT 1), 'Paya Lebar'),
('41', (SELECT id FROM constituencies WHERE division = 'Kembangan' LIMIT 1), 'Kembangan'),
-- D15: East Coast / Marine Parade / Katong / Joo Chiat
('42', (SELECT id FROM constituencies WHERE division = 'Joo Chiat' LIMIT 1), 'Katong / Joo Chiat'),
('43', (SELECT id FROM constituencies WHERE division = 'Marine Parade' LIMIT 1), 'Marine Parade'),
('44', (SELECT id FROM constituencies WHERE division = 'Marine Parade' LIMIT 1), 'Amber Road'),
('45', (SELECT id FROM constituencies WHERE division = 'Joo Chiat' LIMIT 1), 'East Coast area'),
-- D16: Bedok / Upper East Coast
('46', (SELECT id FROM constituencies WHERE division = 'Bedok' LIMIT 1), 'Bedok'),
('47', (SELECT id FROM constituencies WHERE division = 'Fengshan' LIMIT 1), 'Upper East Coast'),
('48', (SELECT id FROM constituencies WHERE division = 'Fengshan' LIMIT 1), 'Kew Drive'),
-- D17: Changi / Loyang
('49', (SELECT id FROM constituencies WHERE division = 'Changi' LIMIT 1), 'Changi Village'),
('50', (SELECT id FROM constituencies WHERE division = 'Changi–Simei' LIMIT 1), 'Loyang / Simei'),
-- D18: Tampines / Pasir Ris
('51', (SELECT id FROM constituencies WHERE division = 'Tampines Central' LIMIT 1), 'Tampines'),
('52', (SELECT id FROM constituencies WHERE division = 'Pasir Ris Central' LIMIT 1), 'Pasir Ris'),
-- D19: Hougang / Punggol / Sengkang
('53', (SELECT id FROM constituencies WHERE division = 'Hougang' LIMIT 1), 'Hougang'),
('54', (SELECT id FROM constituencies WHERE division = 'Rivervale' LIMIT 1), 'Sengkang / Rivervale'),
('55', (SELECT id FROM constituencies WHERE division = 'Anchorvale' LIMIT 1), 'Sengkang / Anchorvale'),
-- D20: Ang Mo Kio / Bishan
('56', (SELECT id FROM constituencies WHERE division = 'Teck Ghee' LIMIT 1), 'Ang Mo Kio'),
('57', (SELECT id FROM constituencies WHERE division = 'Bishan East–Sin Ming' LIMIT 1), 'Bishan'),
-- D21: Clementi Park / Upper Bukit Timah
('58', (SELECT id FROM constituencies WHERE division = 'Ulu Pandan' LIMIT 1), 'Clementi Park / Ulu Pandan'),
('59', (SELECT id FROM constituencies WHERE division = 'Cashew' LIMIT 1), 'Upper Bukit Timah'),
-- D22: Jurong / Boon Lay / Tuas
('60', (SELECT id FROM constituencies WHERE division = 'Jurong East' LIMIT 1), 'Jurong East'),
('61', (SELECT id FROM constituencies WHERE division = 'Jurong Central' LIMIT 1), 'Jurong Central'),
('62', (SELECT id FROM constituencies WHERE division = 'Taman Jurong' LIMIT 1), 'Taman Jurong'),
('63', (SELECT id FROM constituencies WHERE division = 'Boon Lay' LIMIT 1), 'Boon Lay'),
('64', (SELECT id FROM constituencies WHERE division = 'Pioneer' LIMIT 1), 'Pioneer / Tuas'),
-- D23: Bukit Panjang / Choa Chu Kang / Hillview
('65', (SELECT id FROM constituencies WHERE division = 'Bukit Panjang' LIMIT 1), 'Bukit Panjang'),
('66', (SELECT id FROM constituencies WHERE division = 'Chua Chu Kang' LIMIT 1), 'Choa Chu Kang'),
('67', (SELECT id FROM constituencies WHERE division = 'Bukit Gombak' LIMIT 1), 'Bukit Gombak / Hillview'),
('68', (SELECT id FROM constituencies WHERE division = 'Zhenghua' LIMIT 1), 'Dairy Farm / Zhenghua'),
-- D24: Tengah / Lim Chu Kang
('69', (SELECT id FROM constituencies WHERE division = 'Tengah' LIMIT 1), 'Lim Chu Kang / Tengah'),
('70', (SELECT id FROM constituencies WHERE division = 'Tengah' LIMIT 1), 'Tengah'),
('71', (SELECT id FROM constituencies WHERE division = 'Keat Hong' LIMIT 1), 'Keat Hong'),
-- D25: Woodlands / Kranji
('72', (SELECT id FROM constituencies WHERE division = 'Woodlands' LIMIT 1), 'Woodlands / Kranji'),
('73', (SELECT id FROM constituencies WHERE division = 'Woodgrove' LIMIT 1), 'Woodgrove / Admiralty'),
-- D27: Yishun / Sembawang
('75', (SELECT id FROM constituencies WHERE division = 'Chong Pang' LIMIT 1), 'Yishun'),
('76', (SELECT id FROM constituencies WHERE division = 'Sembawang West' LIMIT 1), 'Sembawang'),
-- D26: Upper Thomson / Springleaf
('77', (SELECT id FROM constituencies WHERE division = 'Jalan Kayu' LIMIT 1), 'Upper Thomson'),
('78', (SELECT id FROM constituencies WHERE division = 'Jalan Kayu' LIMIT 1), 'Springleaf'),
-- D28: Seletar / Yio Chu Kang
('79', (SELECT id FROM constituencies WHERE division = 'Yio Chu Kang' LIMIT 1), 'Seletar'),
('80', (SELECT id FROM constituencies WHERE division = 'Yio Chu Kang' LIMIT 1), 'Yio Chu Kang'),
-- Special sectors
('81', (SELECT id FROM constituencies WHERE division = 'Changi' LIMIT 1), 'Changi Airport area'),
('82', (SELECT id FROM constituencies WHERE division = 'Punggol North' LIMIT 1), 'Punggol / Sengkang new')
ON CONFLICT (sector_prefix) DO NOTHING;

-- ── 5. Re-seed demo users ─────────────────────────────────────
-- Generic superadmin (not tied to any constituency)
INSERT INTO users (constituency_id, name, email, role, pw_hash) VALUES
  (NULL, 'System Admin', 'admin@mps-connect.gov.sg', 'superadmin',
   '$2b$10$sP9D7WGID65nopP4paK9Ee53xZytxZXTzL/9nFj76F9PfKWIf8vZ.')
ON CONFLICT (email) DO NOTHING;

-- Staff users for Ang Mo Kio GRC (Teck Ghee division) — demo login
INSERT INTO users (constituency_id, name, email, role, pw_hash) VALUES
  ((SELECT id FROM constituencies WHERE name = 'Ang Mo Kio GRC' AND division = 'Teck Ghee' LIMIT 1),
   'MP Office', 'mp@amk.mps-connect.gov.sg', 'mp',
   '$2b$10$sP9D7WGID65nopP4paK9Ee53xZytxZXTzL/9nFj76F9PfKWIf8vZ.'),
  ((SELECT id FROM constituencies WHERE name = 'Ang Mo Kio GRC' AND division = 'Teck Ghee' LIMIT 1),
   'Case Admin', 'admin@amk.mps-connect.gov.sg', 'admin',
   '$2b$10$sP9D7WGID65nopP4paK9Ee53xZytxZXTzL/9nFj76F9PfKWIf8vZ.'),
  ((SELECT id FROM constituencies WHERE name = 'Ang Mo Kio GRC' AND division = 'Teck Ghee' LIMIT 1),
   'Case Writer 1', 'writer1@amk.mps-connect.gov.sg', 'writer',
   '$2b$10$sP9D7WGID65nopP4paK9Ee53xZytxZXTzL/9nFj76F9PfKWIf8vZ.'),
  ((SELECT id FROM constituencies WHERE name = 'Ang Mo Kio GRC' AND division = 'Teck Ghee' LIMIT 1),
   'Registry Counter', 'registry@amk.mps-connect.gov.sg', 'registry',
   '$2b$10$sP9D7WGID65nopP4paK9Ee53xZytxZXTzL/9nFj76F9PfKWIf8vZ.')
ON CONFLICT (email) DO NOTHING;

COMMIT;
