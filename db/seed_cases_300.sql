-- ================================================================
-- MPS Connect — Synthetic Case Seed (300 cases)
--
-- Step 1: ensure case_number column exists (added after initial migration)
-- Step 2: insert 300 cases across 8 categories with realistic distribution
--
-- Run:
--   docker exec -i mps-postgres psql -U mps -d mps_connect < ./db/seed_cases_300.sql
-- ================================================================

-- Add column if the live DB was created before this schema change
ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_number VARCHAR(30) UNIQUE;

-- Use a CTE so status is computed ONCE and reused for both the INSERT and
-- the core_request CASE (previous version called random() twice independently).
WITH generated AS (
  SELECT
    i,

    -- Category (30-item cycle, 8 categories)
    (ARRAY[
      'Housing','Housing','Housing','Housing','Housing',
      'Employment','Employment','Employment','Employment',
      'Medical','Medical','Medical','Medical',
      'Financial Aid','Financial Aid','Financial Aid','Financial Aid',
      'Education','Education','Education',
      'Elderly Care','Elderly Care','Elderly Care',
      'Immigration','Immigration','Immigration',
      'Legal','Legal','Legal'
    ])[1 + ((i - 1) % 30)] AS cat,

    -- Status (weighted random, computed ONCE)
    (ARRAY[
      'new','new',
      'triaged','triaged','triaged',
      'drafting','drafting','drafting',
      'pending_approval','pending_approval','pending_approval','pending_approval','pending_approval',
      'approved','approved','approved','approved',
      'sent','sent','sent',
      'closed','closed'
    ])[1 + (floor(random() * 22))::INT] AS status

  FROM generate_series(1, 300) AS i
)

