const $ = (id) => document.getElementById(id);

const state = { file: null, conf: 0.25, iou: 0.45 };

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
    btn.classList.add("is-active");
    $("panel-" + btn.dataset.tab).classList.add("is-active");
    if (btn.dataset.tab === "about") loadAbout();
  });
});

function bindDrop(zone, input, handler) {
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => handler(input.files));
  ["dragover", "dragenter"].forEach((e) =>
    zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add("is-over"); })
  );
  ["dragleave", "drop"].forEach((e) =>
    zone.addEventListener(e, () => zone.classList.remove("is-over"))
  );
  zone.addEventListener("drop", (ev) => { ev.preventDefault(); handler(ev.dataTransfer.files); });
}

$("conf").addEventListener("input", (e) => {
  state.conf = e.target.value / 100;
  $("conf-val").textContent = state.conf.toFixed(2);
  if (state.file) runSingle();
});

$("iou").addEventListener("input", (e) => {
  state.iou = e.target.value / 100;
  $("iou-val").textContent = state.iou.toFixed(2);
  if (state.file) runSingle();
});

bindDrop($("drop"), $("file"), (files) => {
  if (files.length) { state.file = files[0]; runSingle(); }
});

const SAMPLES = [
  "BloodImage_00038_jpg.rf.ffa23e4b5b55b523367f332af726eae8.jpg",
  "BloodImage_00044_jpg.rf.e7760375eba4bc20c5746367e2311e18.jpg",
  "BloodImage_00062_jpg.rf.1be1ca0ecdf783798fc10346baaa203e.jpg",
  "BloodImage_00090_jpg.rf.cdbf8f6ed3b93fa902a0bc991132cb40.jpg",
  "BloodImage_00099_jpg.rf.e3c42cd68359527494a53843479dff5c.jpg",
  "BloodImage_00112_jpg.rf.978cec39235980055c2ad7ff8b6f1912.jpg",
];

SAMPLES.forEach((name) => {
  const img = document.createElement("img");
  img.src = "/samples/" + name;
  img.alt = name;
  img.addEventListener("click", async () => {
    const blob = await (await fetch(img.src)).blob();
    state.file = new File([blob], name, { type: "image/jpeg" });
    runSingle();
  });
  $("samples").appendChild(img);
});

async function runSingle() {
  const body = new FormData();
  body.append("file", state.file);

  $("empty").innerHTML = '<div class="spinner"></div>Analiz ediliyor…';
  $("empty").hidden = false;

  try {
    const res = await fetch(`/predict?conf=${state.conf}&iou=${state.iou}`, {
      method: "POST", body,
    });
    if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
    render(await res.json());
  } catch (err) {
    $("empty").textContent = "Hata: " + err.message;
    $("empty").hidden = false;
  }
}

function render(d) {
  $("empty").hidden = true;
  $("stats").classList.add("fade-in");
  $("preview").src = d.annotated_image;
  $("filename").textContent = d.filename;
  $("canvas").hidden = false;
  $("legend").hidden = false;

  $("n-rbc").textContent = d.counts.RBC;
  $("n-wbc").textContent = d.counts.WBC;
  $("n-plt").textContent = d.counts.Platelets;
  $("stats").hidden = false;

  $("m-total").textContent = d.total;
  $("m-ratio").textContent = d.rbc_wbc_ratio ? d.rbc_wbc_ratio + " : 1" : "–";
  $("m-conf").textContent = d.mean_confidence.toFixed(2);
  $("meta").hidden = false;

  drawConfidenceChart(d.detections);
  drawSweepChart(d.detections, d.thresholds.conf);

  if (d.warning) {
    $("alert").textContent = d.warning;
    $("alert").hidden = false;
  } else {
    $("alert").hidden = true;
  }
}

let batchRows = [];

bindDrop($("drop-batch"), $("files"), async (files) => {
  if (!files.length) return;
  const body = new FormData();
  [...files].slice(0, 30).forEach((f) => body.append("files", f));

  $("batch-summary").textContent = "Analiz ediliyor…";
  $("batch-out").hidden = false;

  const res = await fetch(`/predict/batch?conf=${state.conf}&iou=${state.iou}`, {
    method: "POST", body,
  });
  const d = await res.json();
  batchRows = d.rows;
  renderBatch(d);
});

