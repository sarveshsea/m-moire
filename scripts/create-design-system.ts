#!/usr/bin/env npx tsx
/**
 * Create AgenticUI Design System in Figma
 *
 * This script uses the MemoireEngine to execute Figma plugin code
 * and create design system components on the Design System page.
 */

import { readFileSync } from "fs";

// Load environment variables
const envFile = "/Users/sarveshchidambaram/Desktop/memoire/.env.local";
try {
  const content = readFileSync(envFile, "utf-8");
  content.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      const value = rest.join("=").replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  });
} catch (e) {
  console.error("Failed to load .env.local");
}

const { MemoireEngine } = await import("../src/engine/core.js");

const COLORS = {
  bg: "#0A0A0A",
  surface: "#141414",
  border: "#262626",
  textPrimary: "#FAFAFA",
  textSecondary: "#A1A1AA",
  green: "#22C55E",
  yellow: "#EAB308",
  red: "#EF4444",
  blue: "#3B82F6",
  gray: "#525252",
};

const DESIGN_SYSTEM_PAGE_ID = "6:2";

function hexToRGB(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

async function main() {
  const engine = new MemoireEngine({
    projectRoot: process.cwd(),
    figmaToken: process.env.FIGMA_TOKEN || "",
    figmaFileKey: process.env.FIGMA_FILE_KEY || "",
  });

  try {
    await engine.init();
    console.log("Mémoire engine initialized");
    console.log("Connecting to existing bridge on port 9223...");

    // Connect to the existing bridge (don't start a new server)
    const wsServer = engine.figma.wsServer;
    const client = wsServer.getActiveClient();

    if (!client) {
      console.log("No active Figma plugin connection. Waiting for plugin to connect...");
      // Wait for a plugin to connect
      await new Promise<void>((resolve) => {
        engine.figma.on("plugin-connected", () => {
          console.log("Plugin connected!");
          setTimeout(() => resolve(), 1000);
        });
      });
    } else {
      console.log("Plugin already connected");
    }

    console.log("\nCreating AgenticUI Design System...\n");

    // 1. Create Color Palette
    console.log("Creating Color Palette...");
    await createColorPalette(engine);

    // 2. Create Typography
    console.log("Creating Typography Scale...");
    await createTypography(engine);

    // 3. Create Buttons
    console.log("Creating Buttons...");
    await createButtons(engine);

    // 4. Create Inputs
    console.log("Creating Input Fields...");
    await createInputs(engine);

    // 5. Create Cards
    console.log("Creating Cards...");
    await createCards(engine);

    // 6. Create Table
    console.log("Creating Table...");
    await createTable(engine);

    // 7. Create Badges
    console.log("Creating Badges...");
    await createBadges(engine);

    // 8. Create Navigation
    console.log("Creating Navigation...");
    await createNavigation(engine);

    console.log("\n✓ Design system created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

async function createColorPalette(engine: any) {
  const bgRGB = hexToRGB(COLORS.bg);
  const surfaceRGB = hexToRGB(COLORS.surface);
  const borderRGB = hexToRGB(COLORS.border);
  const textPrimaryRGB = hexToRGB(COLORS.textPrimary);
  const textSecondaryRGB = hexToRGB(COLORS.textSecondary);
  const greenRGB = hexToRGB(COLORS.green);
  const yellowRGB = hexToRGB(COLORS.yellow);
  const redRGB = hexToRGB(COLORS.red);
  const blueRGB = hexToRGB(COLORS.blue);

  const code = `
    (async () => {
      const pageId = "${DESIGN_SYSTEM_PAGE_ID}";
      const page = figma.root.findChild(n => n.id === pageId && n.type === "PAGE");
      if (!page) return { error: "Page not found" };

      await figma.setCurrentPageAsync(page);

      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "COLOR PALETTE" && n.type === "SECTION");
      if (!section) {
        section = figma.createSection();
        section.name = "COLOR PALETTE";
        section.x = 0;
        section.y = 0;
      }

      [...section.children].forEach(c => c.remove());

      const colors = [
        { name: "Background", rgb: ${JSON.stringify(bgRGB)}, hex: "${COLORS.bg}" },
        { name: "Surface", rgb: ${JSON.stringify(surfaceRGB)}, hex: "${COLORS.surface}" },
        { name: "Border", rgb: ${JSON.stringify(borderRGB)}, hex: "${COLORS.border}" },
        { name: "Text Primary", rgb: ${JSON.stringify(textPrimaryRGB)}, hex: "${COLORS.textPrimary}" },
        { name: "Text Secondary", rgb: ${JSON.stringify(textSecondaryRGB)}, hex: "${COLORS.textSecondary}" },
        { name: "Accent Green", rgb: ${JSON.stringify(greenRGB)}, hex: "${COLORS.green}" },
        { name: "Accent Yellow", rgb: ${JSON.stringify(yellowRGB)}, hex: "${COLORS.yellow}" },
        { name: "Accent Red", rgb: ${JSON.stringify(redRGB)}, hex: "${COLORS.red}" },
        { name: "Accent Blue", rgb: ${JSON.stringify(blueRGB)}, hex: "${COLORS.blue}" },
      ];

      const itemWidth = 120, itemHeight = 80, gap = 16, colsPerRow = 3;

      colors.forEach((color, idx) => {
        const row = Math.floor(idx / colsPerRow);
        const col = idx % colsPerRow;
        const x = col * (itemWidth + gap);
        const y = row * (itemHeight + gap + 40);

        const frame = figma.createFrame();
        frame.name = color.name;
        frame.resize(itemWidth, itemHeight);
        frame.x = x;
        frame.y = y;
        frame.fills = [{ type: "SOLID", color: color.rgb }];
        frame.strokeWeight = 1;
        frame.strokes = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
        section.appendChild(frame);

        const label = figma.createText();
        label.fontSize = 10;
        label.characters = color.name.toUpperCase();
        label.fills = [{ type: "SOLID", color: ${JSON.stringify(textPrimaryRGB)} }];
        label.x = x;
        label.y = y + itemHeight + 4;
        section.appendChild(label);

        const hex = figma.createText();
        hex.fontSize = 9;
        hex.characters = color.hex;
        hex.fills = [{ type: "SOLID", color: ${JSON.stringify(textSecondaryRGB)} }];
        hex.x = x;
        hex.y = y + itemHeight + 16;
        section.appendChild(hex);
      });

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

async function createTypography(engine: any) {
  const surfaceRGB = hexToRGB(COLORS.surface);
  const borderRGB = hexToRGB(COLORS.border);
  const textPrimaryRGB = hexToRGB(COLORS.textPrimary);
  const textSecondaryRGB = hexToRGB(COLORS.textSecondary);

  const code = `
    (async () => {
      const page = figma.root.findChild(n => n.id === "${DESIGN_SYSTEM_PAGE_ID}");
      if (!page) return { error: "Page not found" };
      await figma.setCurrentPageAsync(page);
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "TYPOGRAPHY SCALE");
      if (!section) {
        section = figma.createSection();
        section.name = "TYPOGRAPHY SCALE";
        section.x = 500;
        section.y = 0;
      }
      [...section.children].forEach(c => c.remove());

      const scales = [
        { label: "H1", size: 32, lineHeight: 40, spacing: 4, uppercase: true },
        { label: "H2", size: 24, lineHeight: 32, spacing: 3, uppercase: true },
        { label: "H3", size: 18, lineHeight: 28, spacing: 2, uppercase: true },
        { label: "BODY", size: 14, lineHeight: 20, spacing: 0, uppercase: false },
        { label: "CAPTION", size: 12, lineHeight: 16, spacing: 0, uppercase: false },
        { label: "LABEL", size: 11, lineHeight: 14, spacing: 1.5, uppercase: true },
      ];

      let y = 0;
      scales.forEach((scale) => {
        const frame = figma.createFrame();
        frame.name = scale.label;
        frame.resize(400, 60);
        frame.x = 0;
        frame.y = y;
        frame.fills = [{ type: "SOLID", color: ${JSON.stringify(surfaceRGB)} }];
        frame.strokes = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
        frame.strokeWeight = 1;
        section.appendChild(frame);

        const label = figma.createText();
        label.fontSize = 10;
        label.characters = scale.label;
        label.fills = [{ type: "SOLID", color: ${JSON.stringify(textSecondaryRGB)} }];
        label.x = 8;
        label.y = 8;
        frame.appendChild(label);

        const sample = figma.createText();
        sample.fontSize = scale.size;
        sample.lineHeight = { value: scale.lineHeight, unit: "PIXELS" };
        sample.letterSpacing = { value: scale.spacing, unit: "PIXELS" };
        sample.characters = scale.uppercase ? "SAMPLE TEXT" : "Sample text";
        sample.fills = [{ type: "SOLID", color: ${JSON.stringify(textPrimaryRGB)} }];
        sample.x = 120;
        sample.y = 12;
        frame.appendChild(sample);

        y += 84;
      });

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

async function createButtons(engine: any) {
  const textPrimaryRGB = hexToRGB(COLORS.textPrimary);
  const bgRGB = hexToRGB(COLORS.bg);
  const redRGB = hexToRGB(COLORS.red);

  const code = `
    (async () => {
      const page = figma.root.findChild(n => n.id === "${DESIGN_SYSTEM_PAGE_ID}");
      if (!page) return { error: "Page not found" };
      await figma.setCurrentPageAsync(page);
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "BUTTONS");
      if (!section) {
        section = figma.createSection();
        section.name = "BUTTONS";
        section.x = 0;
        section.y = 500;
      }
      [...section.children].forEach(c => c.remove());

      const buttons = [
        { name: "Primary", bgRGB: ${JSON.stringify(textPrimaryRGB)}, textRGB: ${JSON.stringify(bgRGB)}, border: true },
        { name: "Secondary", bgRGB: null, textRGB: ${JSON.stringify(textPrimaryRGB)}, border: true },
        { name: "Ghost", bgRGB: null, textRGB: ${JSON.stringify(textPrimaryRGB)}, border: false },
        { name: "Destructive", bgRGB: null, textRGB: ${JSON.stringify(redRGB)}, border: true, borderRGB: ${JSON.stringify(redRGB)} },
      ];

      buttons.forEach((btn, idx) => {
        const frame = figma.createFrame();
        frame.name = btn.name;
        frame.resize(140, 40);
        frame.x = idx * 160;
        frame.y = 0;
        if (btn.bgRGB) frame.fills = [{ type: "SOLID", color: btn.bgRGB }];
        else frame.fills = [];
        if (btn.border) {
          frame.strokes = [{ type: "SOLID", color: btn.borderRGB || ${JSON.stringify(textPrimaryRGB)} }];
          frame.strokeWeight = 2;
        }
        section.appendChild(frame);

        const btnText = figma.createText();
        btnText.fontSize = 12;
        btnText.characters = btn.name.toUpperCase();
        btnText.fills = [{ type: "SOLID", color: btn.textRGB }];
        btnText.x = 12;
        btnText.y = 10;
        frame.appendChild(btnText);
      });

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

async function createInputs(engine: any) {
  const bgRGB = hexToRGB(COLORS.bg);
  const borderRGB = hexToRGB(COLORS.border);
  const textSecondaryRGB = hexToRGB(COLORS.textSecondary);

  const code = `
    (async () => {
      const page = figma.root.findChild(n => n.id === "${DESIGN_SYSTEM_PAGE_ID}");
      if (!page) return { error: "Page not found" };
      await figma.setCurrentPageAsync(page);
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "INPUT FIELDS");
      if (!section) {
        section = figma.createSection();
        section.name = "INPUT FIELDS";
        section.x = 750;
        section.y = 500;
      }
      [...section.children].forEach(c => c.remove());

      const inputs = [
        { name: "Text Input", placeholder: "Enter text..." },
        { name: "Number Input", placeholder: "0" },
        { name: "Search Input", placeholder: "Search..." },
        { name: "Select", placeholder: "Choose option" },
      ];

      inputs.forEach((input, idx) => {
        const frame = figma.createFrame();
        frame.name = input.name;
        frame.resize(200, 40);
        frame.x = 0;
        frame.y = idx * 50;
        frame.fills = [{ type: "SOLID", color: ${JSON.stringify(bgRGB)} }];
        frame.strokes = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
        frame.strokeWeight = 1;
        section.appendChild(frame);

        const placeholder = figma.createText();
        placeholder.fontSize = 12;
        placeholder.characters = input.placeholder;
        placeholder.fills = [{ type: "SOLID", color: ${JSON.stringify(textSecondaryRGB)} }];
        placeholder.x = 8;
        placeholder.y = 10;
        frame.appendChild(placeholder);
      });

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

async function createCards(engine: any) {
  const surfaceRGB = hexToRGB(COLORS.surface);
  const borderRGB = hexToRGB(COLORS.border);
  const textPrimaryRGB = hexToRGB(COLORS.textPrimary);
  const textSecondaryRGB = hexToRGB(COLORS.textSecondary);
  const greenRGB = hexToRGB(COLORS.green);
  const bgRGB = hexToRGB(COLORS.bg);

  const code = `
    (async () => {
      const page = figma.root.findChild(n => n.id === "${DESIGN_SYSTEM_PAGE_ID}");
      if (!page) return { error: "Page not found" };
      await figma.setCurrentPageAsync(page);
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "CARDS");
      if (!section) {
        section = figma.createSection();
        section.name = "CARDS";
        section.x = 1400;
        section.y = 500;
      }
      [...section.children].forEach(c => c.remove());

      const statCard = figma.createFrame();
      statCard.name = "Stat Card";
      statCard.resize(200, 100);
      statCard.x = 0;
      statCard.y = 0;
      statCard.fills = [{ type: "SOLID", color: ${JSON.stringify(surfaceRGB)} }];
      statCard.strokes = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
      statCard.strokeWeight = 1;
      section.appendChild(statCard);

      const statValue = figma.createText();
      statValue.fontSize = 24;
      statValue.characters = "1,234";
      statValue.fills = [{ type: "SOLID", color: ${JSON.stringify(greenRGB)} }];
      statValue.x = 8;
      statValue.y = 8;
      statCard.appendChild(statValue);

      const statLabel = figma.createText();
      statLabel.fontSize = 10;
      statLabel.characters = "SCHEDULED HRS";
      statLabel.fills = [{ type: "SOLID", color: ${JSON.stringify(textSecondaryRGB)} }];
      statLabel.x = 8;
      statLabel.y = 40;
      statCard.appendChild(statLabel);

      const statTrend = figma.createText();
      statTrend.fontSize = 12;
      statTrend.characters = "+12%";
      statTrend.fills = [{ type: "SOLID", color: ${JSON.stringify(greenRGB)} }];
      statTrend.x = 8;
      statTrend.y = 60;
      statCard.appendChild(statTrend);

      const empCard = figma.createFrame();
      empCard.name = "Employee Card";
      empCard.resize(200, 100);
      empCard.x = 220;
      empCard.y = 0;
      empCard.fills = [{ type: "SOLID", color: ${JSON.stringify(surfaceRGB)} }];
      empCard.strokes = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
      empCard.strokeWeight = 1;
      section.appendChild(empCard);

      const avatar = figma.createFrame();
      avatar.name = "Avatar";
      avatar.resize(40, 40);
      avatar.x = 8;
      avatar.y = 8;
      avatar.fills = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
      empCard.appendChild(avatar);

      const initials = figma.createText();
      initials.fontSize = 14;
      initials.characters = "JD";
      initials.fills = [{ type: "SOLID", color: ${JSON.stringify(textPrimaryRGB)} }];
      initials.x = 12;
      initials.y = 12;
      avatar.appendChild(initials);

      const empName = figma.createText();
      empName.fontSize = 11;
      empName.characters = "John Doe";
      empName.fills = [{ type: "SOLID", color: ${JSON.stringify(textPrimaryRGB)} }];
      empName.x = 56;
      empName.y = 8;
      empCard.appendChild(empName);

      const empRole = figma.createText();
      empRole.fontSize = 10;
      empRole.characters = "Engineer";
      empRole.fills = [{ type: "SOLID", color: ${JSON.stringify(textSecondaryRGB)} }];
      empRole.x = 56;
      empRole.y = 24;
      empCard.appendChild(empRole);

      const badge = figma.createFrame();
      badge.name = "Status Badge";
      badge.resize(60, 20);
      badge.x = 8;
      badge.y = 72;
      badge.fills = [{ type: "SOLID", color: ${JSON.stringify(greenRGB)} }];
      empCard.appendChild(badge);

      const badgeText = figma.createText();
      badgeText.fontSize = 9;
      badgeText.characters = "ACTIVE";
      badgeText.fills = [{ type: "SOLID", color: ${JSON.stringify(bgRGB)} }];
      badgeText.x = 12;
      badgeText.y = 5;
      badge.appendChild(badgeText);

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

async function createTable(engine: any) {
  const bgRGB = hexToRGB(COLORS.bg);
  const surfaceRGB = hexToRGB(COLORS.surface);
  const borderRGB = hexToRGB(COLORS.border);
  const textPrimaryRGB = hexToRGB(COLORS.textPrimary);

  const code = `
    (async () => {
      const page = figma.root.findChild(n => n.id === "${DESIGN_SYSTEM_PAGE_ID}");
      if (!page) return { error: "Page not found" };
      await figma.setCurrentPageAsync(page);
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "TABLE");
      if (!section) {
        section = figma.createSection();
        section.name = "TABLE";
        section.x = 0;
        section.y = 900;
      }
      [...section.children].forEach(c => c.remove());

      const tableFrame = figma.createFrame();
      tableFrame.name = "Sample Table";
      tableFrame.resize(600, 200);
      tableFrame.x = 0;
      tableFrame.y = 0;
      tableFrame.fills = [];
      section.appendChild(tableFrame);

      const headers = ["EMPLOYEE", "ROLE", "SCHEDULED", "ACTUAL", "VARIANCE"];
      const colWidths = [120, 100, 100, 100, 100];

      const headerRow = figma.createFrame();
      headerRow.name = "Header Row";
      headerRow.resize(600, 32);
      headerRow.x = 0;
      headerRow.y = 0;
      headerRow.fills = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
      tableFrame.appendChild(headerRow);

      let colX = 0;
      headers.forEach((header, idx) => {
        const cell = figma.createText();
        cell.fontSize = 10;
        cell.characters = header;
        cell.fills = [{ type: "SOLID", color: ${JSON.stringify(textPrimaryRGB)} }];
        cell.x = colX + 8;
        cell.y = 8;
        headerRow.appendChild(cell);
        colX += colWidths[idx];
      });

      const rows = [
        ["John Doe", "Engineer", "40", "42", "+2"],
        ["Jane Smith", "Manager", "40", "39", "-1"],
      ];

      rows.forEach((row, rowIdx) => {
        const dataRow = figma.createFrame();
        dataRow.name = \`Row \${rowIdx + 1}\`;
        dataRow.resize(600, 32);
        dataRow.x = 0;
        dataRow.y = 32 + rowIdx * 32;
        const bgColor = rowIdx % 2 === 0 ? ${JSON.stringify(bgRGB)} : ${JSON.stringify(surfaceRGB)};
        dataRow.fills = [{ type: "SOLID", color: bgColor }];
        dataRow.strokes = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
        dataRow.strokeWeight = 1;
        tableFrame.appendChild(dataRow);

        let cellX = 0;
        row.forEach((value, idx) => {
          const cell = figma.createText();
          cell.fontSize = 11;
          cell.characters = value;
          cell.fills = [{ type: "SOLID", color: ${JSON.stringify(textPrimaryRGB)} }];
          cell.x = cellX + 8;
          cell.y = 8;
          dataRow.appendChild(cell);
          cellX += colWidths[idx];
        });
      });

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

async function createBadges(engine: any) {
  const bgRGB = hexToRGB(COLORS.bg);
  const greenRGB = hexToRGB(COLORS.green);
  const yellowRGB = hexToRGB(COLORS.yellow);
  const redRGB = hexToRGB(COLORS.red);
  const blueRGB = hexToRGB(COLORS.blue);
  const grayRGB = hexToRGB(COLORS.gray);

  const code = `
    (async () => {
      const page = figma.root.findChild(n => n.id === "${DESIGN_SYSTEM_PAGE_ID}");
      if (!page) return { error: "Page not found" };
      await figma.setCurrentPageAsync(page);
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "BADGES");
      if (!section) {
        section = figma.createSection();
        section.name = "BADGES";
        section.x = 650;
        section.y = 900;
      }
      [...section.children].forEach(c => c.remove());

      const badges = [
        { name: "Active", rgb: ${JSON.stringify(greenRGB)} },
        { name: "Warning", rgb: ${JSON.stringify(yellowRGB)} },
        { name: "Over Budget", rgb: ${JSON.stringify(redRGB)} },
        { name: "Scheduled", rgb: ${JSON.stringify(blueRGB)} },
        { name: "Off Shift", rgb: ${JSON.stringify(grayRGB)} },
      ];

      badges.forEach((badge, idx) => {
        const frame = figma.createFrame();
        frame.name = badge.name;
        frame.resize(120, 28);
        frame.x = idx * 140;
        frame.y = 0;
        frame.fills = [{ type: "SOLID", color: badge.rgb }];
        section.appendChild(frame);

        const text = figma.createText();
        text.fontSize = 10;
        text.characters = badge.name.toUpperCase();
        text.fills = [{ type: "SOLID", color: ${JSON.stringify(bgRGB)} }];
        text.x = 8;
        text.y = 6;
        frame.appendChild(text);
      });

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

async function createNavigation(engine: any) {
  const surfaceRGB = hexToRGB(COLORS.surface);
  const borderRGB = hexToRGB(COLORS.border);
  const textPrimaryRGB = hexToRGB(COLORS.textPrimary);
  const textSecondaryRGB = hexToRGB(COLORS.textSecondary);

  const code = `
    (async () => {
      const page = figma.root.findChild(n => n.id === "${DESIGN_SYSTEM_PAGE_ID}");
      if (!page) return { error: "Page not found" };
      await figma.setCurrentPageAsync(page);
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      let section = page.findChild(n => n.name === "NAVIGATION");
      if (!section) {
        section = figma.createSection();
        section.name = "NAVIGATION";
        section.x = 1300;
        section.y = 900;
      }
      [...section.children].forEach(c => c.remove());

      const sidebar = figma.createFrame();
      sidebar.name = "Sidebar Navigation";
      sidebar.resize(200, 200);
      sidebar.x = 0;
      sidebar.y = 0;
      sidebar.fills = [{ type: "SOLID", color: ${JSON.stringify(surfaceRGB)} }];
      sidebar.strokes = [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }];
      sidebar.strokeWeight = 1;
      section.appendChild(sidebar);

      const navItems = ["DASHBOARD", "EMPLOYEES", "SHIFTS", "REPORTS"];
      navItems.forEach((item, idx) => {
        const navItem = figma.createFrame();
        navItem.name = item;
        navItem.resize(200, 40);
        navItem.x = 0;
        navItem.y = idx * 40;
        navItem.fills = idx === 0 ? [{ type: "SOLID", color: ${JSON.stringify(borderRGB)} }] : [];
        sidebar.appendChild(navItem);

        const itemText = figma.createText();
        itemText.fontSize = 11;
        itemText.characters = item;
        itemText.fills = [{ type: "SOLID", color: ${JSON.stringify(textPrimaryRGB)} }];
        itemText.x = 16;
        itemText.y = 10;
        navItem.appendChild(itemText);
      });

      const breadcrumb = figma.createFrame();
      breadcrumb.name = "Breadcrumb";
      breadcrumb.resize(300, 24);
      breadcrumb.x = 0;
      breadcrumb.y = 220;
      breadcrumb.fills = [];
      section.appendChild(breadcrumb);

      const breadcrumbText = figma.createText();
      breadcrumbText.fontSize = 11;
      breadcrumbText.characters = "DASHBOARD / EMPLOYEES / JOHN DOE";
      breadcrumbText.fills = [{ type: "SOLID", color: ${JSON.stringify(textSecondaryRGB)} }];
      breadcrumbText.x = 0;
      breadcrumbText.y = 0;
      breadcrumb.appendChild(breadcrumbText);

      return { success: true };
    })();
  `;

  await engine.figma.execute(code, 60000);
}

main();
