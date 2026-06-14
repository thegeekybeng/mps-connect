# MPS Connect — Data Breach Response Plan
> PDPA §26D — Mandatory Breach Notification
> Updated: 2026-06-15

## 1. Scope

This plan covers all personal data processed by MPS Connect:
- Resident names, postal codes, phone numbers
- Case descriptions and conversation transcripts
- AI-generated letters and case metadata
- Staff user accounts (email, name, role)

## 2. Designated Data Protection Officer (DPO)

| Field | Value |
|-------|-------|
| **Name** | Andrew Yeo |
| **Role** | System Developer & Operator |
| **Contact** | Via constituency office |

> **Action required:** For production deployment, the constituency office must designate a DPO from the MP's staff.

## 3. What Constitutes a Notifiable Breach

Under PDPA §26D, a breach is notifiable if:
- It involves **500+ individuals**, OR
- It involves **sensitive personal data** (NRIC, financial, health, biometric), OR
- It is likely to result in **significant harm** to affected individuals

## 4. Breach Detection

### Automated Detection
| Signal | Source | Action |
|--------|--------|--------|
| Canary token triggered | AI proxy audit log (`SECURITY_CANARY_TRIGGERED`) | Investigate prompt extraction attempt |
| Encoded injection detected | AI proxy audit log (`ENCODED_INJECTION_DETECTED`) | Block and investigate |
| Origin blocked | AI proxy audit log (`BLOCKED_ORIGIN`) | Check for unauthorized access |
| Audit chain broken | `verifyChain()` returns `{ ok: false }` | Investigate tampering |
| Unusual login patterns | `users.last_seen_at` — off-hours, rapid succession | Investigate credential compromise |

### Manual Detection
- Staff reports suspicious activity
- External notification from third party
- Routine security review discovers anomaly

## 5. Response Timeline (PDPA §26D)

```
T+0h    Breach detected
         ↓
T+1h    Incident commander notified (DPO)
         ↓
T+4h    Initial assessment complete:
         - What data was exposed?
         - How many individuals affected?
         - Is the breach still active?
         ↓
T+12h   Containment actions executed:
         - AI_KILL_SWITCH=true if AI systems compromised
         - Rotate affected credentials
         - Isolate affected containers
         ↓
T+24h   Impact assessment finalised:
         - Total individuals affected
         - Categories of data exposed
         - Whether breach meets notification threshold
         ↓
T+72h   PDPC notification submitted (if notifiable)
         (3 calendar days from awareness)
         ↓
T+72h   Affected individuals notified (if required)
         ↓
T+14d   Root cause analysis complete
         ↓
T+30d   Remediation verified and documented
```

## 6. Containment Playbook

### AI System Compromise
```bash
# 1. Activate kill switch — stops all AI processing
echo "AI_KILL_SWITCH=true" >> ./.env
docker compose restart mps-ai-proxy

# 2. Verify kill switch is active
docker logs mps-ai-proxy 2>&1 | grep "KILL SWITCH"

# 3. Preserve audit trail
docker cp mps-ai-proxy:/data/audit.db ./audit_backup_$(date +%Y%m%d_%H%M).db
```

### Database Compromise
```bash
# 1. Rotate PostgreSQL password
# Update .env with new POSTGRES_PASSWORD
# Restart all services

# 2. Backup current database
docker exec mps-postgres pg_dump -U mps mps_connect > ./db_backup_$(date +%Y%m%d_%H%M).sql

# 3. Check audit chain integrity
docker exec mps-ai-proxy node -e "const {verifyChain}=require('./audit');console.log(JSON.stringify(verifyChain()))"
```

### Container/Host Compromise
```bash
# 1. Stop all MPS Connect services
docker compose down

# 2. Inspect container logs
docker logs mps-connect 2>&1 | tail -500 > /tmp/mps_incident_$(date +%Y%m%d).log
docker logs mps-ai-proxy 2>&1 | tail -500 >> /tmp/mps_incident_$(date +%Y%m%d).log
```

## 7. PDPC Notification Template

```
To: PDPC (Personal Data Protection Commission)
Subject: Mandatory Data Breach Notification — MPS Connect

1. Organisation: [Constituency Office Name]
2. DPO: [Name, Contact]
3. Date of breach awareness: [Date]
4. Nature of breach: [Unauthorized access / Data exposure / System compromise]
5. Personal data affected: [Categories]
6. Number of individuals affected: [Count]
7. Potential harm: [Description]
8. Containment actions taken: [List]
9. Remediation timeline: [Plan]
```

## 8. Post-Incident Review

After every breach (notifiable or not):
1. Document root cause in `docs/incidents/` with date-stamped filename
2. Update this plan if gaps are found
3. Review with constituency office staff
4. Update relevant governance rules per PC2E protocol

## 9. Testing

This plan should be tested annually:
- [ ] Tabletop exercise with DPO (scenario-based)
- [ ] Kill switch activation and recovery test
- [ ] Audit chain verification test
- [ ] PDPC notification template review
