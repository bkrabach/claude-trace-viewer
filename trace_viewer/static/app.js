/**
 * Claude Trace Debugger - Developer-focused debugging tool
 * Complete request/response inspection with all technical details
 */

// Helper function for interactive JSON rendering using our custom JSONViewer
function renderInteractiveJson(element, data, options = {}) {
  // Check if JSONViewer class is available
  if (!window.JSONViewer) {
    // Fallback to plain JSON display
    const errorDiv = document.createElement("div");
    errorDiv.className = "json-viewer-error";
    errorDiv.style.cssText = `
            background: #ff4444;
            color: white;
            padding: 12px;
            border-radius: 4px;
            margin: 8px 0;
            font-family: monospace;
            font-size: 14px;
        `;

    errorDiv.innerHTML = `
            <strong>⚠️ JSON Viewer Failed to Load</strong><br>
            <br>
            The JSON viewer module could not be loaded.<br>
            <br>
            <details style="margin-top: 8px;">
                <summary style="cursor: pointer;">View raw JSON data</summary>
                <pre style="background: rgba(0,0,0,0.2); padding: 8px; margin-top: 8px; overflow: auto; max-height: 400px;">${JSON.stringify(
                  data,
                  null,
                  2
                )}</pre>
            </details>
        `;

    element.innerHTML = "";
    element.appendChild(errorDiv);

    console.error("JSONViewer not loaded");
    return;
  }

  try {
    // Create our custom JSON viewer with trace-viewer specific configuration
    element.innerHTML = "";

    // Build configuration based on any additional options passed
    const config = {
      maxTextLength: 120,
      smartExpansion: true,
      // Application-specific fields to collapse by default
      collapseByDefault: ["cache_control", "metadata"],
      // Application-specific fields where all children should expand
      expandAllChildren: [
        "tools",
        "messages",
        "parsed_events",
        "system",
        "todos",
      ],
      // Application-specific fields that auto-expand when their parent expands
      autoExpandFields: ["content", "system", "input", "output", "delta"],
      // Custom expansion handler for Claude trace viewer specific logic
      customExpansionHandler: (contentElement, parentKey) => {
        // Special handling for messages array - expand content fields within messages
        if (parentKey === "messages") {
          contentElement.querySelectorAll(".json-item").forEach((item) => {
            const keyElements = item.querySelectorAll(".json-key");
            keyElements.forEach((keyEl) => {
              if (keyEl.textContent === '"content"') {
                const valueElement =
                  keyEl.nextElementSibling?.nextElementSibling;
                if (
                  valueElement &&
                  valueElement.classList.contains("json-array")
                ) {
                  const toggle = valueElement.querySelector(".json-toggle");
                  if (toggle && toggle.textContent === "▶") {
                    toggle.click();
                    // After expanding the content array, also expand the items inside it
                    setTimeout(() => {
                      const contentContainer =
                        valueElement.querySelector(".json-content");
                      if (contentContainer) {
                        // Expand all object items within the content array
                        contentContainer
                          .querySelectorAll(
                            ".json-item > .json-object > .json-toggle"
                          )
                          .forEach((innerToggle) => {
                            if (innerToggle.textContent === "▶") {
                              innerToggle.click();
                            }
                          });
                      }
                    }, 0);
                  }
                }
              }
            });
          });
        }

        // Special handling for content array - expand all child objects when content is expanded
        if (parentKey === "content") {
          // When a content array is expanded, auto-expand all its object children
          contentElement
            .querySelectorAll(".json-item > .json-object > .json-toggle")
            .forEach((toggle) => {
              if (toggle.textContent === "▶") {
                toggle.click();
              }
            });
        }

        // Special handling for system array - expand all child objects
        if (parentKey === "system") {
          contentElement
            .querySelectorAll(".json-item > .json-object > .json-toggle")
            .forEach((toggle) => {
              if (toggle.textContent === "▶") {
                toggle.click();
              }
            });
        }

        // Special handling for input field (tool_use inputs) - expand nested objects
        if (parentKey === "input") {
          // Expand all nested arrays and objects within input
          contentElement.querySelectorAll(".json-toggle").forEach((toggle) => {
            if (toggle.textContent === "▶") {
              toggle.click();
            }
          });
        }

        // Special handling for todos array - expand all todo items
        if (parentKey === "todos") {
          // Expand all todo objects within the todos array
          contentElement
            .querySelectorAll(".json-item > .json-object > .json-toggle")
            .forEach((toggle) => {
              if (toggle.textContent === "▶") {
                toggle.click();
              }
            });
        }
      },
      ...options, // Allow overrides from caller
    };

    const viewer = new JSONViewer(element, config);
    viewer.render(data);
  } catch (error) {
    // Handle any errors during JSON rendering
    const errorDiv = document.createElement("div");
    errorDiv.className = "json-viewer-runtime-error";
    errorDiv.style.cssText = `
            background: #ff8800;
            color: white;
            padding: 12px;
            border-radius: 4px;
            margin: 8px 0;
            font-family: monospace;
            font-size: 14px;
        `;

    errorDiv.innerHTML = `
            <strong>⚠️ JSON Rendering Error</strong><br>
            <br>
            Failed to render JSON data:<br>
            <code>${error.message}</code><br>
            <br>
            <details style="margin-top: 8px;">
                <summary style="cursor: pointer;">View raw JSON data</summary>
                <pre style="background: rgba(0,0,0,0.2); padding: 8px; margin-top: 8px; overflow: auto; max-height: 400px;">${JSON.stringify(
                  data,
                  null,
                  2
                )}</pre>
            </details>
        `;

    element.innerHTML = "";
    element.appendChild(errorDiv);

    console.error("JSON Viewer runtime error:", error, {
      data: data,
      options: options,
    });
  }
}

