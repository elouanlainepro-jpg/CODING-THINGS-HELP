// Client HTTP minimaliste pour le backend FastAPI.
const BASE = import.meta.env.VITE_API_URL || "";

export const assetUrl = (path) => (path ? `${BASE}${path}` : "");

async function parse(res) {
  if (res.ok) return res.json();
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body?.detail) {
      message = typeof body.detail === "string" ? body.detail : body.detail.map((d) => d.msg).join(", ");
    }
  } catch {
    /* réponse non JSON */
  }
  throw new Error(message);
}

const postJson = (url, body) =>
  fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(parse);

// XHR plutôt que fetch : on veut la progression de l'upload (vidéos lourdes).
function upload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${url}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body?.detail || `Erreur ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Backend injoignable (uvicorn tourne ?)"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export const api = {
  health: () => fetch(`${BASE}/api/health`).then(parse),
  uploadVideo: (file, onProgress) => upload("/api/videos", file, onProgress),
  uploadElement: (file) => upload("/api/elements", file),
  segment: (body) => postJson("/api/segment", body),
  replace: (body) => postJson("/api/replace", body),
  job: (id) => fetch(`${BASE}/api/jobs/${id}`).then(parse),
  gallery: () => fetch(`${BASE}/api/gallery`).then(parse),
  deleteClip: (id) => fetch(`${BASE}/api/gallery/${encodeURIComponent(id)}`, { method: "DELETE" }).then(parse),
};
