/**
 * Virtual Classroom Access Gate - Frontend Controller
 * Handles interactive simulation, LED triggers, live logs, audio feedback, and metrics.
 */

// Student Profile Database (Matches DynamoDB Schema)
const REGISTERED_STUDENTS = {
  "CARD_TAEJASWINI": {
    name: "D. Taejaswini",
    rollNo: "2503A52752",
    tagUid: "A3:4F:91:2B",
    assignedIp: "192.168.10.15",
    subnet: "192.168.10.0/24",
    status: "ALLOWED",
    reason: "Subnet Authorization Verified (Cloud Sec-A)"
  },
  "CARD_MOUNIKA": {
    name: "B. Mounika",
    rollNo: "2503A52756",
    tagUid: "B8:21:7C:90",
    assignedIp: "192.168.10.16",
    subnet: "192.168.10.0/24",
    status: "ALLOWED",
    reason: "Subnet Authorization Verified (Cloud Sec-A)"
  },
  "CARD_PRAGATHI": {
    name: "V. Pragathi Vijaya Lakshmi",
    rollNo: "2503A52761",
    tagUid: "C1:89:33:DE",
    assignedIp: "192.168.10.17",
    subnet: "192.168.10.0/24",
    status: "ALLOWED",
    reason: "Subnet Authorization Verified (Cloud Sec-A)"
  },
  "CARD_SPURTHI": {
    name: "A. Spurthi",
    rollNo: "2503A52764",
    tagUid: "D4:55:1A:F2",
    assignedIp: "192.168.10.18",
    subnet: "192.168.10.0/24",
    status: "ALLOWED",
    reason: "Subnet Authorization Verified (Cloud Sec-A)"
  },
  "CARD_PRANEETHA": {
    name: "Praneetha Kanchi",
    rollNo: "2503A52772",
    tagUid: "E9:60:44:0B",
    assignedIp: "192.168.10.19",
    subnet: "192.168.10.0/24",
    status: "ALLOWED",
    reason: "Subnet Authorization Verified (Cloud Sec-A)"
  },
  "CARD_EXPIRED": {
    name: "Guest Student",
    rollNo: "2503A59999",
    tagUid: "F0:11:82:77",
    assignedIp: "None",
    subnet: "192.168.10.0/24",
    status: "DENIED",
    reason: "Access Expired: Not enrolled in current Lab Subnet"
  },
  "CARD_UNREGISTERED": {
    name: "Unknown Intruder",
    rollNo: "UNKNOWN",
    tagUid: "99:AA:BB:CC",
    assignedIp: "None",
    subnet: "192.168.10.0/24",
    status: "DENIED",
    reason: "RFID UID not found in DynamoDB StudentRoster"
  }
};

// State Store
let accessLogs = [];
let accessChart = null;
let autoScanInterval = null;
let currentFilter = "all";

// Web Audio API Synthesizer for Audio Feedback (Hardware Buzzer simulation)
let audioCtx = null;
function playBuzzerTone(type) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "ALLOWED") {
      // Pleasant double chime for success
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15); // E6
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } else {
      // Low buzz tone for denied
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
      osc.frequency.setValueAtTime(160, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    }
  } catch (e) {
    console.warn("Audio Context not supported or blocked", e);
  }
}

// DOM Elements
const rfidPad = document.getElementById("rfidPad");
const greenLed = document.getElementById("greenLed");
const redLed = document.getElementById("redLed");
const gateBarrier = document.getElementById("gateBarrier");
const gateDoorStatus = document.getElementById("gateDoorStatus");
const tapStatusText = document.getElementById("tapStatusText");
const studentSelect = document.getElementById("studentSelect");
const customUidInput = document.getElementById("customUid");
const tapCardBtn = document.getElementById("tapCardBtn");
const autoScanBtn = document.getElementById("autoScanBtn");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logsTableBody = document.getElementById("logsTableBody");
const emptyLogsMessage = document.getElementById("emptyLogsMessage");
const logSearchInput = document.getElementById("logSearchInput");
const filterTabs = document.querySelectorAll(".filter-tab");

// Metrics DOM
const kpiTotal = document.getElementById("kpiTotal");
const kpiAllowed = document.getElementById("kpiAllowed");
const kpiDenied = document.getElementById("kpiDenied");
const kpiAllowedRate = document.getElementById("kpiAllowedRate");
const kpiDeniedRate = document.getElementById("kpiDeniedRate");
const kpiActiveStudents = document.getElementById("kpiActiveStudents");
const countAll = document.getElementById("countAll");
const countAllowed = document.getElementById("countAllowed");
const countDenied = document.getElementById("countDenied");
const chartAllowedCount = document.getElementById("chartAllowedCount");
const chartDeniedCount = document.getElementById("chartDeniedCount");
const liveClock = document.getElementById("liveClock");

