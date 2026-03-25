import { MemoireEngine } from "../src/engine/core.js";

// ── Helpers ──────────────────────────────────────────
function hex(h: string) {
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  return `{r:${r},g:${g},b:${b}}`;
}

const C = {
  bg: "#0A0A0A", surface: "#141414", border: "#262626",
  text: "#FAFAFA", textSec: "#A1A1AA",
  green: "#22C55E", yellow: "#EAB308", red: "#EF4444", blue: "#3B82F6",
  white: "#FFFFFF", black: "#000000",
};

async function main() {
  const engine = new MemoireEngine({
    projectRoot: process.cwd(),
    figmaToken: process.env.FIGMA_TOKEN,
    figmaFileKey: process.env.FIGMA_FILE_KEY,
  });
  await engine.init();
  const port = await engine.connectFigma();
  console.log("Bridge on port:", port);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("No plugin within 45s")), 45000);
    engine.figma.on("plugin-connected", () => {
      clearTimeout(timeout);
      setTimeout(() => resolve(), 1500);
    });
    if (engine.figma.isConnected) { clearTimeout(timeout); resolve(); }
  });

  console.log("Connected! Building design system...");

  // ── 1. Setup: Navigate to Design System page, clear it ──
  console.log("1/8 Setting up Design System page...");
  await engine.figma.execute(`
    const dsPage = figma.root.children.find(p => p.name === "Design System");
    if (!dsPage) throw new Error("Design System page not found");
    await figma.setCurrentPageAsync(dsPage);
    // Clear existing content
    for (const child of [...dsPage.children]) { child.remove(); }
    return { page: dsPage.name, cleared: true };
  `, 15000);

  // ── 2. Color Palette ──────────────────────────────────
  console.log("2/8 Creating Color Palette...");
  await engine.figma.execute(`
    const colors = [
      { name: "BACKGROUND", hex: "${C.bg}", rgb: ${hex(C.bg)} },
      { name: "SURFACE", hex: "${C.surface}", rgb: ${hex(C.surface)} },
      { name: "BORDER", hex: "${C.border}", rgb: ${hex(C.border)} },
      { name: "TEXT PRIMARY", hex: "${C.text}", rgb: ${hex(C.text)} },
      { name: "TEXT SECONDARY", hex: "${C.textSec}", rgb: ${hex(C.textSec)} },
      { name: "ACCENT GREEN", hex: "${C.green}", rgb: ${hex(C.green)} },
      { name: "ACCENT YELLOW", hex: "${C.yellow}", rgb: ${hex(C.yellow)} },
      { name: "ACCENT RED", hex: "${C.red}", rgb: ${hex(C.red)} },
      { name: "ACCENT BLUE", hex: "${C.blue}", rgb: ${hex(C.blue)} },
    ];

    const section = figma.createSection();
    section.name = "COLOR PALETTE";
    section.x = 0; section.y = 0;
    section.resizeWithoutConstraints(1200, 280);

    let x = 40;
    for (const c of colors) {
      // Swatch
      const swatch = figma.createRectangle();
      swatch.name = c.name;
      swatch.x = x; swatch.y = 60;
      swatch.resize(100, 100);
      swatch.cornerRadius = 8;
      swatch.fills = [{ type: "SOLID", color: c.rgb }];
      swatch.strokes = [{ type: "SOLID", color: ${hex(C.border)} }];
      swatch.strokeWeight = 1;
      section.appendChild(swatch);

      // Label
      const label = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      label.fontName = { family: "Inter", style: "Medium" };
      label.fontSize = 10;
      label.characters = c.name;
      label.letterSpacing = { value: 1.5, unit: "PIXELS" };
      label.fills = [{ type: "SOLID", color: ${hex(C.text)} }];
      label.x = x; label.y = 175;
      section.appendChild(label);

      // Hex value
      const hexLabel = figma.createText();
      hexLabel.fontName = { family: "Inter", style: "Regular" };
      hexLabel.fontSize = 11;
      hexLabel.characters = c.hex;
      hexLabel.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
      hexLabel.x = x; hexLabel.y = 195;
      section.appendChild(hexLabel);

      x += 125;
    }
    return { section: "COLOR PALETTE", swatches: colors.length };
  `, 30000);

  // ── 3. Typography Scale ───────────────────────────────
  console.log("3/8 Creating Typography Scale...");
  await engine.figma.execute(`
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    const section = figma.createSection();
    section.name = "TYPOGRAPHY SCALE";
    section.x = 0; section.y = 320;
    section.resizeWithoutConstraints(1200, 500);

    const styles = [
      { name: "H1", size: 32, style: "Bold", spacing: 4, text: "LABOR BUDGET OVERVIEW", upper: true },
      { name: "H2", size: 24, style: "Bold", spacing: 3, text: "SCHEDULE BUILDER", upper: true },
      { name: "H3", size: 18, style: "Medium", spacing: 2, text: "EMPLOYEE MANAGEMENT", upper: true },
      { name: "BODY", size: 14, style: "Regular", spacing: 0, text: "Weekly labor costs are tracking 12% under budget for Q1.", upper: false },
      { name: "CAPTION", size: 12, style: "Regular", spacing: 0, text: "Last updated 3 minutes ago", upper: false },
      { name: "LABEL", size: 11, style: "Medium", spacing: 1.5, text: "TOTAL HOURS", upper: true },
    ];

    let y = 50;
    for (const s of styles) {
      // Style name label
      const nameLabel = figma.createText();
      nameLabel.fontName = { family: "Inter", style: "Medium" };
      nameLabel.fontSize = 10;
      nameLabel.characters = s.name + "  —  " + s.size + "PX";
      nameLabel.letterSpacing = { value: 1.5, unit: "PIXELS" };
      nameLabel.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
      nameLabel.x = 40; nameLabel.y = y;
      section.appendChild(nameLabel);

      // Sample text
      const sample = figma.createText();
      sample.fontName = { family: "Inter", style: s.style };
      sample.fontSize = s.size;
      sample.characters = s.text;
      if (s.spacing > 0) sample.letterSpacing = { value: s.spacing, unit: "PIXELS" };
      sample.fills = [{ type: "SOLID", color: s.name === "CAPTION" ? ${hex(C.textSec)} : ${hex(C.text)} }];
      sample.x = 40; sample.y = y + 18;
      section.appendChild(sample);

      y += s.size + 50;
    }
    return { section: "TYPOGRAPHY", styles: styles.length };
  `, 30000);

  // ── 4. Buttons ────────────────────────────────────────
  console.log("4/8 Creating Buttons...");
  await engine.figma.execute(`
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });

    const section = figma.createSection();
    section.name = "BUTTONS";
    section.x = 0; section.y = 860;
    section.resizeWithoutConstraints(1200, 200);

    const buttons = [
      { name: "PRIMARY", bg: ${hex(C.white)}, text: ${hex(C.black)}, border: null },
      { name: "SECONDARY", bg: null, text: ${hex(C.white)}, border: ${hex(C.border)} },
      { name: "GHOST", bg: null, text: ${hex(C.white)}, border: null },
      { name: "DESTRUCTIVE", bg: null, text: ${hex(C.red)}, border: ${hex(C.red)} },
    ];

    let x = 40;
    for (const b of buttons) {
      const frame = figma.createFrame();
      frame.name = "Button / " + b.name;
      frame.x = x; frame.y = 60;
      frame.resize(160, 44);
      frame.cornerRadius = 6;
      frame.layoutMode = "HORIZONTAL";
      frame.primaryAxisAlignItems = "CENTER";
      frame.counterAxisAlignItems = "CENTER";
      frame.paddingLeft = 24; frame.paddingRight = 24;
      frame.paddingTop = 12; frame.paddingBottom = 12;

      if (b.bg) {
        frame.fills = [{ type: "SOLID", color: b.bg }];
      } else {
        frame.fills = [];
      }
      if (b.border) {
        frame.strokes = [{ type: "SOLID", color: b.border }];
        frame.strokeWeight = 1;
      }

      const label = figma.createText();
      label.fontName = { family: "Inter", style: "Medium" };
      label.fontSize = 13;
      label.characters = b.name;
      label.letterSpacing = { value: 1.5, unit: "PIXELS" };
      label.fills = [{ type: "SOLID", color: b.text }];
      label.textAlignHorizontal = "CENTER";
      frame.appendChild(label);

      section.appendChild(frame);
      x += 200;
    }
    return { section: "BUTTONS", count: buttons.length };
  `, 30000);

  // ── 5. Input Fields ───────────────────────────────────
  console.log("5/8 Creating Input Fields...");
  await engine.figma.execute(`
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });

    const section = figma.createSection();
    section.name = "INPUT FIELDS";
    section.x = 0; section.y = 1100;
    section.resizeWithoutConstraints(1200, 300);

    const inputs = [
      { label: "EMPLOYEE NAME", placeholder: "Search employees...", type: "text" },
      { label: "SCHEDULED HOURS", placeholder: "40", type: "number" },
      { label: "ROLE", placeholder: "Select role...", type: "select" },
      { label: "SHIFT DATE", placeholder: "2026-03-23", type: "date" },
    ];

    let x = 40;
    for (const inp of inputs) {
      // Label
      const label = figma.createText();
      label.fontName = { family: "Inter", style: "Medium" };
      label.fontSize = 10;
      label.characters = inp.label;
      label.letterSpacing = { value: 1.5, unit: "PIXELS" };
      label.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
      label.x = x; label.y = 55;
      section.appendChild(label);

      // Input frame
      const frame = figma.createFrame();
      frame.name = "Input / " + inp.label;
      frame.x = x; frame.y = 75;
      frame.resize(240, 40);
      frame.cornerRadius = 6;
      frame.fills = [{ type: "SOLID", color: ${hex(C.surface)} }];
      frame.strokes = [{ type: "SOLID", color: ${hex(C.border)} }];
      frame.strokeWeight = 1;
      frame.layoutMode = "HORIZONTAL";
      frame.counterAxisAlignItems = "CENTER";
      frame.paddingLeft = 12; frame.paddingRight = 12;

      const text = figma.createText();
      text.fontName = { family: "Inter", style: "Regular" };
      text.fontSize = 13;
      text.characters = inp.placeholder;
      text.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
      frame.appendChild(text);

      if (inp.type === "select") {
        const arrow = figma.createText();
        arrow.fontName = { family: "Inter", style: "Regular" };
        arrow.fontSize = 13;
        arrow.characters = " ▾";
        arrow.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
        frame.appendChild(arrow);
      }

      section.appendChild(frame);
      x += 275;
    }
    return { section: "INPUT FIELDS", count: inputs.length };
  `, 30000);

  // ── 6. Cards ──────────────────────────────────────────
  console.log("6/8 Creating Cards...");
  await engine.figma.execute(`
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    const section = figma.createSection();
    section.name = "CARDS";
    section.x = 0; section.y = 1440;
    section.resizeWithoutConstraints(1200, 350);

    // ── Stat Card ──
    const stats = [
      { label: "WEEKLY LABOR COST", value: "$18,240", trend: "▼ 12% under budget", trendColor: ${hex(C.green)} },
      { label: "HOURS SCHEDULED", value: "847", trend: "▲ 3% vs last week", trendColor: ${hex(C.yellow)} },
      { label: "OVERTIME HOURS", value: "24.5", trend: "▲ 8% over target", trendColor: ${hex(C.red)} },
    ];

    let x = 40;
    for (const s of stats) {
      const card = figma.createFrame();
      card.name = "Card / Stat / " + s.label;
      card.x = x; card.y = 60;
      card.resize(280, 140);
      card.cornerRadius = 8;
      card.fills = [{ type: "SOLID", color: ${hex(C.surface)} }];
      card.strokes = [{ type: "SOLID", color: ${hex(C.border)} }];
      card.strokeWeight = 1;
      card.layoutMode = "VERTICAL";
      card.paddingLeft = 20; card.paddingRight = 20;
      card.paddingTop = 20; card.paddingBottom = 20;
      card.itemSpacing = 8;

      const label = figma.createText();
      label.fontName = { family: "Inter", style: "Medium" };
      label.fontSize = 10;
      label.characters = s.label;
      label.letterSpacing = { value: 1.5, unit: "PIXELS" };
      label.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
      card.appendChild(label);

      const value = figma.createText();
      value.fontName = { family: "Inter", style: "Bold" };
      value.fontSize = 28;
      value.characters = s.value;
      value.fills = [{ type: "SOLID", color: ${hex(C.text)} }];
      card.appendChild(value);

      const trend = figma.createText();
      trend.fontName = { family: "Inter", style: "Regular" };
      trend.fontSize = 12;
      trend.characters = s.trend;
      trend.fills = [{ type: "SOLID", color: s.trendColor }];
      card.appendChild(trend);

      section.appendChild(card);
      x += 310;
    }

    // ── Employee Card ──
    const empCard = figma.createFrame();
    empCard.name = "Card / Employee";
    empCard.x = 40; empCard.y = 220;
    empCard.resize(280, 80);
    empCard.cornerRadius = 8;
    empCard.fills = [{ type: "SOLID", color: ${hex(C.surface)} }];
    empCard.strokes = [{ type: "SOLID", color: ${hex(C.border)} }];
    empCard.strokeWeight = 1;
    empCard.layoutMode = "HORIZONTAL";
    empCard.counterAxisAlignItems = "CENTER";
    empCard.paddingLeft = 16; empCard.paddingRight = 16;
    empCard.itemSpacing = 12;

    // Avatar circle
    const avatar = figma.createEllipse();
    avatar.name = "Avatar";
    avatar.resize(40, 40);
    avatar.fills = [{ type: "SOLID", color: ${hex(C.blue)} }];
    empCard.appendChild(avatar);

    // Name + role column
    const infoFrame = figma.createFrame();
    infoFrame.name = "Info";
    infoFrame.resize(150, 40);
    infoFrame.fills = [];
    infoFrame.layoutMode = "VERTICAL";
    infoFrame.itemSpacing = 4;

    const empName = figma.createText();
    empName.fontName = { family: "Inter", style: "Medium" };
    empName.fontSize = 14;
    empName.characters = "Maria Chen";
    empName.fills = [{ type: "SOLID", color: ${hex(C.text)} }];
    infoFrame.appendChild(empName);

    const empRole = figma.createText();
    empRole.fontName = { family: "Inter", style: "Regular" };
    empRole.fontSize = 12;
    empRole.characters = "Line Cook  •  Full-time";
    empRole.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
    infoFrame.appendChild(empRole);

    empCard.appendChild(infoFrame);
    section.appendChild(empCard);

    return { section: "CARDS", statCards: stats.length };
  `, 30000);

  // ── 7. Badges ─────────────────────────────────────────
  console.log("7/8 Creating Badges...");
  await engine.figma.execute(`
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });

    const section = figma.createSection();
    section.name = "BADGES";
    section.x = 0; section.y = 1830;
    section.resizeWithoutConstraints(1200, 160);

    const badges = [
      { label: "ACTIVE", color: ${hex(C.green)} },
      { label: "WARNING", color: ${hex(C.yellow)} },
      { label: "OVER BUDGET", color: ${hex(C.red)} },
      { label: "SCHEDULED", color: ${hex(C.blue)} },
      { label: "OFF SHIFT", color: ${hex(C.textSec)} },
    ];

    let x = 40;
    for (const b of badges) {
      const badge = figma.createFrame();
      badge.name = "Badge / " + b.label;
      badge.x = x; badge.y = 60;
      badge.cornerRadius = 4;
      badge.fills = [];
      badge.strokes = [{ type: "SOLID", color: b.color }];
      badge.strokeWeight = 1;
      badge.layoutMode = "HORIZONTAL";
      badge.primaryAxisAlignItems = "CENTER";
      badge.counterAxisAlignItems = "CENTER";
      badge.paddingLeft = 10; badge.paddingRight = 10;
      badge.paddingTop = 6; badge.paddingBottom = 6;

      // Dot
      const dot = figma.createEllipse();
      dot.name = "Dot";
      dot.resize(6, 6);
      dot.fills = [{ type: "SOLID", color: b.color }];
      badge.appendChild(dot);

      // Spacer
      const spacer = figma.createFrame();
      spacer.resize(6, 1);
      spacer.fills = [];
      badge.appendChild(spacer);

      const label = figma.createText();
      label.fontName = { family: "Inter", style: "Medium" };
      label.fontSize = 11;
      label.characters = b.label;
      label.letterSpacing = { value: 1, unit: "PIXELS" };
      label.fills = [{ type: "SOLID", color: b.color }];
      badge.appendChild(label);

      section.appendChild(badge);
      x += 170;
    }
    return { section: "BADGES", count: badges.length };
  `, 30000);

  // ── 8. Table ──────────────────────────────────────────
  console.log("8/8 Creating Table...");
  await engine.figma.execute(`
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    const section = figma.createSection();
    section.name = "TABLE";
    section.x = 0; section.y = 2030;
    section.resizeWithoutConstraints(1200, 380);

    const columns = ["EMPLOYEE", "ROLE", "SCHEDULED", "ACTUAL", "VARIANCE"];
    const colWidths = [200, 150, 120, 120, 120];
    const rows = [
      ["Maria Chen", "Line Cook", "40h", "38.5h", "-1.5h"],
      ["James Wilson", "Server", "32h", "35h", "+3.0h"],
      ["Sofia Kowalski", "Sous Chef", "45h", "44h", "-1.0h"],
      ["David Park", "Host", "28h", "28h", "0h"],
      ["Aisha Johnson", "Pastry Chef", "40h", "42.5h", "+2.5h"],
    ];

    const tableFrame = figma.createFrame();
    tableFrame.name = "Table / Labor Schedule";
    tableFrame.x = 40; tableFrame.y = 50;
    tableFrame.resize(1100, 300);
    tableFrame.fills = [{ type: "SOLID", color: ${hex(C.surface)} }];
    tableFrame.strokes = [{ type: "SOLID", color: ${hex(C.border)} }];
    tableFrame.strokeWeight = 1;
    tableFrame.cornerRadius = 8;
    tableFrame.clipsContent = true;

    // Header row
    const header = figma.createFrame();
    header.name = "Header";
    header.resize(1100, 44);
    header.fills = [{ type: "SOLID", color: ${hex(C.bg)} }];
    header.layoutMode = "HORIZONTAL";
    header.counterAxisAlignItems = "CENTER";
    header.paddingLeft = 20; header.paddingRight = 20;

    let colX = 0;
    for (let i = 0; i < columns.length; i++) {
      const cell = figma.createText();
      cell.fontName = { family: "Inter", style: "Medium" };
      cell.fontSize = 10;
      cell.characters = columns[i];
      cell.letterSpacing = { value: 1.5, unit: "PIXELS" };
      cell.fills = [{ type: "SOLID", color: ${hex(C.textSec)} }];
      cell.resize(colWidths[i], 14);
      cell.textAutoResize = "NONE";
      header.appendChild(cell);
    }
    tableFrame.appendChild(header);

    // Data rows
    for (let r = 0; r < rows.length; r++) {
      const row = figma.createFrame();
      row.name = "Row " + (r + 1);
      row.resize(1100, 48);
      row.y = 44 + r * 48;
      row.fills = r % 2 === 0 ? [{ type: "SOLID", color: ${hex(C.surface)} }] : [];
      row.layoutMode = "HORIZONTAL";
      row.counterAxisAlignItems = "CENTER";
      row.paddingLeft = 20; row.paddingRight = 20;

      // Bottom border
      row.strokes = [{ type: "SOLID", color: ${hex(C.border)} }];
      row.strokeWeight = 1;
      row.strokeAlign = "INSIDE";

      for (let c = 0; c < rows[r].length; c++) {
        const cell = figma.createText();
        cell.fontName = { family: "Inter", style: c === 0 ? "Medium" : "Regular" };
        cell.fontSize = 13;
        cell.characters = rows[r][c];

        // Color variance column
        let textColor = ${hex(C.text)};
        if (c === 4) {
          const val = rows[r][c];
          if (val.startsWith("+")) textColor = ${hex(C.red)};
          else if (val.startsWith("-")) textColor = ${hex(C.green)};
          else textColor = ${hex(C.textSec)};
        }
        cell.fills = [{ type: "SOLID", color: textColor }];
        cell.resize(colWidths[c], 16);
        cell.textAutoResize = "NONE";
        row.appendChild(cell);
      }
      tableFrame.appendChild(row);
    }

    section.appendChild(tableFrame);
    return { section: "TABLE", rows: rows.length, columns: columns.length };
  `, 30000);

  console.log("\n✔ Design System complete! All 8 sections created in Figma.");

  await new Promise(r => setTimeout(r, 2000));
  await engine.figma.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
