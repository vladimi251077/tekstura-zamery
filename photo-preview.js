(() => {
  const BUCKET = "measurement-photos";
  let clientPromise = null;

  async function getSupabaseClient() {
    if (clientPromise) return clientPromise;

    clientPromise = fetch("./app.js", { cache: "no-store" })
      .then((response) => response.text())
      .then((source) => {
        const url = source.match(/const\s+SUPABASE_URL\s*=\s*"([^"]+)"/i)?.[1];
        const key = source.match(/const\s+SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/i)?.[1];
        if (!url || !key || !window.supabase) return null;
        return window.supabase.createClient(url, key);
      })
      .catch(() => null);

    return clientPromise;
  }

  function extractFilePath(card) {
    const text = card.innerText || "";
    const match = text.match(/KZN-ZM-\d{4}-\d+\/[^\s]+\.(jpg|jpeg|png|webp|gif|heic|jfif)/i);
    return match?.[0] || null;
  }

  async function replaceCardPreview(card, client) {
    if (!card || card.dataset.previewLoaded === "1") return;
    const filePath = extractFilePath(card);
    if (!filePath) return;

    const previewBox = card.querySelector("div");
    if (!previewBox) return;

    card.dataset.previewLoaded = "1";
    previewBox.textContent = "Загрузка...";

    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60);
    if (error || !data?.signedUrl) {
      previewBox.textContent = "Фото";
      card.dataset.previewLoaded = "0";
      return;
    }

    previewBox.innerHTML = `<a href="${data.signedUrl}" target="_blank" rel="noopener"><img src="${data.signedUrl}" alt="Фото замера" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;" /></a>`;
  }

  async function refreshPhotoPreviews() {
    const client = await getSupabaseClient();
    if (!client) return;

    document.querySelectorAll(".photo-card").forEach((card) => {
      replaceCardPreview(card, client).catch(() => {});
    });
  }

  const observer = new MutationObserver(() => refreshPhotoPreviews());
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("load", refreshPhotoPreviews);
  document.addEventListener("click", () => setTimeout(refreshPhotoPreviews, 300));
  setInterval(refreshPhotoPreviews, 3000);
})();
