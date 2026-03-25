import { MemoireEngine } from "../src/engine/core.js";

async function main() {
  const engine = new MemoireEngine({
    projectRoot: process.cwd(),
    figmaToken: process.env.FIGMA_TOKEN,
    figmaFileKey: process.env.FIGMA_FILE_KEY,
  });

  await engine.init();

  const port = await engine.connectFigma();
  console.log("Bridge started on port:", port);
  console.log("Waiting for plugin to reconnect...");

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("No plugin connected within 30s")), 30000);
    engine.figma.on("plugin-connected", () => {
      clearTimeout(timeout);
      // Small delay to let plugin fully handshake
      setTimeout(() => resolve(), 1000);
    });
    if (engine.figma.isConnected) {
      clearTimeout(timeout);
      resolve();
    }
  });

  console.log("Plugin connected! Creating pages...");

  const result = await engine.figma.execute(`
    // Check if pages already exist
    const existingNames = figma.root.children.map(p => p.name);

    // Rename first page to Cover if it's still "Page 1"
    if (figma.root.children[0].name === "Page 1") {
      figma.root.children[0].name = "Cover";
    }

    const pageNames = [
      "Design System",
      "Auth — Login / Signup / Onboarding",
      "Dashboard — Overview",
      "Schedule Builder",
      "Labor Forecasting",
      "Budget Planning",
      "Employee Management",
      "Timesheets & Attendance",
      "Reports & Analytics",
      "Settings & Integrations",
      "Notifications & Alerts",
      "Mobile Views"
    ];

    const created = [];
    for (const name of pageNames) {
      if (!existingNames.includes(name)) {
        const page = figma.createPage();
        page.name = name;
        created.push({ id: page.id, name: page.name });
      }
    }

    return {
      totalPages: figma.root.children.length,
      newPages: created.length,
      pages: figma.root.children.map(p => ({ id: p.id, name: p.name }))
    };
  `, 30000);

  console.log("SUCCESS:", JSON.stringify(result, null, 2));

  // Keep server alive briefly so plugin stays connected
  await new Promise(r => setTimeout(r, 2000));
  await engine.figma.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
