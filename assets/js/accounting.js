(function () {
  const table = document.getElementById("accounting-requests-table");
  const errorBox = document.getElementById("accounting-error");
  const pendingCount = document.getElementById("accounting-pending-count");
  const doneCount = document.getElementById("accounting-done-count");
  const lastDate = document.getElementById("accounting-last-date");
  const refreshButton = document.getElementById("accounting-refresh-btn");
  const logoutButton = document.getElementById("accounting-logout-btn");
  const filterButtons = Array.from(document.querySelectorAll("[data-accounting-filter]"));
  const periodButtons = Array.from(document.querySelectorAll("[data-period]"));
  const periodSummary = document.getElementById("period-summary");
  const periodTotalCount = document.getElementById("period-total-count");
  const periodTotalAmount = document.getElementById("period-total-amount");
  const periodProcessedRate = document.getElementById("period-processed-rate");
  const periodFlowChart = document.getElementById("period-flow-chart");
  const periodStatusChart = document.getElementById("period-status-chart");
  const periodSummaryTable = document.getElementById("period-summary-table");

  let activeFilter = "pending";
  let activePeriod = "week";
  let currentUser = null;
  let currentProfile = null;
  let rows = [];
  let allRows = [];

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") return "-";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  function amount(row) {
    return Number(row.validation?.intervention_price || 0);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfWeek(date) {
    const start = startOfDay(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return start;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function startOfYear(date) {
    return new Date(date.getFullYear(), 0, 1);
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function addMonths(date, months) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  function periodConfig(period) {
    const now = new Date();
    if (period === "year") {
      const start = startOfYear(now);
      return {
        label: "annee",
        start,
        buckets: Array.from({ length: 12 }, (_, index) => {
          const bucketStart = new Date(now.getFullYear(), index, 1);
          return {
            key: bucketStart.toISOString(),
            label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(bucketStart),
            start: bucketStart,
            end: addMonths(bucketStart, 1)
          };
        })
      };
    }

    if (period === "month") {
      const start = startOfMonth(now);
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return {
        label: "mois",
        start,
        buckets: Array.from({ length: days }, (_, index) => {
          const bucketStart = new Date(now.getFullYear(), now.getMonth(), index + 1);
          return {
            key: bucketStart.toISOString(),
            label: String(index + 1),
            start: bucketStart,
            end: addDays(bucketStart, 1)
          };
        })
      };
    }

    const start = startOfWeek(now);
    return {
      label: "semaine",
      start,
      buckets: Array.from({ length: 7 }, (_, index) => {
        const bucketStart = addDays(start, index);
        return {
          key: bucketStart.toISOString(),
          label: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(bucketStart),
          start: bucketStart,
          end: addDays(bucketStart, 1)
        };
      })
    };
  }

  function rowsForBucket(sourceRows, bucket) {
    return sourceRows.filter((row) => {
      const createdAt = new Date(row.created_at);
      return createdAt >= bucket.start && createdAt < bucket.end;
    });
  }

  function summarize(sourceRows) {
    const processed = sourceRows.filter((row) => row.status === "processed").length;
    const pending = sourceRows.length - processed;
    const totalAmount = sourceRows.reduce((sum, row) => sum + amount(row), 0);
    return {
      total: sourceRows.length,
      pending,
      processed,
      totalAmount,
      processedRate: sourceRows.length ? Math.round((processed / sourceRows.length) * 100) : 0
    };
  }

  function renderFlowChart(buckets) {
    const max = Math.max(1, ...buckets.map((bucket) => bucket.summary.total));
    periodFlowChart.innerHTML = buckets.map((bucket) => {
      const height = Math.max(8, Math.round((bucket.summary.total / max) * 100));
      return `
        <div class="flow-bar-item">
          <div class="flow-bar-track">
            <span class="flow-bar" style="height:${height}%"></span>
          </div>
          <span class="flow-bar-label">${escapeHtml(bucket.label)}</span>
        </div>
      `;
    }).join("");
  }

  function renderStatusChart(summary) {
    const pendingWidth = summary.total ? Math.round((summary.pending / summary.total) * 100) : 0;
    const processedWidth = summary.total ? 100 - pendingWidth : 0;
    periodStatusChart.innerHTML = `
      <div class="status-meter">
        <span class="status-meter-pending" style="width:${pendingWidth}%"></span>
        <span class="status-meter-processed" style="width:${processedWidth}%"></span>
      </div>
      <div class="status-legend">
        <span><i class="legend-dot legend-pending"></i>A traiter: ${summary.pending}</span>
        <span><i class="legend-dot legend-processed"></i>Traitees: ${summary.processed}</span>
      </div>
    `;
  }

  function renderPeriodAnalysis() {
    const config = periodConfig(activePeriod);
    const periodRows = allRows.filter((row) => new Date(row.created_at) >= config.start);
    const summary = summarize(periodRows);
    const buckets = config.buckets.map((bucket) => ({
      ...bucket,
      rows: rowsForBucket(allRows, bucket)
    })).map((bucket) => ({
      ...bucket,
      summary: summarize(bucket.rows)
    }));

    periodSummary.textContent = `Vue ${config.label}: ${summary.total} demande(s), ${summary.pending} a traiter, ${summary.processed} traitee(s).`;
    periodTotalCount.textContent = summary.total;
    periodTotalAmount.textContent = formatPrice(summary.totalAmount);
    periodProcessedRate.textContent = `${summary.processedRate}%`;
    renderFlowChart(buckets);
    renderStatusChart(summary);

    const visibleBuckets = buckets.filter((bucket) => bucket.summary.total > 0);
    periodSummaryTable.innerHTML = visibleBuckets.length ? visibleBuckets.map((bucket) => `
      <tr class="border-b">
        <td class="px-4 py-3 font-medium">${escapeHtml(bucket.label)}</td>
        <td class="px-4 py-3 text-slate-600">${bucket.summary.total}</td>
        <td class="px-4 py-3 text-slate-600">${bucket.summary.pending}</td>
        <td class="px-4 py-3 text-slate-600">${bucket.summary.processed}</td>
        <td class="px-4 py-3 text-slate-600">${formatPrice(bucket.summary.totalAmount)}</td>
      </tr>
    `).join("") : '<tr><td class="px-4 py-3 text-slate-500" colspan="5">Aucun flux sur cette periode.</td></tr>';
  }

  function requestBadge(status) {
    if (status === "processed") return '<span class="badge badge-signed">Traitee</span>';
    return '<span class="badge badge-pending">A traiter</span>';
  }

  async function requireAccountingAccess() {
    const client = window.ChantierProof.getClient();
    const sessionResponse = await client.auth.getSession();
    const session = sessionResponse.data.session;

    if (!session) {
      window.location.href = "./login.html";
      return false;
    }

    currentUser = session.user;
    const profileResponse = await client
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileResponse.error) {
      showError(profileResponse.error.message);
      return false;
    }

    currentProfile = profileResponse.data || {};
    if (!["admin", "accountant"].includes(currentProfile.role)) {
      showError("Acces reserve au comptable ou a l'admin.");
      return false;
    }

    return true;
  }

  function renderStats(allRows) {
    pendingCount.textContent = allRows.filter((row) => row.status !== "processed").length;
    doneCount.textContent = allRows.filter((row) => row.status === "processed").length;
    lastDate.textContent = allRows[0]?.created_at ? window.ChantierProof.formatDate(allRows[0].created_at) : "-";
    renderPeriodAnalysis();
  }

  function render() {
    if (!rows.length) {
      table.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="8">Aucune demande comptable pour le moment.</td></tr>';
      return;
    }

    table.innerHTML = rows.map((row) => {
      const validation = row.validation || {};
      const pdfAction = row.pdf_url
        ? `<button class="btn btn-secondary btn-sm open-pdf" type="button" data-pdf="${escapeHtml(row.pdf_url)}">PDF</button>`
        : '<span class="text-slate-500">Aucun PDF</span>';
      const processAction = row.status === "processed"
        ? '<span class="text-slate-500">Terminee</span>'
        : `<button class="btn btn-primary btn-sm process-request" type="button" data-id="${escapeHtml(row.id)}">Marquer traitee</button>`;

      return `
        <tr class="border-b">
          <td class="px-4 py-3 font-medium">${escapeHtml(validation.client_name || "-")}</td>
          <td class="px-4 py-3 text-slate-600">${escapeHtml(validation.intervention_title || "-")}</td>
          <td class="px-4 py-3 text-slate-600">${formatPrice(validation.intervention_price)}</td>
          <td class="px-4 py-3 text-slate-600">${window.ChantierProof.formatDate(row.created_at)}</td>
          <td class="px-4 py-3">${requestBadge(row.status)}</td>
          <td class="px-4 py-3"><a class="text-blue-700 font-semibold" href="./validation-detail.html?id=${encodeURIComponent(validation.id)}">Ouvrir</a></td>
          <td class="px-4 py-3">${pdfAction}</td>
          <td class="px-4 py-3">${processAction}</td>
        </tr>
      `;
    }).join("");
  }

  async function loadRequests() {
    clearError();
    refreshButton.disabled = true;

    try {
      const client = window.ChantierProof.getClient();
      let query = client
        .from("accounting_requests")
        .select([
          "id",
          "created_at",
          "status",
          "pdf_url",
          "validation:validations(id,client_name,intervention_title,intervention_price)"
        ].join(","))
        .order("created_at", { ascending: false });

      if (activeFilter !== "all") {
        query = query.eq("status", activeFilter);
      }

      const response = await query;
      if (response.error) throw response.error;
      rows = response.data || [];
      render();

      const statsResponse = await client
        .from("accounting_requests")
        .select([
          "id",
          "created_at",
          "status",
          "validation:validations(id,intervention_price)"
        ].join(","))
        .order("created_at", { ascending: false });
      if (!statsResponse.error) {
        allRows = statsResponse.data || [];
        renderStats(allRows);
      }
    } catch (error) {
      console.error("Load accounting requests failed:", error);
      rows = [];
      render();
      showError(error.message || "Impossible de charger les demandes comptables.");
    } finally {
      refreshButton.disabled = false;
      window.lucide?.createIcons();
    }
  }

  async function markProcessed(id) {
    const client = window.ChantierProof.getClient();
    const response = await client
      .from("accounting_requests")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        processed_by: currentUser.id
      })
      .eq("id", id);

    if (response.error) throw response.error;
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.accountingFilter;
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      loadRequests();
    });
  });

  periodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activePeriod = button.dataset.period;
      periodButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderPeriodAnalysis();
    });
  });

  refreshButton.addEventListener("click", loadRequests);

  table.addEventListener("click", async (event) => {
    const pdfButton = event.target.closest(".open-pdf");
    const processButton = event.target.closest(".process-request");
    const client = window.ChantierProof.getClient();

    if (pdfButton) {
      try {
        await window.ChantierProof.openPdf(client, pdfButton.dataset.pdf);
      } catch (error) {
        showError(error.message || "PDF indisponible.");
      }
      return;
    }

    if (processButton) {
      processButton.disabled = true;
      clearError();
      try {
        await markProcessed(processButton.dataset.id);
        await loadRequests();
      } catch (error) {
        processButton.disabled = false;
        showError(error.message || "Impossible de traiter la demande.");
      }
    }
  });

  logoutButton.addEventListener("click", async () => {
    const client = window.ChantierProof.getClient();
    await client.auth.signOut();
    window.location.href = "./login.html";
  });

  window.lucide?.createIcons();
  requireAccountingAccess().then((ok) => {
    if (ok) loadRequests();
  });
})();