// Live Clock Initializer
function updateClock() {
  const now = new Date();
  liveClock.textContent = now.toTimeString().split(" ")[0] + " IST";
}
setInterval(updateClock, 1000);
updateClock();

// Chart Initialization
function initChart() {
  const ctx = document.getElementById("accessChart").getContext("2d");
  accessChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Access Allowed (Green LED)", "Access Denied (Red LED)"],
      datasets: [{
        data: [0, 0],
        backgroundColor: ["#10b981", "#ef4444"],
        borderColor: ["#0b0f19", "#0b0f19"],
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#9ca3af",
            font: { family: "Plus Jakarta Sans", size: 12 }
          }
        }
      },
      cutout: "70%"
    }
  });
}

// Update KPI Metrics & Chart
function updateMetrics() {
  const total = accessLogs.length;
  const allowed = accessLogs.filter(log => log.decision === "ALLOWED").length;
  const denied = accessLogs.filter(log => log.decision === "DENIED").length;

  kpiTotal.textContent = total;
  kpiAllowed.textContent = allowed;
  kpiDenied.textContent = denied;

  const allowedRate = total > 0 ? Math.round((allowed / total) * 100) : 100;
  const deniedRate = total > 0 ? Math.round((denied / total) * 100) : 0;

  kpiAllowedRate.textContent = `${allowedRate}%`;
  kpiDeniedRate.textContent = `${deniedRate}%`;

  // Count unique active authorized students in the subnet
  const uniqueAllowedStudents = new Set(
    accessLogs.filter(l => l.decision === "ALLOWED").map(l => l.rollNo)
  );
  kpiActiveStudents.textContent = `${uniqueAllowedStudents.size} Active Students`;

  countAll.textContent = total;
  countAllowed.textContent = allowed;
  countDenied.textContent = denied;

  chartAllowedCount.textContent = allowed;
  chartDeniedCount.textContent = denied;

  if (accessChart) {
    accessChart.data.datasets[0].data = [allowed, denied];
    accessChart.update();
  }
}