function renderBatch(d) {
  $("batch-summary").textContent =
    `${d.images} görsel · ortalama ${d.summary.RBC.mean} RBC, ` +
    `${d.summary.WBC.mean} WBC, ${d.summary.Platelets.mean} Platelets`;

  const head = "<tr><th>Dosya</th><th>Platelets</th><th>RBC</th><th>WBC</th>" +
               "<th>Toplam</th><th>RBC/WBC</th><th>Güven</th></tr>";
  const body = d.rows.map((r) =>
    `<tr><td>${r.filename}</td>` +
    `<td class="num">${r.Platelets}</td><td class="num">${r.RBC}</td>` +
    `<td class="num">${r.WBC}</td><td class="num">${r.total}</td>` +
    `<td class="num">${r.rbc_wbc_ratio ?? "–"}</td>` +
    `<td class="num">${r.mean_confidence.toFixed(2)}</td></tr>`
  ).join("");
  $("batch-table").innerHTML = head + body;
}

$("csv").addEventListener("click", () => {
  if (!batchRows.length) return;
  const cols = ["filename", "Platelets", "RBC", "WBC", "total", "rbc_wbc_ratio", "mean_confidence"];
  const csv = [cols.join(","), ...batchRows.map((r) => cols.map((c) => r[c] ?? "").join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = "blood_cell_counts.csv"; a.click();
  URL.revokeObjectURL(url);
});

let aboutLoaded = false;
async function loadAbout() {
  if (aboutLoaded) return;
  const d = await (await fetch("/info")).json();
  const pc = d.metrics.per_class;

  $("about-out").innerHTML = `
    <h3>Model</h3>
    <ul>
      <li>${d.architecture} · ${d.parameters.toLocaleString("tr-TR")} parametre · giriş ${d.input_size}px</li>
      <li>Sınıflar: ${d.classes.join(", ")}</li>
    </ul>
    <h3>Veri seti</h3>
    <ul>
      <li>${d.dataset.name} — ${d.dataset.source} (${d.dataset.license})</li>
      <li>${d.dataset.train_images} eğitim / ${d.dataset.val_images} doğrulama / ${d.dataset.test_images} test görseli</li>
    </ul>
    <h3>Test seti başarımı</h3>
    <div class="table-wrap"><table>
      <tr><th>Sınıf</th><th>Precision</th><th>Recall</th><th>mAP50</th></tr>
      ${Object.entries(pc).map(([k, v]) =>
        `<tr><td>${k}</td><td class="num">${v.precision}</td>` +
        `<td class="num">${v.recall}</td><td class="num">${v.mAP50}</td></tr>`).join("")}
      <tr><td><b>Genel</b></td><td class="num">–</td><td class="num">–</td>
          <td class="num"><b>${d.metrics.test.mAP50}</b></td></tr>
    </table></div>
    <h3>Bilinen sınırlar</h3>
    <ul>${d.limitations.map((l) => `<li>${l}</li>`).join("")}</ul>
  `;
  aboutLoaded = true;
}

const CLASS_COLOR = { RBC: "#C9736B", WBC: "#6B5B95", Platelets: "#E0A458" };

function drawConfidenceChart(detections) {
  const svg = $("conf-chart");
  if (!detections.length) { $("conf-chart-card").hidden = true; return; }

  const BINS = 10, W = 320, H = 120, PAD_L = 24, PAD_B = 18;
  const plotW = W - PAD_L - 8, plotH = H - PAD_B - 10;

  const series = {};
  Object.keys(CLASS_COLOR).forEach((k) => (series[k] = new Array(BINS).fill(0)));
  detections.forEach((d) => {
    const i = Math.min(BINS - 1, Math.floor(d.confidence * BINS));
    if (series[d.class_name]) series[d.class_name][i] += 1;
  });

  const max = Math.max(1, ...Object.values(series).flat());
  const bw = plotW / BINS;
  let out = "";

  for (let i = 0; i < BINS; i++) {
    let y = H - PAD_B;
    Object.entries(series).forEach(([name, arr]) => {
      if (!arr[i]) return;
      const h = (arr[i] / max) * plotH;
      y -= h;
      out += `<rect x="${(PAD_L + i * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" ` +
             `width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" ` +
             `fill="${CLASS_COLOR[name]}" rx="1"><title>${name}: ${arr[i]}</title></rect>`;
    });
  }

  out += `<line class="ax" x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - 8}" y2="${H - PAD_B}"/>`;
  [0, 0.5, 1].forEach((t) => {
    out += `<text class="ax-label" x="${PAD_L + t * plotW}" y="${H - 6}" ` +
           `text-anchor="middle">${t.toFixed(1)}</text>`;
  });
  out += `<text class="ax-label" x="2" y="16">${max}</text>`;

  svg.innerHTML = out;
  $("conf-chart-card").hidden = false;
}

function drawSweepChart(detections, current) {
  const svg = $("sweep-chart");
  if (!detections.length) { $("sweep-card").hidden = true; return; }

  const W = 320, H = 120, PAD_L = 28, PAD_B = 18;
  const plotW = W - PAD_L - 8, plotH = H - PAD_B - 10;
  const steps = 19;

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = 0.05 + (i / steps) * 0.9;
    points.push({ t, n: detections.filter((d) => d.confidence >= t).length });
  }

  const max = Math.max(1, points[0].n);
  const X = (t) => PAD_L + ((t - 0.05) / 0.9) * plotW;
  const Y = (n) => H - PAD_B - (n / max) * plotH;

  const path = points.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.n).toFixed(1)}`).join(" ");
  const nowN = detections.filter((d) => d.confidence >= current).length;

  let out = `<line class="ax" x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - 8}" y2="${H - PAD_B}"/>`;
  out += `<path d="${path}" fill="none" stroke="#2C7DA0" stroke-width="2"/>`;
  out += `<line x1="${X(current).toFixed(1)}" y1="10" x2="${X(current).toFixed(1)}" ` +
         `y2="${H - PAD_B}" stroke="#A3494E" stroke-width="1" stroke-dasharray="3 3"/>`;
  out += `<circle cx="${X(current).toFixed(1)}" cy="${Y(nowN).toFixed(1)}" r="3.5" fill="#A3494E"/>`;
  out += `<text class="ax-label" x="2" y="16">${max}</text>`;
  [0.1, 0.5, 0.9].forEach((t) => {
    out += `<text class="ax-label" x="${X(t)}" y="${H - 6}" text-anchor="middle">${t}</text>`;
  });

  svg.innerHTML = out;
  $("sweep-card").hidden = false;
}

