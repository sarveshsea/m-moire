# Mémoire Security Review Summary

**Date:** March 23, 2026
**Reviewer:** Security Analysis
**Status:** 8 findings identified (2 CRITICAL, 3 HIGH, 3 MEDIUM)

---

## Quick Overview

The Mémoire codebase is a TypeScript-based AI design intelligence engine with solid foundational security practices (Zod validation, environment variable isolation, no hardcoded secrets). However, two CRITICAL vulnerabilities related to code execution and code generation require immediate remediation.

### Key Files Reviewed

- ✅ `/plugin/code.js` — Plugin sandbox & code execution (CRITICAL ISSUE)
- ✅ `/src/commands/dashboard.ts` — HTML generation (HIGH ISSUE)
- ✅ `/src/figma/ws-server.ts` — WebSocket server (HIGH + MEDIUM ISSUES)
- ✅ `/src/engine/registry.ts` — File operations (HIGH ISSUE)
- ✅ `/src/codegen/prototype-exporter.ts` — Code generation (CRITICAL ISSUE)
- ✅ `/src/index.ts` — Configuration handling (MEDIUM ISSUE)

---

## Findings By Severity

### CRITICAL (2) — Must Fix Before Production

| # | Title | File | Risk | Time |
|---|-------|------|------|------|
| 1 | Plugin Blocklist Insufficient | `plugin/code.js` | RCE via string obfuscation | 2-3h |
| 2 | Prototype Code Injection | `src/codegen/prototype-exporter.ts` | RCE via unescaped strings | 2-3h |

**Recommendation:** Pause production deployment. Fix immediately. These enable remote code execution.

### HIGH (3) — Fix Within 1 Sprint

| # | Title | File | Risk | Time |
|---|-------|------|------|------|
| 3 | Rate Limiting Missing | `src/figma/ws-server.ts` | DoS attack | 1-2h |
| 4 | Path Traversal Risk | `src/engine/registry.ts` | File system escape | 1h |
| 5 | Dashboard XSS | `src/commands/dashboard.ts` | DOM injection | 1-2h |

**Recommendation:** Fix within current sprint. Mitigate business risk.

### MEDIUM (3) — Fix Within 2 Weeks

| # | Title | File | Risk | Time |
|---|-------|------|------|------|
| 6 | WebSocket CORS Bypass | `src/figma/ws-server.ts` | Info disclosure | 30min |
| 7 | Env Var Exposure | `src/index.ts` | Secret leak in logs | 30min |
| 8 | Numeric Injection | `src/codegen/prototype-exporter.ts` | Code quality | 15min |

**Recommendation:** Include in next maintenance release.

---

## Exploitation Scenarios

### Scenario 1: Plugin RCE (CRITICAL)

**Attack:** Attacker compromises Mémoire engine to send malicious code to Figma plugin.

```javascript
// Blocklist bypass: string obfuscation
code = "const method = 'close' + 'Plugin'; figma[method]();"
// Current blocklist: /figma\.closePlugin/i — DOESN'T MATCH
```

**Impact:** Access to Figma design data, ability to modify documents, delete files.

**Fix:** Replace blocklist with allowlist of safe read-only APIs.

---

### Scenario 2: Prototype Exporter RCE (CRITICAL)

**Attack:** Malicious spec with crafted URL/selector values in prototype config.

```javascript
scene.url = "http://localhost:3000'); require('child_process').exec('rm -rf /'); //";
// Generates invalid Playwright code that executes shell commands
```

**Impact:** Complete compromise of developer machine running Playwright tests.

**Fix:** Escape all user input before insertion into generated code.

---

### Scenario 3: WebSocket Flood (HIGH)

**Attack:** Malicious Figma plugin sends thousands of large messages per second.

```javascript
for (let i = 0; i < 10000; i++) {
  ws.send(JSON.stringify({type: "sync-data", part: "large", result: {...huge}}));
}
```

**Impact:** Server memory exhaustion, CPU spike, disconnection of legitimate users.

**Fix:** Implement per-client rate limiting (1000 msgs/min, 100MB/min).

---

## OWASP Top 10 Mapping

| OWASP # | Category | Status | Finding |
|---------|----------|--------|---------|
| A01 | Injection | HIGH RISK | Plugin & Prototype code injection |
| A02 | Auth Weakness | SAFE | Token via env var (correct) |
| A03 | Sensitive Data | MEDIUM RISK | Env vars might leak in error logs |
| A04 | Access Control | MEDIUM RISK | Missing WebSocket origin validation |
| A05 | Misconfiguration | SAFE | TypeScript strict mode, no defaults |
| A06 | Vulnerable Components | UNKNOWN | Run `npm audit` for deps |
| A07 | XSS | HIGH RISK | Dashboard HTML escaping incomplete |
| A08 | Deserialization | SAFE | JSON.parse() with Zod validation |
| A09 | Insufficient Logging | SAFE | Pino logging configured |
| A10 | Known Vulnerabilities | UNKNOWN | Requires npm audit check |

---

## Implementation Roadmap

### Phase 1: CRITICAL (This Week)

**Priority:** Must complete before production deployment

