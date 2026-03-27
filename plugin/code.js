(function() {
  "use strict";
  const WIDGET_V2_CHANNEL = "memoire.widget.v2";
  function createRunId(prefix = "run") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  const BLOCKED_PATTERNS = [/figma\.closePlugin/i, /figma\.root\.remove/i, /while\s*\(\s*true\s*\)/i, /for\s*\(\s*;\s*;\s*\)/i];
  const BLOCKED_KEYWORDS = ["closeplugin", "removepage", "__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__"];
  const BLOCKED_GLOBALS = [/\bFunction\s*\(/, /\bimport\s*\(/, /\brequire\s*\(/, /\bglobalThis\b/, /\bself\b/, /\bwindow\b/];
  const state = {
    sessionId: createRunId("widget"),
    activeRunId: null,
    jobs: /* @__PURE__ */ new Map(),
    selectionListenerActive: true,
    lastSelectionUpdate: 0,
    selectionThrottleMs: 180,
    changeBuffer: [],
    maxChangeBuffer: 300,
    connection: {
      stage: "offline",
      port: null,
      name: "Mémoire Control Plane",
      latencyMs: null,
      fileName: "",
      fileKey: null,
      pageName: "",
      pageId: null,
      editorType: "",
      connectedAt: null,
      reconnectDelayMs: null
    }
  };
  figma.showUI(__html__, {
    width: 480,
    height: 760,
    title: "Mémoire Control Plane",
    themeColors: true
  });
  void bootstrap();
  async function bootstrap() {
    await figma.loadAllPagesAsync();
    refreshConnectionState();
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "bootstrap",
      connection: state.connection,
      selection: createSelectionSnapshot(),
      initialJobs: snapshotJobs()
    });
    figma.on("selectionchange", () => {
      const now = Date.now();
      if (now - state.lastSelectionUpdate < state.selectionThrottleMs) return;
      state.lastSelectionUpdate = now;
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "selection",
        selection: createSelectionSnapshot()
      });
    });
    figma.on("currentpagechange", () => {
      refreshConnectionState();
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "page",
        pageName: figma.currentPage.name,
        pageId: figma.currentPage.id,
        updatedAt: Date.now()
      });
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "connection",
        connection: state.connection
      });
    });
    figma.on("documentchange", (event) => {
      const now = Date.now();
      for (const change of event.documentChanges || []) {
        state.changeBuffer.push({
          type: change.type,
          id: change.id,
          origin: change.origin ?? null,
          sessionId: state.sessionId,
          runId: state.activeRunId,
          pageId: figma.currentPage?.id ?? null,
          timestamp: now
        });
      }
      if (state.changeBuffer.length > state.maxChangeBuffer) {
        state.changeBuffer = state.changeBuffer.slice(-300);
      }
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "changes",
        count: event.documentChanges?.length ?? 0,
        buffered: state.changeBuffer.length,
        sessionId: state.sessionId,
        runId: state.activeRunId,
        updatedAt: now
      });
    });
  }
  figma.ui.onmessage = async (message) => {
    if (!message || message.channel !== WIDGET_V2_CHANNEL) {
      return;
    }
    if (message.type === "ping") {
      refreshConnectionState();
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "pong",
        connection: state.connection
      });
      return;
    }
    if (message.type !== "run-command") {
      return;
    }
    const job = message.action ? startJob(message.requestId, message.command, message.action.kind, message.action.label) : null;
    try {
      state.activeRunId = job?.runId ?? null;
      const result = await handleCommand(message.command, message.params ?? {});
      if (job) {
        finishJob(job, "completed", summarizeCommandResult(message.command, result));
      }
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "command-result",
        requestId: message.requestId,
        command: message.command,
        ok: true,
        sessionId: state.sessionId,
        runId: job?.runId ?? null,
        result
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      if (job) {
        finishJob(job, "failed", void 0, messageText);
      }
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "command-result",
        requestId: message.requestId,
        command: message.command,
        ok: false,
        sessionId: state.sessionId,
        runId: job?.runId ?? null,
        error: messageText
      });
    } finally {
      state.activeRunId = null;
    }
  };
  function refreshConnectionState() {
    state.connection = {
      ...state.connection,
      stage: "connected",
      fileName: figma.root.name || "",
      fileKey: figma.fileKey || null,
      pageName: figma.currentPage?.name || "",
      pageId: figma.currentPage?.id || null,
      editorType: figma.editorType || "figma",
      connectedAt: state.connection.connectedAt ?? Date.now()
    };
  }
  function post(message) {
    figma.ui.postMessage(message);
  }
  function startJob(id, command, kind, label) {
    const now = Date.now();
    const job = {
      id,
      runId: createRunId("job"),
      kind,
      label,
      command,
      status: "running",
      startedAt: now,
      updatedAt: now,
      progressText: "Running"
    };
    state.jobs.set(job.id, job);
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "job",
      job
    });
    return job;
  }
  function finishJob(job, status, summary, error) {
    const next = {
      ...job,
      status,
      updatedAt: Date.now(),
      finishedAt: Date.now(),
      progressText: status === "completed" ? "Done" : "Failed",
      summary,
      error
    };
    state.jobs.set(next.id, next);
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "job",
      job: next
    });
  }
  function snapshotJobs() {
    return Array.from(state.jobs.values()).sort((left, right) => right.updatedAt - left.updatedAt);
  }
  async function handleCommand(command, params) {
    switch (command) {
      case "execute":
        return executeCode(String(params.code ?? ""));
      case "getSelection":
        return createSelectionSnapshot();
      case "getFileData":
        return getFileData(Number(params.depth ?? 3));
      case "getVariables":
        return getVariables();
      case "getComponents":
        return getComponents();
      case "getStyles":
        return getStyles();
      case "getStickies":
        return getStickies();
      case "getChanges": {
        const changes = [...state.changeBuffer];
        state.changeBuffer = [];
        return changes;
      }
      case "getComponentImage":
        return getComponentImage(String(params.nodeId ?? ""), String(params.format ?? "png"));
      case "createNode":
        return createNode(params);
      case "updateNode":
        return updateNode(params);
      case "deleteNode":
        return deleteNode(String(params.nodeId ?? ""));
      case "setSelection":
        return setSelection(Array.isArray(params.nodeIds) ? params.nodeIds.map(String) : []);
      case "navigateTo":
        return navigateTo(String(params.nodeId ?? ""));
      case "getPageList":
        return figma.root.children.map((page) => ({ id: page.id, name: page.name }));
      case "getPageTree":
        return getPageTree(Number(params.depth ?? 2));
      case "captureScreenshot":
        return captureScreenshot(params);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
  function summarizeCommandResult(command, result) {
    if (command === "getSelection" && result && typeof result === "object" && "count" in result) {
      return `${String(result.count)} selected`;
    }
    if (command === "getChanges" && Array.isArray(result)) {
      return `${result.length} changes`;
    }
    if (command === "getVariables" && result && typeof result === "object" && "collections" in result) {
      return `${(result.collections || []).length} collections`;
    }
    if (command === "getComponents" && Array.isArray(result)) {
      return `${result.length} components`;
    }
    if (command === "getStyles" && Array.isArray(result)) {
      return `${result.length} styles`;
    }
    return command;
  }
  function createSelectionSnapshot() {
    refreshConnectionState();
    return {
      count: figma.currentPage.selection.length,
      pageName: figma.currentPage.name,
      pageId: figma.currentPage.id,
      sessionId: state.sessionId,
      nodes: figma.currentPage.selection.map((node) => serializeSelectionNode(node)),
      updatedAt: Date.now()
    };
  }
  function serializeSelectionNode(node) {
    const snapshot = {
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible !== false,
      pageName: figma.currentPage.name
    };
    if ("x" in node) snapshot.x = node.x;
    if ("y" in node) snapshot.y = node.y;
    if ("width" in node) snapshot.width = node.width;
    if ("height" in node) snapshot.height = node.height;
    if ("characters" in node) snapshot.characters = node.characters;
    if ("opacity" in node) snapshot.opacity = node.opacity;
    if ("rotation" in node) snapshot.rotation = node.rotation;
    if ("cornerRadius" in node) snapshot.cornerRadius = node.cornerRadius;
    if ("children" in node && Array.isArray(node.children)) snapshot.childCount = node.children.length;
    if ("fillStyleId" in node) snapshot.fillStyleId = node.fillStyleId || null;
    if ("strokeStyleId" in node) snapshot.strokeStyleId = node.strokeStyleId || null;
    if ("textStyleId" in node) snapshot.textStyleId = node.textStyleId || null;
    if ("boundVariables" in node) snapshot.boundVariables = node.boundVariables || {};
    if ("fills" in node && Array.isArray(node.fills)) {
      snapshot.fills = node.fills.map((fill) => ({
        type: fill.type,
        color: fill.color ? {
          r: fill.color.r,
          g: fill.color.g,
          b: fill.color.b,
          a: fill.opacity !== void 0 ? fill.opacity : 1
        } : null
      }));
    }
    snapshot.layout = readLayout(node);
    snapshot.component = readComponent(node);
    return snapshot;
  }
  function readLayout(node) {
    return {
      layoutMode: "layoutMode" in node ? node.layoutMode || null : null,
      itemSpacing: "itemSpacing" in node ? node.itemSpacing ?? null : null,
      paddingLeft: "paddingLeft" in node ? node.paddingLeft ?? null : null,
      paddingRight: "paddingRight" in node ? node.paddingRight ?? null : null,
      paddingTop: "paddingTop" in node ? node.paddingTop ?? null : null,
      paddingBottom: "paddingBottom" in node ? node.paddingBottom ?? null : null
    };
  }
  function readComponent(node) {
    const isVariant = node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET";
    const variantProperties = typeof node.variantProperties === "object" && node.variantProperties ? Object.fromEntries(
      Object.entries(node.variantProperties).map(([key, value]) => [key, String(value?.value ?? value)])
    ) : {};
    const componentProperties = "componentPropertyDefinitions" in node && node.componentPropertyDefinitions ? node.componentPropertyDefinitions : {};
    if (!("key" in node) && !("description" in node) && !Object.keys(componentProperties).length && !Object.keys(variantProperties).length) {
      return void 0;
    }
    return {
      key: "key" in node ? node.key || null : null,
      description: "description" in node ? node.description || null : null,
      isVariant,
      variantProperties,
      componentProperties
    };
  }
  function serializeVariable(variable) {
    return {
      id: variable.id,
      name: variable.name,
      key: variable.key,
      resolvedType: variable.resolvedType,
      valuesByMode: variable.valuesByMode,
      variableCollectionId: variable.variableCollectionId,
      scopes: variable.scopes,
      codeSyntax: variable.codeSyntax || {},
      description: variable.description,
      hiddenFromPublishing: variable.hiddenFromPublishing
    };
  }
  function isCodeSafe(code) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(code)) {
        return { safe: false, reason: `Matches restricted pattern: ${String(pattern)}` };
      }
    }
    const normalized = code.toLowerCase().replace(/[\s'"`+\[\]]/g, "");
    for (const keyword of BLOCKED_KEYWORDS) {
      if (normalized.includes(keyword)) {
        return { safe: false, reason: `Contains blocked keyword: ${keyword}` };
      }
    }
    for (const pattern of BLOCKED_GLOBALS) {
      if (pattern.test(code)) {
        return { safe: false, reason: `Blocked global access: ${String(pattern)}` };
      }
    }
    return { safe: true, reason: null };
  }
  async function executeCode(code) {
    if (typeof code !== "string" || code.trim().length === 0) {
      throw new Error("Code must be a non-empty string");
    }
    if (code.length > 5e4) {
      throw new Error("Code exceeds maximum length (50KB)");
    }
    const check = isCodeSafe(code);
    if (!check.safe) {
      throw new Error(`Blocked: ${check.reason}`);
    }
    const fn = new Function("figma", `"use strict"; return (async () => { ${code} })()`);
    return await fn(figma);
  }
  function getPageTree(maxDepth) {
    function walkChildren(node, depth) {
      if (depth > maxDepth) return null;
      const data = { id: node.id, name: node.name, type: node.type, visible: node.visible !== false };
      if ("children" in node && node.children) {
        data.children = node.children.map((child) => walkChildren(child, depth + 1)).filter(Boolean);
      }
      return data;
    }
    return {
      fileKey: figma.fileKey,
      fileName: figma.root.name,
      pages: figma.root.children.map((page) => ({
        id: page.id,
        name: page.name,
        children: page.children.map((child) => walkChildren(child, 1)).filter(Boolean)
      }))
    };
  }
  function getFileData(maxDepth) {
    function walk(node, depth) {
      if (depth > maxDepth) {
        return { id: node.id, name: node.name, type: node.type };
      }
      const data = {
        id: node.id,
        name: node.name,
        type: node.type,
        visible: node.visible !== false
      };
      if ("children" in node && node.children) {
        data.children = node.children.map((child) => walk(child, depth + 1));
      }
      return data;
    }
    return walk(figma.currentPage, 0);
  }
  async function getVariables() {
    if (!figma.variables || figma.editorType === "figjam" || figma.editorType === "slides") {
      return { collections: [] };
    }
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const result = [];
    for (const collection of collections) {
      const variables = [];
      for (const variableId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable) continue;
        variables.push(serializeVariable(variable));
      }
      result.push({
        id: collection.id,
        name: collection.name,
        modes: collection.modes,
        variables
      });
    }
    return { collections: result };
  }
  function getComponents() {
    const components = figma.currentPage.findAll((node) => node.type === "COMPONENT" || node.type === "COMPONENT_SET");
    return components.map((component) => ({
      id: component.id,
      name: component.name,
      type: component.type,
      description: component.description || "",
      key: component.type === "COMPONENT" ? component.key : void 0,
      variants: component.type === "COMPONENT_SET" && component.children ? component.children.map((variant) => ({ id: variant.id, name: variant.name, key: variant.key })) : [],
      componentProperties: "componentPropertyDefinitions" in component ? component.componentPropertyDefinitions : {}
    }));
  }
  function getStyles() {
    const styles = [];
    for (const style of figma.getLocalPaintStyles()) {
      styles.push({
        id: style.id,
        name: style.name,
        type: style.type,
        styleType: "FILL",
        description: style.description,
        value: style.paints
      });
    }
    for (const style of figma.getLocalTextStyles()) {
      styles.push({
        id: style.id,
        name: style.name,
        type: style.type,
        styleType: "TEXT",
        description: style.description,
        value: {
          fontName: style.fontName,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing
        }
      });
    }
    for (const style of figma.getLocalEffectStyles()) {
      styles.push({
        id: style.id,
        name: style.name,
        type: style.type,
        styleType: "EFFECT",
        description: style.description,
        value: style.effects
      });
    }
    return styles;
  }
  function getStickies() {
    return figma.currentPage.findAll((node) => node.type === "STICKY").map((sticky) => ({
      id: sticky.id,
      text: sticky.text ? sticky.text.characters : "",
      authorName: sticky.authorName || null,
      fills: sticky.fills,
      x: sticky.x,
      y: sticky.y,
      width: sticky.width,
      height: sticky.height
    }));
  }
  async function getComponentImage(nodeId, format) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    const bytes = await node.exportAsync({
      format: String(format || "PNG").toUpperCase(),
      constraint: { type: "SCALE", value: 2 }
    });
    return {
      base64: figma.base64Encode(bytes),
      format: format || "png"
    };
  }
  async function createNode(params) {
    const { type, name, x, y, width, height, parentId } = params;
    let node;
    switch (type) {
      case "FRAME":
        node = figma.createFrame();
        break;
      case "RECTANGLE":
        node = figma.createRectangle();
        break;
      case "TEXT":
        node = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        node.characters = String(params.text || "");
        break;
      case "ELLIPSE":
        node = figma.createEllipse();
        break;
      case "LINE":
        node = figma.createLine();
        break;
      default:
        throw new Error(`Unsupported node type: ${String(type)}`);
    }
    if (name) node.name = String(name);
    if (x !== void 0) node.x = Number(x);
    if (y !== void 0) node.y = Number(y);
    if (width && height && "resize" in node) node.resize(Number(width), Number(height));
    if (parentId) {
      const parent = await figma.getNodeByIdAsync(String(parentId));
      if (parent && "appendChild" in parent) {
        parent.appendChild(node);
      }
    }
    return serializeSelectionNode(node);
  }
  async function updateNode(params) {
    const node = await figma.getNodeByIdAsync(String(params.nodeId || ""));
    if (!node) {
      throw new Error(`Node not found: ${String(params.nodeId)}`);
    }
    const properties = params.properties || {};
    for (const [key, value] of Object.entries(properties)) {
      switch (key) {
        case "name":
          node.name = value;
          break;
        case "x":
          node.x = value;
          break;
        case "y":
          node.y = value;
          break;
        case "width":
          if ("resize" in node) node.resize(Number(value), node.height);
          break;
        case "height":
          if ("resize" in node) node.resize(node.width, Number(value));
          break;
        case "visible":
          node.visible = value;
          break;
        case "opacity":
          node.opacity = value;
          break;
        case "rotation":
          node.rotation = value;
          break;
        case "characters":
          if (node.type === "TEXT") {
            await loadTextNodeFonts(node);
            node.characters = String(value);
          }
          break;
        case "fills":
          if ("fills" in node) node.fills = value;
          break;
      }
    }
    return serializeSelectionNode(node);
  }
  async function loadTextNodeFonts(node) {
    if (!node || node.type !== "TEXT") return;
    const characters = node.characters || "";
    if (!characters.length) {
      const fontName = node.fontName;
      if (fontName && fontName !== figma.mixed) {
        await figma.loadFontAsync(fontName);
      }
      return;
    }
    const fonts = node.getRangeAllFontNames(0, characters.length);
    const uniqueFonts = /* @__PURE__ */ new Map();
    for (const font of fonts) {
      if (!font || font === figma.mixed) continue;
      uniqueFonts.set(`${font.family}::${font.style}`, font);
    }
    await Promise.all(Array.from(uniqueFonts.values()).map((font) => figma.loadFontAsync(font)));
  }
  async function deleteNode(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    node.remove();
    return { deleted: nodeId };
  }
  function setSelection(nodeIds) {
    const nodes = [];
    for (const id of nodeIds) {
      const node = figma.getNodeById(id);
      if (node && "parent" in node) nodes.push(node);
    }
    figma.currentPage.selection = nodes;
    return { selected: nodes.length };
  }
  async function navigateTo(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    figma.viewport.scrollAndZoomIntoView([node]);
    return { navigated: nodeId };
  }
  async function captureScreenshot(params) {
    const node = params.nodeId ? await figma.getNodeByIdAsync(String(params.nodeId)) : figma.currentPage;
    if (!node) {
      throw new Error(`Node not found: ${String(params.nodeId)}`);
    }
    const format = String(params.format || "PNG").toUpperCase();
    const scale = Number(params.scale || 2);
    const bytes = await node.exportAsync({
      format,
      constraint: { type: "SCALE", value: scale }
    });
    return {
      image: {
        base64: figma.base64Encode(bytes),
        format,
        scale,
        byteLength: bytes.length,
        node: {
          id: node.id,
          name: node.name,
          type: node.type
        },
        bounds: "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null
      }
    };
  }
})();
