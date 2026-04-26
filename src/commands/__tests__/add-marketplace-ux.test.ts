import { describe, expect, it } from "vitest";

import {
  buildMarketplaceAddHints,
  buildUsageSnippet,
  rankComponentSuggestions,
} from "../add.js";

describe("add marketplace UX helpers", () => {
  it("builds component usage snippets for installed marketplace components", () => {
    expect(buildUsageSnippet("ChatComposer")).toContain(
      `import { ChatComposer } from "@/components/memoire/ChatComposer"`,
    );
    expect(buildUsageSnippet("ChatComposer")).toContain("<ChatComposer");
    expect(buildUsageSnippet("UnknownThing")).toContain("<UnknownThing />");
  });

  it("adds package, source, and token-install hints from catalog aliases", async () => {
    const hints = await buildMarketplaceAddHints("ai-chat", "ChatComposer", false);
    expect(hints.packageUrl).toBe("https://www.npmjs.com/package/@memoire-examples/ai-chat");
    expect(hints.sourceUrl).toContain("examples/presets/ai-chat");
    expect(hints.tokenInstallCommand).toBe("memi add ChatComposer --from ai-chat --tokens");
  });

  it("omits token hints when tokens were already requested", async () => {
    const hints = await buildMarketplaceAddHints("auth-flow", "AuthCard", true);
    expect(hints.tokenInstallCommand).toBeUndefined();
  });

  it("ranks available component suggestions", () => {
    expect(rankComponentSuggestions(["Button", "ChatComposer", "ChatMessage", "Card"], "Chat")).toEqual([
      "ChatComposer",
      "ChatMessage",
      "Card",
      "Button",
    ]);
  });
});
