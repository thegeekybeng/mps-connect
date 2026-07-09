const { Client } = require('pg');

const client = new Client({
  host: process.env.POSTGRES_HOST || 'mps-postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'mps_connect',
  user: process.env.POSTGRES_USER || 'mps',
  password: process.env.POSTGRES_PASSWORD || '',
});

async function main() {
  await client.connect();

  console.log("Cleaning up database...");
  await client.query('TRUNCATE cases CASCADE');

  const constRes = await client.query("SELECT id FROM constituencies WHERE name = 'Ang Mo Kio GRC' LIMIT 1");
  const constId = constRes.rows[0]?.id || 2916;
  console.log(`Using constituency_id: ${constId}`);

  console.log("Inserting realistic test cases with unmasked database records (PII masked on client)...");

  // Case 1: HDB Flat Upgrade (Housing - Low Urgency - Single Agency: HDB)
  const case1 = await client.query(`
    INSERT INTO cases (
      constituency_id, resident_name, nric_masked, contact_phone,
      category, sub_category, urgency, status,
      summary, core_request, case_number, created_at, updated_at
    ) VALUES (
      $1, 'Tan Kok Seng', 'S1234567A', '91234567',
      'Housing', 'Flat Upgrade', 'Low', 'pending_approval',
      'Resident is requesting assistance to upgrade from a 2-room to a 3-room HDB flat due to overcrowded living conditions with his wife and 3 children.',
      'We write on behalf of the above-named resident who is currently residing in a 2-room rental flat. As the resident has 3 young children, the current living space is severely overcrowded, affecting the children''s study environment. We support the resident''s appeal to upgrade to a 3-room HDB flat to provide a conducive environment for his family.',
      'MPS-2026-0001', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'
    ) RETURNING id
  `, [constId]);
  const c1Id = case1.rows[0].id;

  await client.query(`
    INSERT INTO case_messages (case_id, role, content, is_stt, stt_duration_seconds)
    VALUES 
    ($1, 'user', 'Hello, I want to write an appeal to HDB. I live in a small 2-room rental flat with my wife and 3 kids. The kids are growing up and it''s too crowded for them to study.', false, null),
    ($1, 'assistant', 'I understand how challenging that must be. Overcrowded living spaces definitely impact studying. To help support your appeal, does your family currently have any outstanding rental arrears or other housing disputes with HDB?', false, null),
    ($1, 'user', 'No arrears, we always pay on time. We just need more space, my eldest daughter is preparing for PSLE next year and has no place to sit and write.', true, 15)
  `, [c1Id]);

  await client.query(`
    INSERT INTO letters (case_id, agency, agency_label, content, status)
    VALUES (
      $1, 'HDB', 'Housing & Development Board',
      'Dear Sir/Madam,\n\nRE: SUPPORT FOR HDB FLAT UPGRADE APPEAL - ██ RESIDENT NAME ██ (██ NRIC ██)\n\nWe write on behalf of ██ RESIDENT NAME ██, who is seeking support for his application to upgrade from a 2-room HDB rental flat to a 3-room flat.\n\n██ RESIDENT NAME ██ lives with his wife and three young school-going children. The current 2-room layout is overcrowded and no longer suitable for his growing family. We respectfully request HDB to review his housing circumstances with compassion and facilitate his upgrading appeal to support the welfare of the children.\n\nThank you for your kind consideration.\n\nYours sincerely,\nConstituency Office Representative',
      'draft'
    )
  `, [c1Id]);

  // Case 2: ComCare & Rental Arrears (Financial & Housing - Medium Urgency - Multiple Agencies: MSF & HDB)
  const case2 = await client.query(`
    INSERT INTO cases (
      constituency_id, resident_name, nric_masked, contact_phone,
      category, sub_category, urgency, status,
      summary, core_request, case_number, created_at, updated_at
    ) VALUES (
      $1, 'Fatimah Binte Ahmad', 'S7654321B', '98765432',
      'Financial Assistance', 'ComCare Application', 'Medium', 'pending_approval',
      'Resident is a single mother of three who recently lost her job. She is facing eviction due to 3 months of HDB rental arrears and requires immediate ComCare financial support.',
      'We write to support the resident''s appeal for ComCare financial assistance from MSF and a temporary deferment/waiver of rental arrears from HDB while she secures employment.',
      'MPS-2026-0002', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'
    ) RETURNING id
  `, [constId]);
  const c2Id = case2.rows[0].id;

  await client.query(`
    INSERT INTO case_messages (case_id, role, content, is_stt, stt_duration_seconds)
    VALUES 
    ($1, 'user', 'I''m in a very bad spot. I was retrenched last month, and I''m a single mom of three. HDB says I have 3 months of rental arrears and I might be evicted if I don''t pay soon. Can I get help?', false, null),
    ($1, 'assistant', 'I''m very sorry to hear about your situation. That must be incredibly stressful. We can draft appeals to HDB to temporarily defer your rental arrears and request MSF for urgent ComCare financial support. Could you upload your retrenchment letter?', false, null),
    ($1, 'user', 'Yes, I uploaded it. It''s really stressful. I just need some short term income to feed my kids while looking for another retail job. HDB rent is $120 a month but I can''t even afford that now.', true, 25)
  `, [c2Id]);

  await client.query(`
    INSERT INTO letters (case_id, agency, agency_label, content, status)
    VALUES 
    (
      $1, 'MSF', 'Ministry of Social and Family Development',
      'Dear Sir/Madam,\n\nRE: APPEAL FOR URGENT COMCARE FINANCIAL ASSISTANCE - ██ RESIDENT NAME ██ (██ NRIC ██)\n\nWe write to support the ComCare assistance application of ██ RESIDENT NAME ██. ██ RESIDENT NAME ██ is a single mother of three school-going children who was recently retrenched.\n\nWith zero household income, the family is in severe financial distress and struggling with basic daily expenses. We respectfully request MSF to expedite the ComCare assessment and disburse urgent interim financial support.\n\nThank you.\n\nYours sincerely,\nConstituency Office Representative',
      'draft'
    ),
    (
      $1, 'HDB', 'Housing & Development Board',
      'Dear Sir/Madam,\n\nRE: REQUEST FOR TEMPORARY DEFERMENT OF RENTAL ARREARS - ██ RESIDENT NAME ██ (██ NRIC ██)\n\nWe write on behalf of ██ RESIDENT NAME ██, who is currently residing in an HDB rental unit. Due to sudden retrenchment, ██ RESIDENT NAME ██ has accumulated 3 months of rental arrears.\n\nShe is currently working with MSF for financial support and is actively looking for work. We respectfully appeal to HDB to temporarily defer her rental arrears and suspend any eviction actions to allow the family time to stabilise.\n\nThank you.\n\nYours sincerely,\nConstituency Office Representative',
      'draft'
    )
  `, [c2Id]);

  // Case 3: Work Injury & CPF Dispute (Employment - Medium Urgency - Multiple Agencies: MOM & CPF)
  const case3 = await client.query(`
    INSERT INTO cases (
      constituency_id, resident_name, nric_masked, contact_phone,
      category, sub_category, urgency, status,
      summary, core_request, case_number, created_at, updated_at
    ) VALUES (
      $1, 'Subramaniam s/o Ramasamy', 'S8888888C', '90001111',
      'Employment', 'Work Injury Compensation', 'Medium', 'pending_approval',
      'Resident suffered a workplace hand injury at a construction site. The employer has refused to pay medical leave wages and also failed to deposit CPF contributions for 6 months.',
      'We write to request MOM to expedite the workplace injury compensation investigation and CPF Board to recover the missing CPF contributions from the employer.',
      'MPS-2026-0003', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'
    ) RETURNING id
  `, [constId]);
  const c3Id = case3.rows[0].id;

  await client.query(`
    INSERT INTO case_messages (case_id, role, content, is_stt, stt_duration_seconds)
    VALUES 
    ($1, 'user', 'I injured my hand at the job site last month. The doctor gave me hospitalisation leave, but my construction company refuses to pay my MC wages. Also, I realized they haven''t paid my CPF for 6 months.', false, null),
    ($1, 'assistant', 'This is a serious employment dispute. Employers are legally required to pay medical leave wages for work-related injuries under the WICA. Additionally, missing CPF contributions must be recovered. We will draft appeals to both MOM and CPF Board. Can you verify if you have reported the injury to MOM?', false, null),
    ($1, 'user', 'Yes, I have the doctor''s letters and my payslips showing zero CPF deposits. I''m unable to work right now and my hand is still in a splint. The employer told me to go back to my home country if I complain.', true, 22)
  `, [c3Id]);

  await client.query(`
    INSERT INTO letters (case_id, agency, agency_label, content, status)
    VALUES 
    (
      $1, 'MOM', 'Ministry of Manpower',
      'Dear Sir/Madam,\n\nRE: ASSISTANCE FOR WORK INJURY COMPENSATION CLAIM - ██ RESIDENT NAME ██ (██ NRIC ██)\n\nWe write to bring the workplace injury compensation dispute of ██ RESIDENT NAME ██ to the ministry''s attention. ██ RESIDENT NAME ██ sustained a hand injury on 10 March 2026 while working on-site.\n\nHis employer has refused to pay his medical leave wages and hospitalisation fees. We respectfully request MOM to investigate this matter urgently to secure his rightful compensation.\n\nThank you.\n\nYours sincerely,\nConstituency Office Representative',
      'draft'
    ),
    (
      $1, 'CPF', 'Central Provident Fund Board',
      'Dear Sir/Madam,\n\nRE: REPORT OF UNPAID CPF CONTRIBUTIONS BY EMPLOYER - ██ RESIDENT NAME ██ (██ NRIC ██)\n\nWe write on behalf of ██ RESIDENT NAME ██, who has reported that his employer has failed to deposit his monthly CPF contributions for the last 6 months.\n\nDespite repeated reminders, the employer has ignored his requests. We request CPF Board to investigate and recover the outstanding CPF contributions from the employer.\n\nThank you.\n\nYours sincerely,\nConstituency Office Representative',
      'draft'
    )
  `, [c3Id]);

  // Case 4: Healthcare Subsidy Appeal (Healthcare - Low Urgency - Single Agency: MOH)
  const case4 = await client.query(`
    INSERT INTO cases (
      constituency_id, resident_name, nric_masked, contact_phone,
      category, sub_category, urgency, status,
      summary, core_request, case_number, created_at, updated_at
    ) VALUES (
      $1, 'Lim Ah Kow', 'S2222222D', '95554444',
      'Healthcare', 'Medifund Application', 'Low', 'pending_approval',
      'Elderly resident requires expensive long-term kidney medication. His Medifund allocation has been depleted, and he cannot afford the monthly bills.',
      'We write to appeal to MOH/hospital for medication subsidies or a renewal of Medifund coverage on compassionate grounds.',
      'MPS-2026-0004', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'
    ) RETURNING id
  `, [constId]);
  const c4Id = case4.rows[0].id;

  await client.query(`
    INSERT INTO case_messages (case_id, role, content, is_stt, stt_duration_seconds)
    VALUES 
    ($1, 'user', 'I am elderly and sick. Need help with kidney medicine. Medifund is finished already, cannot pay next month.', true, 10),
    ($1, 'assistant', 'I understand, medical costs are a huge concern. We will write to MOH and SGH to request a Medifund extension or extra drug subsidies. Do you reside with any family members who can support you?', false, null),
    ($1, 'user', 'Live with my son but he is also working part-time and has low pay, cannot help much. I am very worried about my treatments.', false, null)
  `, [c4Id]);

  await client.query(`
    INSERT INTO letters (case_id, agency, agency_label, content, status)
    VALUES (
      $1, 'MOH', 'Ministry of Health',
      'Dear Sir/Madam,\n\nRE: SUPPORT FOR MEDIFUND SUBSIDY APPEAL - ██ RESIDENT NAME ██ (██ NRIC ██)\n\nWe write to support the appeal of ██ RESIDENT NAME ██ for additional medical subsidies at Singapore General Hospital.\n\n██ RESIDENT NAME ██ is a retired elderly resident requiring long-term medication for kidney disease. His Medifund allocation is fully depleted and his family has no additional funds. We appeal to MOH and the medical social workers to grant a Medifund top-up or separate medication subsidies to ensure his treatment is not disrupted.\n\nThank you for your help.\n\nYours sincerely,\nConstituency Office Representative',
      'draft'
    )
  `, [c4Id]);

  // Case 5: ICA LTVP Renewal Appeal (Immigration - Medium Urgency - Single Agency: ICA)
  const case5 = await client.query(`
    INSERT INTO cases (
      constituency_id, resident_name, nric_masked, contact_phone,
      category, sub_category, urgency, status,
      summary, core_request, case_number, created_at, updated_at
    ) VALUES (
      $1, 'Maria Lopez', 'T5555555E', '81112222',
      'Immigration', 'LTVP Renewal', 'Medium', 'pending_approval',
      'Foreign spouse of Singapore Citizen appeals for the renewal of her Long Term Visit Pass (LTVP) which is expiring next month. They have a young child who is a Singapore citizen.',
      'We appeal to ICA to renew the LTVP on compassionate grounds to keep the family together.',
      'MPS-2026-0005', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'
    ) RETURNING id
  `, [constId]);
  const c5Id = case5.rows[0].id;

  await client.query(`
    INSERT INTO case_messages (case_id, role, content, is_stt, stt_duration_seconds)
    VALUES 
    ($1, 'user', 'Hi, I am foreign spouse of Singapore citizen. My LTVP is expiring next month and we applied for renewal but it''s still pending. We have a 2-year-old child who is Singaporean.', false, null),
    ($1, 'assistant', 'We can support an appeal to ICA to expedite the renewal of your Long Term Visit Pass (LTVP) to avoid any disruption to your child''s care. Do you have the application reference number?', false, null),
    ($1, 'user', 'Yes, the reference number is LTVP-2026-99321. I''m afraid that if it''s not renewed, I''ll have to leave my baby here.', true, 14)
  `, [c5Id]);

  await client.query(`
    INSERT INTO letters (case_id, agency, agency_label, content, status)
    VALUES (
      $1, 'ICA', 'Immigration & Checkpoints Authority',
      'Dear Sir/Madam,\n\nRE: APPEAL FOR LTVP RENEWAL - ██ RESIDENT NAME ██ (██ NRIC ██)\n\nWe write to support the Long Term Visit Pass (LTVP) renewal appeal of ██ RESIDENT NAME ██, spouse of Singapore Citizen Mr. Tan Boon Hean.\n\nTheir LTVP is expiring next month, and their application is currently in progress. The couple has a young 2-year-old child who is a Singapore Citizen. To ensure family unity and prevent childcare disruptions, we respectfully appeal to ICA to renew Mdm. Maria''s LTVP.\n\nThank you for your compassionate review.\n\nYours sincerely,\nConstituency Office Representative',
      'draft'
    )
  `, [c5Id]);

  // Create additional visit history for Tan Kok Seng (Housing - low, and Financial - closed)
  console.log("Seeding historical cases for Tan Kok Seng...");
  const oldCase = await client.query(`
    INSERT INTO cases (
      constituency_id, resident_name, nric_masked, contact_phone,
      category, sub_category, urgency, status,
      summary, core_request, case_number, created_at, updated_at
    ) VALUES (
      $1, 'Tan Kok Seng', 'S1234567A', '91234567',
      'Financial Assistance', 'Rental Assistance', 'Medium', 'closed',
      'Historical Case: Resident appealed for financial assistance to pay off conservancy charges and rental arrears.',
      'We write to MSF to support the resident''s application for conservancy rebate and cash grant support.',
      'MPS-2025-0044', NOW() - INTERVAL '1 year', NOW() - INTERVAL '11 months'
    ) RETURNING id
  `, [constId]);
  const ocId = oldCase.rows[0].id;

  await client.query(`
    INSERT INTO case_events (case_id, actor_id, actor_role, action, detail)
    VALUES 
    ($1, NULL, 'system', 'agency_response_received', '{"agency":"MSF","outcome":"Approved","reason":"MSF has granted ComCare short-term relief of $300/month for 3 months."}'),
    ($1, NULL, 'system', 'case_closed', '{"reason":"ComCare assistance approved and rental arrears cleared. Case closed."}')
  `, [ocId]);

  // Create additional visit history for Fatimah Binte Ahmad (closed ComCare case)
  console.log("Seeding historical cases for Fatimah Binte Ahmad...");
  const oldCase2 = await client.query(`
    INSERT INTO cases (
      constituency_id, resident_name, nric_masked, contact_phone,
      category, sub_category, urgency, status,
      summary, core_request, case_number, created_at, updated_at
    ) VALUES (
      $1, 'Fatimah Binte Ahmad', 'S7654321B', '98765432',
      'Social Welfare', 'ComCare Appeal', 'High', 'closed',
      'Historical Case: Resident appealed for ComCare renewal and school subsidy.',
      'We write to MSF and MOE to support the ComCare renewal and MOE FAS scheme application.',
      'MPS-2025-0102', NOW() - INTERVAL '1.5 years', NOW() - INTERVAL '1.4 years'
    ) RETURNING id
  `, [constId]);
  const oc2Id = oldCase2.rows[0].id;

  await client.query(`
    INSERT INTO case_events (case_id, actor_id, actor_role, action, detail)
    VALUES 
    ($1, NULL, 'system', 'agency_response_received', '{"agency":"MSF","outcome":"Partially Granted","reason":"MSF approved a partial ComCare payout extension."}'),
    ($1, NULL, 'system', 'agency_response_received', '{"agency":"MOE","outcome":"Approved","reason":"MOE has granted FAS subsidy for the children."}'),
    ($1, NULL, 'system', 'case_closed', '{"reason":"Agency replies received. ComCare and MOE subsidies confirmed. Case closed."}')
  `, [oc2Id]);

  console.log("Setting PDPA consent and retention timestamps...");
  await client.query(`
    UPDATE cases 
    SET consent_given_at = NOW(), 
        retention_expires_at = NOW() + INTERVAL '5 years'
  `);

  console.log("Successfully seeded 5 realistic cases with unmasked data, transcripts, and visit histories!");

  await client.end();
}

main().catch(console.error);