**Tasks:**
1. Implement allowlist-based plugin code execution (2-3h)
2. Add escaping utilities for prototype code generation (2-3h)
3. Comprehensive testing with malicious payloads (2h)
4. Code review and merge (1h)

**Total:** 7-9 hours

**Blockers:** None (no dependency changes required)

---

### Phase 2: HIGH (This Sprint)

**Priority:** Mitigate DoS and path traversal risks

**Tasks:**
1. Implement WebSocket rate limiting (1-2h)
2. Add spec name validation (1h)
3. Complete dashboard escaping audit (1-2h)
4. Test all three fixes (2h)

**Total:** 5-6 hours

---

### Phase 3: MEDIUM (Next 2 Weeks)

**Priority:** Hardening and best practices

**Tasks:**
1. Add WebSocket origin validation (30min)
2. Implement config sanitization for logs (30min)
3. Add numeric input validation (15min)
4. Update security documentation (1h)

**Total:** 2-3 hours

---

## File Locations & Quick Fixes

### 1. Plugin Code Execution
- **File:** `/Users/sarveshchidambaram/Desktop/memoire/plugin/code.js`
- **Lines:** 184-214
- **Quick Fix:** See `SECURITY_FIXES.md` → Plugin Code Execution section

### 2. Prototype Code Injection
- **File:** `/Users/sarveshchidambaram/Desktop/memoire/src/codegen/prototype-exporter.ts`
- **Lines:** 82, 101-117
- **Quick Fix:** See `SECURITY_FIXES.md` → Prototype Exporter Code Injection section

### 3. WebSocket Rate Limiting
- **File:** `/Users/sarveshchidambaram/Desktop/memoire/src/figma/ws-server.ts`
- **Lines:** 270-287
- **Quick Fix:** See `SECURITY_FIXES.md` → WebSocket Rate Limiting section

### 4. Spec Name Validation
- **File:** `/Users/sarveshchidambaram/Desktop/memoire/src/engine/registry.ts`
- **Lines:** 129-141
- **Quick Fix:** See `SECURITY_FIXES.md` → Spec Name Validation section

### 5. Dashboard Escaping
- **File:** `/Users/sarveshchidambaram/Desktop/memoire/src/commands/dashboard.ts`
- **Lines:** 10-18, 528-531, 545-550
- **Quick Fix:** Review current escaping and add context-aware escaping utilities

### 6. WebSocket Origin Check
- **File:** `/Users/sarveshchidambaram/Desktop/memoire/src/figma/ws-server.ts`
- **Lines:** 224-230
- **Quick Fix:** See `SECURITY_FIXES.md` → WebSocket Origin Validation section

### 7. Env Var Sanitization
- **File:** `/Users/sarveshchidambaram/Desktop/memoire/src/index.ts` & logger
- **Quick Fix:** See `SECURITY_FIXES.md` → Environment Variable Sanitization section

---

## Positive Security Findings

✅ **Well-Designed Patterns:**
- Zod validation framework used throughout
- Environment variables for secrets (no hardcoded values)
- TypeScript strict mode enabled
- Proper use of `path.join()` for file operations
- Async/await error handling
- WebSocket ping monitoring
- Atomic file writes (write-then-rename)
- JSON messaging (safer than custom protocols)

✅ **Architecture Strengths:**
- Plugin runs in Figma's native sandbox (additional layer)
- Code generation produces static files (no eval at runtime)
- Registry isolates design data from file system
- Separate concerns (bridge, codegen, registry)

---

## Testing Strategy

### Automated Tests to Add

```bash
# Run security-focused test suite
npm test -- --grep "security|injection|xss|traversal|rate.*limit"
```

### Manual Testing Checklist

- [ ] Plugin code execution with obfuscated payloads
- [ ] Prototype exporter with malicious URLs/selectors
- [ ] WebSocket rate limiting under load
- [ ] File system operations with special characters
- [ ] Dashboard rendering with XSS payloads

### Penetration Testing

- [ ] Run ESLint with security rules: `npx eslint . --plugin security`
- [ ] Review dependencies: `npm audit`
- [ ] Check for secrets: `npm install --save-dev detect-secrets`

---

## References

**Security Standards:**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- CWE Mapping: https://cwe.mitre.org/

**Specific Guides:**
- Code Injection Prevention: https://owasp.org/www-community/attacks/Code_Injection
- XSS Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- Path Traversal: https://owasp.org/www-community/attacks/Path_Traversal

**Tools:**
- ESLint Plugin Security: https://github.com/nodesecurity/eslint-plugin-security
- SNYK: https://snyk.io/
- Burp Suite Community: https://portswigger.net/burp/communitydownload

---

## Sign-Off

**Review Status:** Complete
**Severity Assessment:** 2 CRITICAL require immediate action
**Recommendation:** Do not deploy to production without addressing CRITICAL issues

**Next Steps:**
1. Assign developer to CRITICAL fixes (Priority: Highest)
2. Schedule code review (4h)
3. Execute Phase 1 this week
4. Phase 2 during current sprint
5. Phase 3 in maintenance cycle

---

**Document Files:**
- `SECURITY_REVIEW.md` — Full detailed analysis
- `SECURITY_FIXES.md` — Implementation guide with code examples
- `SECURITY_SUMMARY.md` — This file (executive summary)