INSERT INTO cases (
  constituency_id, resident_name, nric_masked, contact_phone,
  category, sub_category, urgency, status,
  summary, core_request, case_number,
  created_at, updated_at
)
SELECT
  1 AS constituency_id,

  -- Name (40-name pool, cycles)
  (ARRAY[
    'Tan Wei Ming','Lim Siew Eng','Lee Boon Huat','Ng Mei Fen','Wong Chee Keong',
    'Chen Swee Lan','Goh Wai Kit','Chua Bee Hua','Ong Ah Huat','Koh Hui Ling',
    'Teo Choon Kiat','Ho Seow Khim','Sim Bak Cheng','Yeo Lay Leng','Chong Kim Hock',
    'Ahmad Bin Ismail','Siti Rahimah Binte Yusof','Mohamed Farid Bin Rashid',
    'Nur Aisha Binte Ahmad','Zainudin Bin Othman','Rosnah Binte Hassan',
    'Hafiz Bin Kamal','Fatimah Binte Ali','Rizal Bin Abdullah','Nurul Huda Binte Aziz',
    'Rajesh Kumar','Priya Devi d/o Rajan','Selvam s/o Muthu','Kavitha d/o Pillai',
    'Suresh Babu s/o Gopal','Meena Devi','Krishnan s/o Siva','Lakshmi d/o Nair',
    'Ramesh s/o Naidu','Vijay Kumar s/o Menon',
    'Mary Lim','Peter Tan','Susan Wong','John Lee','Grace Ng'
  ])[1 + ((i - 1) % 40)] AS resident_name,

  -- NRIC (masked, deterministic)
  'S' || lpad(((8000000 + i * 1234) % 9000000 + 1000000)::TEXT, 7, '0')
       || chr(65 + (i % 24)) AS nric_masked,

  -- Phone
  CASE WHEN i % 3 = 0 THEN '8' ELSE '9' END
  || lpad(((1000000 + i * 7654) % 9000000)::TEXT, 7, '0') AS contact_phone,

  cat AS category,

  -- Sub-category (keyed off category, cycles every 6)
  CASE cat
    WHEN 'Housing'      THEN (ARRAY['Rental Arrears','Flat Downgrade','Noise Complaint','Lift Breakdown','Flooding Damage','Flat Upgrade'])[1 + ((i-1) % 6)]
    WHEN 'Employment'   THEN (ARRAY['Retrenchment','CPF Dispute','Work Injury','Wrongful Dismissal','Salary Unpaid','MOM Complaint'])[1 + ((i-1) % 6)]
    WHEN 'Medical'      THEN (ARRAY['Medifund Application','Hospital Bill','Medication Subsidy','Caregiver Support','Mental Health','Dialysis Support'])[1 + ((i-1) % 6)]
    WHEN 'Financial Aid'THEN (ARRAY['ComCare Application','Utility Arrears','Emergency Fund','Debt Restructuring','Food Aid','CDC Vouchers'])[1 + ((i-1) % 6)]
    WHEN 'Education'    THEN (ARRAY['PSLE Appeal','Bursary Application','School Transfer','Special Needs Support','Fee Waiver','SkillsFuture'])[1 + ((i-1) % 6)]
    WHEN 'Elderly Care' THEN (ARRAY['Nursing Home Placement','Home Care','Elder Abuse','Dementia Support','Senior Mobility Aid','Respite Care'])[1 + ((i-1) % 6)]
    WHEN 'Immigration'  THEN (ARRAY['PR Application','Citizenship Appeal','LTVP Renewal','Family Reunion','Work Pass','Dependant Pass'])[1 + ((i-1) % 6)]
    WHEN 'Legal'        THEN (ARRAY['Court Matters','Domestic Violence','Debt Harassment','Estate Dispute','Tenancy Dispute','Legal Aid'])[1 + ((i-1) % 6)]
  END AS sub_category,

  -- Urgency (~10% Critical, ~25% High, ~40% Medium, ~25% Low)
  (ARRAY[
    'Critical','Critical',
    'High','High','High','High','High',
    'Medium','Medium','Medium','Medium','Medium','Medium','Medium','Medium',
    'Low','Low','Low','Low','Low'
  ])[1 + (floor(random() * 20))::INT] AS urgency,

  status,

  -- Summary (one per category, cycles every 6)
  CASE cat
    WHEN 'Housing'       THEN (ARRAY[
      'Facing eviction from HDB flat due to 4 months rental arrears following sudden job loss',
      'Requesting HDB flat downgrade assistance after household income dropped significantly',
      'Chronic noise harassment from upstairs neighbour, police reports filed with no resolution',
      'HDB lift faulty for 7 weeks, elderly and mobility-impaired residents unable to leave home',
      'Unit flooding from upstairs flat causing property damage; HDB has not responded',
      'Requesting priority allocation for elderly parent living alone in overcrowded flat'
    ])[1 + ((i-1) % 6)]
    WHEN 'Employment'    THEN (ARRAY[
      'Retrenched after 15 years of service, severance package disputed by employer',
      'Employer withheld CPF contributions for 14 months, MOM complaint filed',
      'Workplace injury left resident partially disabled, employer refusing compensation',
      'Wrongful dismissal without notice or reason after raising safety concerns',
      'Salary unpaid for 2 consecutive months, employer uncontactable',
      'Discrimination in workplace promotion, formal complaint under review at MOM'
    ])[1 + ((i-1) % 6)]
    WHEN 'Medical'       THEN (ARRAY[
      'Emergency surgery required, Medifund rejected first time, hospital bill exceeds $45,000',
      'Child with rare genetic condition needs specialist medication not covered by MediShield Life',
      'Dialysis patient struggling to afford 3x weekly hospital transport and meals',
      'Sole caregiver of spouse with late-stage dementia, cannot afford day care placement',
      'Teenager experiencing severe depression, waiting list for subsidised psychiatric care 6 months',
      'Cancer patient discharged prematurely, unable to afford step-down care facility'
    ])[1 + ((i-1) % 6)]
    WHEN 'Financial Aid' THEN (ARRAY[
      'Sole breadwinner diagnosed with Stage 3 cancer, family income dropped to zero overnight',
      'Single mother of 3 school-age children with utility bills and rent in arrears',
      'Elderly couple living on CPF Life only, savings depleted by recent hospitalisation',
      'Family of 5 in debt after business collapsed during economic downturn',
      'House fire destroyed all possessions; family of 4 in temporary accommodation',
      'Per capita income below ComCare threshold for 6 months, application in review'
    ])[1 + ((i-1) % 6)]
    WHEN 'Education'     THEN (ARRAY[
      'Child with dyslexia denied learning support in mainstream school despite MOE diagnosis',
      'Polytechnic student unable to continue studies after father retrenched mid-semester',
      'Requesting school transfer for child facing persistent bullying, school unresponsive',
      'Appealing PSLE result for child hospitalised during examination period',
      'Requesting school fee waiver and transport assistance for low-income family',
      'Student scholarship revoked after medical leave, appealing for reinstatement'
    ])[1 + ((i-1) % 6)]
    WHEN 'Elderly Care'  THEN (ARRAY[
      'Elderly resident living alone with no family support, unable to manage daily activities',
      'Dementia patient wandering unsafely at night, family overwhelmed and requesting care placement',
      'Elder abuse suspected by domestic helper, requesting social worker intervention urgently',
      'Elderly couple both chronically ill with no children to assist, requesting welfare help',
      '88-year-old denied mobility aid subsidy due to income assessment error',
      'Caregiver son retrenched, cannot afford mother nursing home fees, requesting subsidy'
    ])[1 + ((i-1) % 6)]
    WHEN 'Immigration'   THEN (ARRAY[
      'PR application rejected after 14 years of Singapore residency with 3 citizen children',
      'Foreign spouse Long Term Visit Pass expired during pregnancy, family in distress',
      'Requesting citizenship for child born abroad to Singapore Citizen father',
      'Elderly foreign parent on tourist pass, family requesting special long-term arrangement',
      'Employment Pass renewal rejected despite valid job offer from local company',
      'Dependant Pass holder cannot obtain Letter of Consent to work after job offer'
    ])[1 + ((i-1) % 6)]
    WHEN 'Legal'         THEN (ARRAY[
      'Domestic violence victim with 3 young children requires urgent shelter and legal protection',
      'Landlord unlawfully entered unit and refused deposit return despite proper notice given',
      'Youth criminal record preventing employment 20 years later, requesting review',
      'Intestate estate dispute after elderly parent passed, siblings in disagreement',
      'Licensed moneylender using unlawful harassment tactics despite bankruptcy order',
      'Neighbour encroached on boundary, survey inconclusive, requesting mediation support'
    ])[1 + ((i-1) % 6)]
  END AS summary,

  -- core_request: only when status is past drafting stage (same status as inserted)
  CASE WHEN status NOT IN ('new', 'triaged', 'drafting') THEN
    CASE cat
      WHEN 'Housing'       THEN 'We write on behalf of the above-named resident who is facing a serious housing crisis. The resident has been a public housing tenant in good standing for many years. We respectfully request HDB to exercise compassion and review the situation, exploring options such as rental deferment or flat transfer to help the family stabilise.'
      WHEN 'Employment'    THEN 'We write to bring the employment grievance of the above-named resident to the attention of the Ministry of Manpower. The resident has contributed honestly to Singapore''s workforce. We respectfully request MOM to prioritise the investigation and direct the employer to comply with their statutory obligations under the Employment Act.'
      WHEN 'Medical'       THEN 'We write to request urgent medical financial assistance for the above-named resident. The medical costs have far exceeded the family''s ability to pay. We respectfully request the Ministry of Health and the relevant healthcare institution to review the Medifund application with urgency and grant the maximum available subsidy.'
      WHEN 'Financial Aid' THEN 'We write to request ComCare Short-to-Medium Term Assistance for the above-named resident. The household per capita income is well below the ComCare eligibility threshold. We respectfully request MSF to expedite the assessment and disburse interim support while the full review is completed.'
      WHEN 'Education'     THEN 'We write to request educational financial assistance for the above-named student. The student has demonstrated academic potential but family circumstances have made continuation difficult. We respectfully request MOE and the institution to consider all available bursary options and to waive fees where possible.'
      WHEN 'Elderly Care'  THEN 'We write on behalf of the above-named elderly resident who requires urgent care placement. The resident has limited family support and declining health. We respectfully request the Agency for Integrated Care and MSF to expedite the care assessment and arrange interim support while formal placement is being processed.'
      WHEN 'Immigration'   THEN 'We write to appeal the immigration status of the above-named individual. This person has lived lawfully in Singapore for many years, building family and community ties. We respectfully request the Immigration and Checkpoints Authority to review this case with compassion given the exceptional personal circumstances.'
      WHEN 'Legal'         THEN 'We write to request legal aid for the above-named resident who is facing a critical legal situation requiring urgent intervention. The resident qualifies for legal aid based on income. We respectfully request the Legal Aid Bureau to prioritise this case and provide the necessary representation so the resident may access justice.'
    END
  ELSE NULL
  END AS core_request,

  -- Case number (deterministic from i, no collision risk)
  'MPS-2026-' || lpad((i + 100)::TEXT, 4, '0') AS case_number,

  -- Dates spread across last 6 months
  NOW() - (((random() * 180)::INT + 1) || ' days')::INTERVAL AS created_at,
  NOW() - (((random() * 30)::INT)      || ' days')::INTERVAL AS updated_at

FROM generated;

-- Confirm result
SELECT status, COUNT(*) AS count FROM cases GROUP BY status ORDER BY count DESC;
SELECT COUNT(*) AS total FROM cases;