class TraceDebugger {
  constructor() {
    this.entries = [];
    this.filteredEntries = [];
    this.selectedEntry = null;
    this.currentFile = null;
    this.files = [];

    this.initializeElements();
    this.bindEvents();
    this.loadTheme();
    this.loadFiles();
  }

  initializeElements() {
    // Header controls
    this.fileSelector = document.getElementById("fileSelector");
    this.refreshBtn = document.getElementById("refreshBtn");
    this.themeToggle = document.getElementById("themeToggle");

    // Stats bar
    this.statsBar = document.getElementById("statsBar");
    this.entryCount = document.getElementById("entryCount");
    this.loadTime = document.getElementById("loadTime");
    this.fileSize = document.getElementById("fileSize");
    this.errorCount = document.getElementById("errorCount");

    // Filter bar
    this.filterBar = document.getElementById("filterBar");
    this.searchInput = document.getElementById("searchInput");
    this.statusFilter = document.getElementById("statusFilter");
    this.methodFilter = document.getElementById("methodFilter");
    this.agentFilter = document.getElementById("agentFilter");
    this.clearFilters = document.getElementById("clearFilters");

    // Main content
    this.entryList = document.getElementById("entryList");
    this.detailPanel = document.getElementById("detailPanel");

    // Detail panel elements
    this.detailTitle = document.getElementById("detailTitle");
    this.copyRequestId = document.getElementById("copyRequestId");
    this.copyUrl = document.getElementById("copyUrl");
    this.exportEntry = document.getElementById("exportEntry");
    this.closeDetail = document.getElementById("closeDetail");

    // Tab elements
    this.tabButtons = document.querySelectorAll(".tab-button");
    this.tabPanes = document.querySelectorAll(".tab-pane");

    // Loading
    this.loadingOverlay = document.getElementById("loadingOverlay");
  }

  bindEvents() {
    // Header events
    this.fileSelector.addEventListener("change", () => this.loadTrace());
    this.refreshBtn.addEventListener("click", () => this.loadFiles());
    this.themeToggle.addEventListener("click", () => this.toggleTheme());

    // Filter events
    this.searchInput.addEventListener("input", () => this.applyFilters());
    this.statusFilter.addEventListener("change", () => this.applyFilters());
    this.methodFilter.addEventListener("change", () => this.applyFilters());
    this.agentFilter.addEventListener("change", () => this.applyFilters());
    this.clearFilters.addEventListener("click", () => this.clearFilters());

    // Detail panel events
    this.closeDetail.addEventListener("click", () => this.closeDetailPanel());
    this.copyRequestId.addEventListener("click", () =>
      this.copyRequestIdToClipboard()
    );
    this.copyUrl.addEventListener("click", () => this.copyUrlToClipboard());
    this.exportEntry.addEventListener("click", () => this.exportCurrentEntry());

    // Tab events
    this.tabButtons.forEach((button) => {
      button.addEventListener("click", (e) =>
        this.switchTab(e.target.dataset.tab)
      );
    });

    // Raw tab actions
    document
      .getElementById("copyRaw")
      ?.addEventListener("click", () => this.copyRawJson());
    document
      .getElementById("downloadRaw")
      ?.addEventListener("click", () => this.downloadRawJson());
  }

  loadTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.body.setAttribute("data-theme", theme);
  }

  toggleTheme() {
    const currentTheme = document.body.getAttribute("data-theme") || "light";
    const newTheme = currentTheme === "light" ? "dark" : "light";
    document.body.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  }

  async loadFiles() {
    try {
      const response = await fetch("/api/files");
      this.files = await response.json();

      this.fileSelector.innerHTML = "";

      if (this.files.length === 0) {
        this.fileSelector.innerHTML =
          '<option value="">No trace files found</option>';
        return;
      }

      this.fileSelector.innerHTML =
        '<option value="">Select a trace file...</option>';

      this.files.forEach((file) => {
        const option = document.createElement("option");
        option.value = file.name;
        option.textContent = `${file.name} (${file.size})`;
        option.dataset.size = file.size;
        this.fileSelector.appendChild(option);
      });
    } catch (error) {
      console.error("Failed to load files:", error);
      this.showError("Failed to load trace files");
    }
  }

  async loadTrace() {
    const filename = this.fileSelector.value;
    if (!filename) return;

    this.currentFile = filename;
    this.showLoading();

    const startTime = Date.now();

    try {
      const response = await fetch(`/api/trace/${filename}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load trace");
      }

      this.entries = data.entries;

      this.filteredEntries = [...this.entries];

      // Update stats
      const loadTimeMs = Date.now() - startTime;
      this.updateStats(data.total, loadTimeMs);

      // Populate agent filter dropdown with detected agents
      this.populateAgentFilter();

      // Show filter bar
      this.filterBar.classList.remove("hidden");

      // Render entries
      this.renderEntryList();
    } catch (error) {
      console.error("Failed to load trace:", error);
      this.showError(error.message);
    } finally {
      this.hideLoading();
    }
  }

  populateAgentFilter() {
    // Collect unique agent types
    const agentTypes = new Set();
    let mainCount = 0;
    let subagentCount = 0;

    this.entries.forEach((entry) => {
      if (entry.subagent_info?.is_subagent) {
        subagentCount++;
        const agentType = entry.subagent_info.agent_type;
        if (agentType) {
          agentTypes.add(agentType);
        }
      } else {
        mainCount++;
      }
    });

    // Count entries for each agent type
    const agentCounts = {};
    agentTypes.forEach((agent) => {
      agentCounts[agent] = this.entries.filter(
        (e) => e.subagent_info?.agent_type === agent
      ).length;
    });

    // Clear and rebuild dropdown
    this.agentFilter.innerHTML = "";

    // Add default options
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = `All Conversations (${this.entries.length})`;
    this.agentFilter.appendChild(allOption);

    const mainOption = document.createElement("option");
    mainOption.value = "main";
    mainOption.textContent = `Main Only (${mainCount})`;
    this.agentFilter.appendChild(mainOption);

    const subagentOption = document.createElement("option");
    subagentOption.value = "subagent";
    subagentOption.textContent = `Sub-Agents Only (${subagentCount})`;
    this.agentFilter.appendChild(subagentOption);

    // Add separator if there are agent types
    if (agentTypes.size > 0) {
      const separator = document.createElement("option");
      separator.disabled = true;
      separator.textContent = "──────────────";
      this.agentFilter.appendChild(separator);

      // Sort agent types alphabetically
      const sortedAgents = Array.from(agentTypes).sort();

      // Add individual agent options
      sortedAgents.forEach((agent) => {
        const option = document.createElement("option");
        option.value = `agent:${agent}`;
        const formattedName = this.formatAgentName(agent);
        option.textContent = `${formattedName} (${agentCounts[agent]})`;
        this.agentFilter.appendChild(option);
      });
    }
  }

  formatAgentName(agentType) {
    // Convert snake-case or kebab-case to Title Case
    return agentType
      .replace(/[-_]/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  updateStats(total, loadTimeMs) {
    this.entryCount.textContent = total.toString();
    this.loadTime.textContent = `${loadTimeMs}ms`;

    // Get file size from selector
    const selectedOption = this.fileSelector.selectedOptions[0];
    if (selectedOption) {
      this.fileSize.textContent = selectedOption.dataset.size || "-";
    }

    // Count errors
    const errorCount = this.entries.filter(
      (e) => e.summary?.status >= 400 || e.error
    ).length;
    this.errorCount.textContent = errorCount.toString();
    this.errorCount.className =
      errorCount > 0 ? "stat-value error" : "stat-value";

    this.statsBar.classList.remove("hidden");
  }

  renderEntryList() {
    this.entryList.innerHTML = "";

    if (this.filteredEntries.length === 0) {
      this.entryList.innerHTML = `
                <div class="welcome-message">
                    <p>No entries match your filters</p>
                </div>
            `;
      return;
    }

    this.filteredEntries.forEach((entry) => {
      const entryEl = this.createEntryElement(entry);
      this.entryList.appendChild(entryEl);
    });
  }

  createEntryElement(entry) {
    const div = document.createElement("div");
    div.className = "entry-item";
    div.dataset.index = entry.index;

    // Determine status class
    const status = entry.summary?.status || entry.response?.status_code;
    let statusClass = "";
    let statusText = status || "-";

    if (status) {
      if (status >= 200 && status < 300) statusClass = "status-2xx";
      else if (status >= 400 && status < 500) statusClass = "status-4xx";
      else if (status >= 500) statusClass = "status-5xx";
    }

    // Get method
    const method = entry.summary?.method || entry.request?.method || "GET";

    // Get URL
    const url = entry.summary?.url_path || entry.request?.url || "-";

    // Get timestamp
    const timestamp =
      entry.summary?.timestamp || entry.request?.timestamp_human || "-";

    // Get duration
    const duration = entry.summary?.duration || "-";

    // Extract model info
    const model = entry.request?.body?.model || entry.summary?.model || null;

    // Extract token usage
    let tokenInfo = null;
    if (entry.response?.usage) {
      const usage = entry.response.usage;
      tokenInfo = {
        input: usage.prompt_tokens || usage.input_tokens || 0,
        output: usage.completion_tokens || usage.output_tokens || 0,
        total: usage.total_tokens || 0,
      };
    } else if (entry.summary?.tokens_used) {
      tokenInfo = {
        input: entry.summary.tokens_used.input || 0,
        output: entry.summary.tokens_used.output || 0,
        total:
          (entry.summary.tokens_used.input || 0) +
          (entry.summary.tokens_used.output || 0),
      };
    }

    // Extract conversation context from request body
    let conversationContext = "";
    if (entry.request?.body) {
      if (
        entry.request.body.messages &&
        Array.isArray(entry.request.body.messages)
      ) {
        const messages = entry.request.body.messages;
        const msgCount = messages.length;
        const lastMsg = messages[msgCount - 1];
        const role = lastMsg?.role || "unknown";
        conversationContext = `<div class="entry-context">Turn ${msgCount}, Role: ${role}</div>`;
      }
    }

    // Extract subagent info
    const subagentInfo = entry.subagent_info;

    // Build details HTML
    let detailsHtml = "";
    if (model || tokenInfo || (subagentInfo && subagentInfo.is_subagent)) {
      detailsHtml = '<div class="entry-details">';

      if (model) {
        detailsHtml += `
                    <div class="entry-detail-item">
                        <span class="entry-detail-label">Model:</span>
                        <span class="entry-detail-value">${this.escapeHtml(
                          model
                        )}</span>
                    </div>`;
      }

      if (tokenInfo) {
        detailsHtml += `
                    <div class="entry-detail-item">
                        <span class="entry-detail-label">Tokens:</span>
                        <span class="entry-detail-value">↑${tokenInfo.input} ↓${tokenInfo.output} =${tokenInfo.total}</span>
                    </div>`;
      }

      if (subagentInfo && subagentInfo.is_subagent) {
        let confidenceBadge = "";
        if (
          subagentInfo.confidence !== null &&
          subagentInfo.confidence !== undefined
        ) {
          const confidencePct = Math.round(subagentInfo.confidence * 100);
          let confidenceClass = "confidence-high";
          if (subagentInfo.confidence < 0.4) confidenceClass = "confidence-low";
          else if (subagentInfo.confidence < 0.7)
            confidenceClass = "confidence-medium";
          confidenceBadge = ` <small class="${confidenceClass}" title="Detection confidence">${confidencePct}%</small>`;
        }

        detailsHtml += `
                    <div class="entry-detail-item">
                        <span class="entry-detail-label">Agent:</span>
                        <span class="entry-detail-value subagent-tag">${this.escapeHtml(
                          subagentInfo.agent_type || "unknown"
                        )}</span>${confidenceBadge}
                    </div>`;
      }

      detailsHtml += "</div>";
    }

    // Build HTML
    div.innerHTML = `
            <div class="entry-header-info">
                <div class="entry-main">
                    <span class="entry-index">#${entry.index}</span>
                    <span class="entry-method method-${method.toLowerCase()}">${method}</span>
                    <span class="entry-url">${this.escapeHtml(url)}</span>
                </div>
                <div class="entry-meta">
                    ${
                      status
                        ? `<span class="entry-status ${statusClass}">${statusText}</span>`
                        : ""
                    }
                    <span class="entry-duration">${duration}</span>
                </div>
            </div>
            ${conversationContext}
            ${detailsHtml}
            <div class="entry-time">${timestamp}</div>
        `;

    div.addEventListener("click", () => this.selectEntry(entry));

    return div;
  }

  selectEntry(entry) {
    // Update selection
    document.querySelectorAll(".entry-item").forEach((el) => {
      el.classList.remove("selected");
    });

    const selectedEl = document.querySelector(`[data-index="${entry.index}"]`);
    if (selectedEl) {
      selectedEl.classList.add("selected");
    }

    this.selectedEntry = entry;
    this.showDetailPanel(entry);
  }

  showDetailPanel(entry) {
    this.detailPanel.classList.remove("hidden");
    this.detailTitle.textContent = `Request #${entry.index}`;

    // Keep the current tab selection instead of resetting
    // Only switch to overview if no tab is selected (first load)
    const activeTab = document.querySelector(".tab-button.active");
    if (!activeTab) {
      this.switchTab("overview");
    }

    // Populate overview
    this.populateOverview(entry);

    // Populate request tab
    this.populateRequest(entry);

    // Populate response tab
    this.populateResponse(entry);

    // Populate preview tab
    this.populatePreview(entry);

    // Populate headers tab
    this.populateHeaders(entry);

    // Populate events tab
    this.populateEvents(entry);

    // Populate raw JSON tab
    this.populateRawJson(entry);
  }

  populateOverview(entry) {
    // Request summary
    document.getElementById("ovMethod").textContent =
      entry.request?.method || "-";
    document.getElementById("ovUrl").textContent = entry.request?.url || "-";
    document.getElementById("ovTimestamp").textContent =
      entry.request?.timestamp_human || "-";
    document.getElementById("ovModel").textContent =
      entry.summary?.model || "-";

    // Sub-agent info
    const subagentEl = document.getElementById("ovSubagent");
    if (entry.subagent_info && entry.subagent_info.is_subagent) {
      const agentType = entry.subagent_info.agent_type || "unknown";
      const detectionMethod = entry.subagent_info.detection_method || "unknown";
      const confidence = entry.subagent_info.confidence;

      let confidenceStr = "";
      if (confidence !== null && confidence !== undefined) {
        const confidencePct = Math.round(confidence * 100);
        // Color code confidence: green (>70%), yellow (40-70%), red (<40%)
        let confidenceClass = "confidence-high";
        if (confidence < 0.4) confidenceClass = "confidence-low";
        else if (confidence < 0.7) confidenceClass = "confidence-medium";

        confidenceStr = ` <span class="${confidenceClass}" title="Detection confidence">${confidencePct}%</span>`;
      }

      subagentEl.innerHTML = `<span class="subagent-tag">${this.escapeHtml(
        agentType
      )}</span>${confidenceStr} <small>(${detectionMethod})</small>`;
    } else {
      subagentEl.textContent = "-";
    }

    // Response summary
    const status = entry.response?.status_code;
    const statusEl = document.getElementById("ovStatus");
    if (status) {
      statusEl.textContent = status.toString();
      statusEl.className = "";
      if (status >= 200 && status < 300) statusEl.className = "success-text";
      else if (status >= 400 && status < 500)
        statusEl.className = "warning-text";
      else if (status >= 500) statusEl.className = "error-text";
    } else {
      statusEl.textContent = "-";
    }

    document.getElementById("ovDuration").textContent = entry.response
      ?.duration_ms
      ? `${entry.response.duration_ms}ms`
      : "-";
    document.getElementById("ovRequestId").textContent =
      entry.response?.request_id || "-";

    // Tokens
    const tokens = entry.summary?.tokens_used;
    if (tokens) {
      document.getElementById("ovTokens").textContent = `Input: ${
        tokens.input || 0
      }, Output: ${tokens.output || 0}`;
    } else {
      document.getElementById("ovTokens").textContent = "-";
    }

    // Rate limits
    const rateLimits = entry.response?.rate_limits;
    const rateLimitsEl = document.getElementById("ovRateLimits");
    if (rateLimits && Object.keys(rateLimits).length > 0) {
      rateLimitsEl.innerHTML = Object.entries(rateLimits)
        .map(
          ([key, value]) => `
                    <div class="rate-limit-item">
                        <span class="rate-limit-name">${this.formatRateLimitName(
                          key
                        )}</span>
                        <span class="rate-limit-value">${value}</span>
                    </div>
                `
        )
        .join("");
    } else {
      rateLimitsEl.innerHTML =
        '<span class="text-muted">No rate limit information</span>';
    }
  }

  populateRequest(entry) {
    // Headers
    const headersEl = document.getElementById("requestHeaders");
    if (
      entry.request?.headers &&
      Object.keys(entry.request.headers).length > 0
    ) {
      headersEl.innerHTML = this.renderHeadersTable(entry.request.headers);
    } else {
      headersEl.innerHTML = '<span class="text-muted">No headers</span>';
    }

    // Body
    const bodyEl = document.getElementById("requestBody");
    if (entry.request?.body) {
      try {
        renderInteractiveJson(bodyEl, entry.request.body);
      } catch (error) {
        // Error is already displayed in the element by renderInteractiveJson
        console.error("Failed to render request body:", error);
      }
    } else {
      bodyEl.textContent = "No request body";
    }
  }

  populateResponse(entry) {
    // Headers
    const headersEl = document.getElementById("responseHeaders");
    if (
      entry.response?.headers &&
      Object.keys(entry.response.headers).length > 0
    ) {
      headersEl.innerHTML = this.renderHeadersTable(entry.response.headers);
    } else {
      headersEl.innerHTML = '<span class="text-muted">No headers</span>';
    }

    // Body
    const bodyEl = document.getElementById("responseBody");
    if (entry.response?.body) {
      try {
        renderInteractiveJson(bodyEl, entry.response.body);
      } catch (error) {
        // Error is already displayed in the element by renderInteractiveJson
        console.error("Failed to render response body:", error);
      }
    } else if (entry.response?.body_raw) {
      // Show raw SSE stream
      bodyEl.textContent = entry.response.body_raw;
    } else {
      bodyEl.textContent = "No response body";
    }
  }

  populateHeaders(entry) {
    // Request headers detail
    const reqHeadersEl = document.getElementById("reqHeadersDetail");
    if (
      entry.request?.headers &&
      Object.keys(entry.request.headers).length > 0
    ) {
      reqHeadersEl.innerHTML = this.renderHeadersList(entry.request.headers);
    } else {
      reqHeadersEl.innerHTML =
        '<span class="text-muted">No request headers</span>';
    }

    // Response headers detail
    const respHeadersEl = document.getElementById("respHeadersDetail");
    if (
      entry.response?.headers &&
      Object.keys(entry.response.headers).length > 0
    ) {
      respHeadersEl.innerHTML = this.renderHeadersList(entry.response.headers);
    } else {
      respHeadersEl.innerHTML =
        '<span class="text-muted">No response headers</span>';
    }
  }

  populateEvents(entry) {
    const eventsEl = document.getElementById("sseEvents");

    if (
      entry.response?.parsed_events &&
      entry.response.parsed_events.length > 0
    ) {
      eventsEl.innerHTML = entry.response.parsed_events
        .map(
          (event, index) => `
                <div class="event-item">
                    <div class="event-type">Event: ${event.type}</div>
                    ${
                      event.data
                        ? `
                        <div class="event-data">
                            <pre class="event-data-json" data-event-index="${index}"></pre>
                        </div>
                    `
                        : ""
                    }
                </div>
            `
        )
        .join("");

      // Render interactive JSON for each event after DOM update
      entry.response.parsed_events.forEach((event, index) => {
        if (event.data) {
          const eventEl = eventsEl.querySelector(
            `[data-event-index="${index}"]`
          );
          if (eventEl) {
            try {
              // For Events tab, expand everything since it's shallow data
              renderInteractiveJson(eventEl, event.data, {
                forceExpand: true, // Expand all nodes in events
              });
            } catch (error) {
              // Error is already displayed in the element by renderInteractiveJson
              console.error(`Failed to render event ${index}:`, error);
            }
          }
        }
      });
    } else {
      eventsEl.innerHTML = '<span class="text-muted">No SSE events</span>';
    }
  }

  populateRawJson(entry) {
    const rawEl = document.getElementById("rawJson");
    try {
      // For Raw JSON tab, show actual raw JSON text (not interactive)
      // This follows the principle of showing the raw data as-is
      const jsonData = entry.raw_entry || entry;
      const jsonString = JSON.stringify(jsonData, null, 2);

      // Use textContent to preserve formatting and prevent any HTML interpretation
      rawEl.textContent = jsonString;

      // Add a simple class for syntax highlighting if CSS supports it
      rawEl.className = "json-display json-raw-text";
    } catch (error) {
      rawEl.textContent = `Error formatting JSON: ${error.message}`;
      console.error("Failed to render raw JSON:", error);
    }
  }

  populatePreview(entry) {
    const previewEl = document.getElementById("previewContent");

    // Create comprehensive debug view
    let content = '<div class="debug-inspector">';

    // Request Messages Section
    if (
      entry.request?.body?.messages &&
      Array.isArray(entry.request.body.messages)
    ) {
      content += '<div class="debug-section">';
      content += '<h4 class="debug-section-title">📥 Request Messages</h4>';
      content += '<div class="debug-messages">';

      entry.request.body.messages.forEach((msg, idx) => {
        content += `<div class="debug-message">`;
        content += `<div class="debug-message-header">`;
        content += `<span class="debug-message-index">#${idx + 1}</span>`;
        content += `<span class="debug-role debug-role-${msg.role}">${msg.role}</span>`;
        content += `</div>`;

        // Render the entire message content structure
        content += '<div class="debug-message-content">';
        content += this.renderContentDebug(msg.content, "Request");
        content += "</div>";
        content += "</div>";
      });

      content += "</div>";
      content += "</div>";
    }

    // Response Messages Section (from streaming events)
    if (
      entry.response?.parsed_events &&
      entry.response.parsed_events.length > 0
    ) {
      content += '<div class="debug-section">';
      content +=
        '<h4 class="debug-section-title">📤 Response Stream Events</h4>';
      content += '<div class="debug-stream">';

      // Group events by type
      const eventGroups = {};
      entry.response.parsed_events.forEach((event) => {
        if (!eventGroups[event.type]) {
          eventGroups[event.type] = [];
        }
        eventGroups[event.type].push(event);
      });

      // Reconstruct assistant message from stream
      let assistantContent = [];
      let currentTextBlock = "";

      entry.response.parsed_events.forEach((event) => {
        if (event.type === "content_block_start" && event.data?.content_block) {
          if (currentTextBlock) {
            assistantContent.push({ type: "text", text: currentTextBlock });
            currentTextBlock = "";
          }
          if (event.data.content_block.type === "tool_use") {
            assistantContent.push(event.data.content_block);
          }
        } else if (
          event.type === "content_block_delta" &&
          event.data?.delta?.text
        ) {
          currentTextBlock += event.data.delta.text;
        } else if (event.type === "content_block_stop") {
          if (currentTextBlock) {
            assistantContent.push({ type: "text", text: currentTextBlock });
            currentTextBlock = "";
          }
        }
      });

      // Add any remaining text
      if (currentTextBlock) {
        assistantContent.push({ type: "text", text: currentTextBlock });
      }

      // Display reconstructed content
      if (assistantContent.length > 0) {
        content += '<div class="debug-message">';
        content += '<div class="debug-message-header">';
        content +=
          '<span class="debug-role debug-role-assistant">assistant (from stream)</span>';
        content += "</div>";
        content += '<div class="debug-message-content">';
        content += this.renderContentDebug(assistantContent, "Response");
        content += "</div>";
        content += "</div>";
      }

      // Show event type summary
      content += '<details class="debug-event-details">';
      content +=
        '<summary class="debug-event-summary">Stream Event Types</summary>';
      content += '<div class="debug-event-types">';
      Object.entries(eventGroups).forEach(([type, events]) => {
        content += `<div class="debug-event-type">`;
        content += `<span class="debug-event-type-name">${type}</span>`;
        content += `<span class="debug-event-count">${events.length}</span>`;
        content += `</div>`;
      });
      content += "</div>";
      content += "</details>";

      content += "</div>";
      content += "</div>";
    }

    // Direct Response Body Section
    if (entry.response?.body) {
      content += '<div class="debug-section">';
      content += '<h4 class="debug-section-title">📤 Response Body</h4>';
      content += '<div class="debug-response-body">';

      if (entry.response.body.content) {
        content += this.renderContentDebug(
          entry.response.body.content,
          "Response"
        );
      } else if (entry.response.body.type === "error") {
        content += '<div class="debug-error">';
        content += `<div class="debug-error-type">${
          entry.response.body.error?.type || "Unknown Error"
        }</div>`;
        content += `<div class="debug-error-message">${this.escapeHtml(
          entry.response.body.error?.message || "No error message"
        )}</div>`;
        content += "</div>";
      } else {
        // Show the raw body structure
        content += this.renderJsonDebug(entry.response.body);
      }

      content += "</div>";
      content += "</div>";
    }

    content += "</div>";
    previewEl.innerHTML =
      content || '<p class="text-muted">No content to preview</p>';
  }

  renderContentDebug(content, context = "") {
    if (!content) return '<span class="debug-null">null</span>';

    // Handle string content (simple message)
    if (typeof content === "string") {
      return `<div class="debug-text-content">${this.renderMarkdown(
        content
      )}</div>`;
    }

    // Handle array of content blocks
    if (Array.isArray(content)) {
      let html = '<div class="debug-content-blocks">';

      content.forEach((block, idx) => {
        html += '<div class="debug-content-block">';

        if (block.type === "text") {
          html += '<div class="debug-block-type">📝 text</div>';
          html += `<div class="debug-text-content">${this.renderMarkdown(
            block.text || ""
          )}</div>`;
        } else if (block.type === "tool_use") {
          html += '<div class="debug-block-type">🔧 tool_use</div>';
          html += '<div class="debug-tool-use">';
          html += `<div class="debug-tool-name">Tool: ${this.escapeHtml(
            block.name
          )}</div>`;
          html += `<div class="debug-tool-id">ID: ${this.escapeHtml(
            block.id
          )}</div>`;
          html += '<div class="debug-tool-input">';
          html += '<div class="debug-label">Input:</div>';
          html += this.renderJsonDebug(block.input || {});
          html += "</div>";
          html += "</div>";
        } else if (block.type === "tool_result") {
          html += '<div class="debug-block-type">✅ tool_result</div>';
          html += '<div class="debug-tool-result">';
          html += `<div class="debug-tool-id">Tool Use ID: ${this.escapeHtml(
            block.tool_use_id
          )}</div>`;
          html += '<div class="debug-tool-output">';
          html += '<div class="debug-label">Output:</div>';
          if (typeof block.content === "string") {
            html += `<div class="debug-text-content">${this.renderMarkdown(
              block.content
            )}</div>`;
          } else {
            html += this.renderJsonDebug(block.content);
          }
          if (block.is_error) {
            html += '<div class="debug-error-flag">⚠️ Error Result</div>';
          }
          html += "</div>";
          html += "</div>";
        } else if (block.type === "image") {
          html += '<div class="debug-block-type">🖼️ image</div>';
          html += '<div class="debug-image">';
          html += `<div class="debug-image-source">Source: ${this.escapeHtml(
            block.source?.type || "unknown"
          )}</div>`;
          if (block.source?.media_type) {
            html += `<div class="debug-image-type">Type: ${this.escapeHtml(
              block.source.media_type
            )}</div>`;
          }
          if (block.source?.data) {
            html += `<div class="debug-image-data">Data: ${block.source.data.substring(
              0,
              50
            )}...</div>`;
          }
          html += "</div>";
        } else {
          // Unknown block type - show raw structure
          html += `<div class="debug-block-type">❓ ${this.escapeHtml(
            block.type || "unknown"
          )}</div>`;
          html += '<div class="debug-unknown-block">';
          html += this.renderJsonDebug(block);
          html += "</div>";
        }

        html += "</div>";
      });

      html += "</div>";
      return html;
    }

    // Handle object content
    return this.renderJsonDebug(content);
  }

  renderJsonDebug(obj, depth = 0) {
    if (obj === null) return '<span class="debug-null">null</span>';
    if (obj === undefined)
      return '<span class="debug-undefined">undefined</span>';

    const type = typeof obj;

    if (type === "string") {
      // Preserve newlines and formatting in strings
      const escaped = this.escapeHtml(obj);
      if (obj.includes("\n") || obj.length > 100) {
        return `<pre class="debug-string-multiline">${escaped}</pre>`;
      }
      return `<span class="debug-string">"${escaped}"</span>`;
    }

    if (type === "number") {
      return `<span class="debug-number">${obj}</span>`;
    }

    if (type === "boolean") {
      return `<span class="debug-boolean">${obj}</span>`;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return '<span class="debug-empty">[]</span>';
      }

      let html = '<div class="debug-array">';
      html += '<span class="debug-bracket">[</span>';
      html += '<div class="debug-array-items">';

      obj.forEach((item, idx) => {
        html += '<div class="debug-array-item">';
        html += `<span class="debug-index">${idx}:</span>`;
        html += this.renderJsonDebug(item, depth + 1);
        if (idx < obj.length - 1) {
          html += '<span class="debug-comma">,</span>';
        }
        html += "</div>";
      });

      html += "</div>";
      html += '<span class="debug-bracket">]</span>';
      html += "</div>";
      return html;
    }

    if (type === "object") {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return '<span class="debug-empty">{}</span>';
      }

      let html = '<div class="debug-object">';
      html += '<span class="debug-bracket">{</span>';
      html += '<div class="debug-object-props">';

      keys.forEach((key, idx) => {
        html += '<div class="debug-object-prop">';
        html += `<span class="debug-key">"${this.escapeHtml(key)}":</span>`;
        html += this.renderJsonDebug(obj[key], depth + 1);
        if (idx < keys.length - 1) {
          html += '<span class="debug-comma">,</span>';
        }
        html += "</div>";
      });

      html += "</div>";
      html += '<span class="debug-bracket">}</span>';
      html += "</div>";
      return html;
    }

    return `<span class="debug-unknown">${this.escapeHtml(String(obj))}</span>`;
  }

  renderMarkdown(text) {
    // Raw markdown with proper newline handling
    if (!text) return "";

    // Escape HTML to prevent any rendering
    let html = this.escapeHtml(text);

    // Convert newlines to <br> tags to preserve formatting
    html = html.replace(/\n/g, "<br>");

    // Preserve spaces for indentation (convert multiple spaces to non-breaking spaces)
    html = html.replace(/ {2,}/g, (match) => "&nbsp;".repeat(match.length));

    // Wrap in a monospace font container for consistency
    return `<pre style="font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; white-space: pre-wrap; word-wrap: break-word; margin: 0; background: transparent; border: none; padding: 0;">${html}</pre>`;
  }

  renderHeadersTable(headers) {
    return Object.entries(headers)
      .map(
        ([key, value]) => `
                <div class="header-row">
                    <div class="header-name">${this.escapeHtml(key)}</div>
                    <div class="header-value">${this.escapeHtml(value)}</div>
                </div>
            `
      )
      .join("");
  }

  renderHeadersList(headers) {
    return Object.entries(headers)
      .map(
        ([key, value]) => `
                <div class="header-row">
                    <div class="header-name">${this.escapeHtml(key)}</div>
                    <div class="header-value">${this.escapeHtml(value)}</div>
                </div>
            `
      )
      .join("");
  }

  formatRateLimitName(name) {
    // Clean up rate limit header names
    return name
      .replace("anthropic-ratelimit-", "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  switchTab(tabName) {
    // Update buttons
    this.tabButtons.forEach((btn) => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Update panes
    this.tabPanes.forEach((pane) => {
      if (pane.id === `${tabName}Tab`) {
        pane.classList.add("active");
      } else {
        pane.classList.remove("active");
      }
    });
  }

  applyFilters() {
    const searchTerm = this.searchInput.value.toLowerCase();
    const statusFilter = this.statusFilter.value;
    const methodFilter = this.methodFilter.value;
    const agentFilter = this.agentFilter.value;

    this.filteredEntries = this.entries.filter((entry) => {
      // Search filter
      if (searchTerm) {
        const searchableText = [
          entry.request?.url,
          entry.request?.method,
          entry.response?.status_code?.toString(),
          entry.response?.request_id,
          JSON.stringify(entry.request?.body),
          entry.subagent_info?.agent_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(searchTerm)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter) {
        const status = entry.response?.status_code || entry.summary?.status;
        if (!status) return false;

        if (statusFilter === "2xx" && (status < 200 || status >= 300))
          return false;
        if (statusFilter === "4xx" && (status < 400 || status >= 500))
          return false;
        if (statusFilter === "5xx" && status < 500) return false;
      }

      // Agent filter
      if (agentFilter) {
        const isSubagent = entry.subagent_info?.is_subagent || false;

        if (agentFilter === "main" && isSubagent) return false;
        if (agentFilter === "subagent" && !isSubagent) return false;

        // Handle individual agent type filtering
        if (agentFilter.startsWith("agent:")) {
          const selectedAgent = agentFilter.substring(6); // Remove 'agent:' prefix
          if (entry.subagent_info?.agent_type !== selectedAgent) {
            return false;
          }
        }
      }

      // Method filter
      if (methodFilter) {
        const method = entry.request?.method || entry.summary?.method;
        if (method !== methodFilter) return false;
      }

      return true;
    });

    this.renderEntryList();
  }

  clearFilters() {
    this.searchInput.value = "";
    this.statusFilter.value = "";
    this.methodFilter.value = "";
    this.agentFilter.value = "";
    this.applyFilters();
  }

  closeDetailPanel() {
    this.detailPanel.classList.add("hidden");
    this.selectedEntry = null;

    // Remove selection
    document.querySelectorAll(".entry-item").forEach((el) => {
      el.classList.remove("selected");
    });
  }

  copyRequestIdToClipboard() {
    if (this.selectedEntry?.response?.request_id) {
      this.copyToClipboard(this.selectedEntry.response.request_id);
      this.showToast("Request ID copied!");
    }
  }

  copyUrlToClipboard() {
    if (this.selectedEntry?.request?.url) {
      this.copyToClipboard(this.selectedEntry.request.url);
      this.showToast("URL copied!");
    }
  }

  copyRawJson() {
    const rawEl = document.getElementById("rawJson");
    if (rawEl && rawEl.textContent) {
      this.copyToClipboard(rawEl.textContent);
      this.showToast("Raw JSON copied!");
    }
  }

  downloadRawJson() {
    if (!this.selectedEntry) return;

    const data = JSON.stringify(
      this.selectedEntry.raw_entry || this.selectedEntry,
      null,
      2
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-entry-${this.selectedEntry.index}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportCurrentEntry() {
    this.downloadRawJson();
  }

  copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }

  showToast(message) {
    // Simple toast notification
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--accent);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            z-index: 1001;
            animation: slideIn 0.3s;
        `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  showLoading() {
    this.loadingOverlay.classList.remove("hidden");
  }

  hideLoading() {
    this.loadingOverlay.classList.add("hidden");
  }

  showError(message) {
    this.entryList.innerHTML = `
            <div class="welcome-message">
                <h2 style="color: var(--error)">Error</h2>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
  }

  escapeHtml(text) {
    if (text === null || text === undefined) return "";
    const div = document.createElement("div");
    div.textContent = text.toString();
    return div.innerHTML;
  }
}

// Check for critical dependencies on page load
window.addEventListener("load", () => {
  // Check if JSON viewer library loaded successfully
  if (!window.JSONViewer) {
    console.error(
      "Critical dependency missing: JSON Viewer library failed to load"
    );

    // Create a warning banner at the top of the page
    const warningBanner = document.createElement("div");
    warningBanner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #ff4444;
            color: white;
            padding: 12px 20px;
            font-family: monospace;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
    warningBanner.innerHTML = `
            <strong>⚠️ Critical Library Missing:</strong>
            JSON Viewer failed to load properly.
            Interactive JSON viewing will not work.
            Check console for details.
            <button onclick="this.parentElement.remove()" style="
                float: right;
                background: transparent;
                border: 1px solid white;
                color: white;
                padding: 2px 8px;
                cursor: pointer;
                margin-left: 10px;
            ">✕</button>
        `;
    document.body.appendChild(warningBanner);
  }
});

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new TraceDebugger();
});

// Add slide-in animation for toasts
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