// Render Table Rows with Filters
function renderTable() {
  const query = logSearchInput.value.toLowerCase().trim();
  const filtered = accessLogs.filter(log => {
    const matchesFilter = (currentFilter === "all") || (log.decision === currentFilter);
    const matchesSearch = query === "" ||
      log.name.toLowerCase().includes(query) ||
      log.rollNo.toLowerCase().includes(query) ||
      log.tagUid.toLowerCase().includes(query) ||
      log.decision.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    logsTableBody.innerHTML = "";
    emptyLogsMessage.style.display = "block";
    return;
  }

  emptyLogsMessage.style.display = "none";
  logsTableBody.innerHTML = filtered.map(log => {
    const isAllowed = log.decision === "ALLOWED";
    const decisionBadgeClass = isAllowed ? "allowed" : "denied";
    const decisionIcon = isAllowed ? "fa-circle-check" : "fa-circle-xmark";
    const ledTagClass = isAllowed ? "green-tag" : "red-tag";
    const ledTagText = isAllowed ? "GREEN LED ON" : "RED LED ON";

    return `
      <tr>
        <td class="mono" style="color: #94a3b8;">${log.timestamp}</td>
        <td><strong>${escapeHtml(log.name)}</strong></td>
        <td><span class="mono">${escapeHtml(log.rollNo)}</span></td>
        <td><span class="mono badge-tag">${escapeHtml(log.tagUid)}</span></td>
        <td><span class="mono" style="color: ${isAllowed ? '#38bdf8' : '#64748b'};">${escapeHtml(log.assignedIp)}</span></td>
        <td>
          <span class="decision-badge ${decisionBadgeClass}">
            <i class="fa-solid ${decisionIcon}"></i> ${log.decision}
          </span>
        </td>
        <td>
          <span class="led-status-tag ${ledTagClass}">
            <span class="pulse-dot" style="background:${isAllowed ? '#10b981' : '#ef4444'};"></span> ${ledTagText}
          </span>
        </td>
        <td style="color: var(--text-muted); font-size: 0.78rem;">${escapeHtml(log.reason)}</td>
      </tr>
    `;
  }).join("");
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>'"]/g, tag => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}

// Base API URL configuration
// When hosted on S3 static website endpoint, it points to the Flask server or custom cloud endpoint
const isS3Hosted = window.location.hostname.includes("s3-website") || window.location.hostname.includes("amazonaws.com");
let API_BASE_URL = localStorage.getItem("VIRTUAL_GATE_API_URL") || (isS3Hosted ? "http://localhost:5000" : "");

// Hardware Gate Activation Animation
function triggerHardwareResponse(decision, details) {
  // Visual pad pulse
  rfidPad.classList.add("scanning");
  tapStatusText.textContent = `Validating UID: ${details.tagUid}...`;

  setTimeout(() => {
    rfidPad.classList.remove("scanning");
    playBuzzerTone(decision);

    if (decision === "ALLOWED") {
      // Green LED On
      greenLed.classList.add("active");
      redLed.classList.remove("active");
      gateBarrier.parentElement.classList.add("open");
      gateDoorStatus.textContent = "GATE OPEN &bull; ACCESS GRANTED";
      tapStatusText.textContent = `Access Granted to ${details.name}`;

      // Reset gate barrier and LED after 2.4 seconds
      setTimeout(() => {
        greenLed.classList.remove("active");
        gateBarrier.parentElement.classList.remove("open");
        gateDoorStatus.textContent = "GATE LOCKED";
        tapStatusText.textContent = "Ready for Card Tap";
      }, 2400);

    } else {
      // Red LED On
      redLed.classList.add("active");
      greenLed.classList.remove("active");
      gateBarrier.parentElement.classList.remove("open");
      gateDoorStatus.textContent = "ACCESS DENIED &bull; GATE LOCKED";
      tapStatusText.textContent = `DENIED: ${details.reason}`;

      // Reset red LED after 2 seconds
      setTimeout(() => {
        redLed.classList.remove("active");
        gateDoorStatus.textContent = "GATE LOCKED";
        tapStatusText.textContent = "Ready for Card Tap";
      }, 2000);
    }
  }, 350);
}

// Execute RFID Scan
function performRfidScan(selectedKey, manualUid = "") {
  let record;
  const timeStr = new Date().toLocaleTimeString("en-US", { hour12: false });

  if (manualUid && manualUid.trim() !== "") {
    const cleanUid = manualUid.trim().toUpperCase();
    // Search in registered students
    const foundKey = Object.keys(REGISTERED_STUDENTS).find(
      k => REGISTERED_STUDENTS[k].tagUid.toUpperCase() === cleanUid
    );

    if (foundKey) {
      const student = REGISTERED_STUDENTS[foundKey];
      record = {
        timestamp: timeStr,
        name: student.name,
        rollNo: student.rollNo,
        tagUid: student.tagUid,
        assignedIp: student.assignedIp,
        decision: student.status,
        reason: student.reason
      };
    } else {
      record = {
        timestamp: timeStr,
        name: "Unknown Visitor / Unassigned Tag",
        rollNo: "UNREGISTERED",
        tagUid: cleanUid,
        assignedIp: "None",
        decision: "DENIED",
        reason: "Unknown Tag: Not found in DynamoDB StudentRoster"
      };
    }
  } else {
    const student = REGISTERED_STUDENTS[selectedKey] || REGISTERED_STUDENTS["CARD_TAEJASWINI"];
    record = {
      timestamp: timeStr,
      name: student.name,
      rollNo: student.rollNo,
      tagUid: student.tagUid,
      assignedIp: student.assignedIp,
      decision: student.status,
      reason: student.reason
    };
  }

  // Trigger hardware animations
  triggerHardwareResponse(record.decision, record);

  // Add to in-memory logs (prepended)
  accessLogs.unshift(record);

  // Update UI
  updateMetrics();
  renderTable();

  // Optionally POST to Python Flask backend or cloud API if server is active
  fetch(`${API_BASE_URL}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  }).catch(() => {
    // Offline / Standalone mode active, perfectly fine
  });
}

// Seed Initial Sample Data for Presentation Demo
function seedDemoData() {
  const sampleEvents = [
    {
      timestamp: "10:14:02",
      name: "Praneetha Kanchi",
      rollNo: "2503A52772",
      tagUid: "E9:60:44:0B",
      assignedIp: "192.168.10.19",
      decision: "ALLOWED",
      reason: "Subnet Authorization Verified (Cloud Sec-A)"
    },
    {
      timestamp: "10:11:45",
      name: "A. Spurthi",
      rollNo: "2503A52764",
      tagUid: "D4:55:1A:F2",
      assignedIp: "192.168.10.18",
      decision: "ALLOWED",
      reason: "Subnet Authorization Verified (Cloud Sec-A)"
    },
    {
      timestamp: "10:08:30",
      name: "Guest Student",
      rollNo: "2503A59999",
      tagUid: "F0:11:82:77",
      assignedIp: "None",
      decision: "DENIED",
      reason: "Access Expired: Not enrolled in current Lab Subnet"
    },
    {
      timestamp: "10:05:12",
      name: "V. Pragathi Vijaya Lakshmi",
      rollNo: "2503A52761",
      tagUid: "C1:89:33:DE",
      assignedIp: "192.168.10.17",
      decision: "ALLOWED",
      reason: "Subnet Authorization Verified (Cloud Sec-A)"
    },
    {
      timestamp: "10:02:18",
      name: "B. Mounika",
      rollNo: "2503A52756",
      tagUid: "B8:21:7C:90",
      assignedIp: "192.168.10.16",
      decision: "ALLOWED",
      reason: "Subnet Authorization Verified (Cloud Sec-A)"
    },
    {
      timestamp: "09:58:40",
      name: "D. Taejaswini",
      rollNo: "2503A52752",
      tagUid: "A3:4F:91:2B",
      assignedIp: "192.168.10.15",
      decision: "ALLOWED",
      reason: "Subnet Authorization Verified (Cloud Sec-A)"
    }
  ];

  accessLogs = [...sampleEvents];
  updateMetrics();
  renderTable();
}

// Export Table to CSV
function exportLogsToCSV() {
  if (accessLogs.length === 0) {
    alert("No access logs available to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Timestamp,Student Name,Roll Number,RFID Tag UID,Assigned Subnet IP,Decision,Reason\n";

  accessLogs.forEach(row => {
    const line = [
      `"${row.timestamp}"`,
      `"${row.name}"`,
      `"${row.rollNo}"`,
      `"${row.tagUid}"`,
      `"${row.assignedIp}"`,
      `"${row.decision}"`,
      `"${row.reason}"`
    ].join(",");
    csvContent += line + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `VirtualClassroom_Gate_Logs_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Event Listeners
tapCardBtn.addEventListener("click", () => {
  const selectedKey = studentSelect.value;
  const customUid = customUidInput.value.trim();
  performRfidScan(selectedKey, customUid);
});

rfidPad.addEventListener("click", () => {
  tapCardBtn.click();
});

// Auto Traffic Toggle
autoScanBtn.addEventListener("click", () => {
  if (autoScanInterval) {
    clearInterval(autoScanInterval);
    autoScanInterval = null;
    autoScanBtn.innerHTML = '<i class="fa-solid fa-play"></i> Auto-Generate Traffic';
    autoScanBtn.classList.remove("btn-primary");
    autoScanBtn.classList.add("btn-outline");
  } else {
    autoScanBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Auto Traffic';
    autoScanBtn.classList.remove("btn-outline");
    autoScanBtn.classList.add("btn-primary");

    const keys = Object.keys(REGISTERED_STUDENTS);
    autoScanInterval = setInterval(() => {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      performRfidScan(randomKey);
    }, 3800);
  }
});

clearLogsBtn.addEventListener("click", () => {
  if (confirm("Reset all access logs?")) {
    accessLogs = [];
    updateMetrics();
    renderTable();
  }
});

exportCsvBtn.addEventListener("click", exportLogsToCSV);

// Fetch live logs from AWS via Backend API
function fetchCloudLogs(isManual = false) {
  if (isManual) {
    refreshBtn.classList.add("fa-spin");
    setTimeout(() => refreshBtn.classList.remove("fa-spin"), 600);
  }

  fetch(`${API_BASE_URL}/api/logs`)
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        accessLogs = data;
        updateMetrics();
        renderTable();
      }
    })
    .catch(() => {
      // Standalone mode active
    });
}

// Check Backend & AWS Connection Status
function checkBackendStatus() {
  fetch(`${API_BASE_URL}/api/status`)
    .then(res => res.json())
    .then(data => {
      const brokerText = document.querySelector(".status-indicator span:last-child");
      if (brokerText && data.aws_connected) {
        brokerText.innerHTML = `Broker: <b style="color:#10b981;">AWS Cloud Connected</b>`;
      }
    })
    .catch(() => {});
}

refreshBtn.addEventListener("click", () => fetchCloudLogs(true));

logSearchInput.addEventListener("input", renderTable);

filterTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    filterTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.getAttribute("data-filter");
    renderTable();
  });
});

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  initChart();
  seedDemoData();
  checkBackendStatus();
  fetchCloudLogs();
  // Poll backend for real-time AWS DynamoDB updates every 5 seconds
  setInterval(fetchCloudLogs, 5000);
});