bindDrop($("drop-scope"), $("file-scope"), async (files) => {
  if (!files.length) return;

  const body = new FormData();
  body.append("file", files[0]);

  $("scope-out").hidden = false;
  $("s-verdict").textContent = "Analiz ediliyor…";

  const res = await fetch("/predict?conf=0.25&iou=0.45", { method: "POST", body });
  if (!res.ok) {
    $("s-verdict").textContent = "Bu dosya okunamadı.";
    return;
  }
  const d = await res.json();

  $("scope-img").src = d.annotated_image;
  $("s-total").textContent = d.total;
  $("s-conf").textContent = d.mean_confidence.toFixed(2);

  $("s-counts").innerHTML = Object.entries(d.counts)
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  let verdict;
  if (d.total === 0) {
    verdict = "Model hiçbir şey bulamadı. Güven eşiği (0.25) tüm tahminleri elemiş " +
              "— bu iyi bir sonuç, ama modelin kapsam dışını anladığı anlamına gelmez.";
  } else if (d.mean_confidence < 0.4) {
    verdict = `Model ${d.total} kutu çizdi ancak ortalama güveni ${d.mean_confidence.toFixed(2)} ` +
              "— düşük skorlar tereddüdü gösteriyor. Yine de bir çıktı üretmek zorunda kaldı.";
  } else {
    verdict = `Model ${d.total} kutu çizdi ve ortalama güveni ${d.mean_confidence.toFixed(2)}. ` +
              "Kapsam dışı bir görselde bile emin görünebiliyor — güven skoru tek başına " +
              "sonucun geçerli olduğunun kanıtı değildir.";
  }
  $("s-verdict").textContent = verdict;
});
